import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { argon2id, hash, verify } from 'argon2';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type {
  AcceptUserInvitation,
  FarmerAccountResetRedeem,
  IssueUserInvitation,
  PasswordChange,
  PasswordResetConfirm,
  PasswordResetRequest,
} from '@clycites/contracts';

import { AuditService } from '../audit/audit.service.js';
import type { ApiEnvironment } from '../config/environment.js';
import { DatabaseService } from '../database/database.service.js';
import {
  CREDENTIAL_DELIVERY_JOB,
  PLATFORM_EVENTS_QUEUE,
  REDIS_CLIENT,
} from '../queue/queue.constants.js';
import { LoginLimiterService } from './login-limiter.service.js';
import { IdentifierService } from './identifier.service.js';
import { PasswordPolicyService } from './password-policy.service.js';

interface RequestContext {
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class CredentialLifecycleService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ConfigService) private readonly config: ConfigService<ApiEnvironment, true>,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PasswordPolicyService) private readonly passwords: PasswordPolicyService,
    @Inject(LoginLimiterService) private readonly limiter: LoginLimiterService,
    @Inject(IdentifierService) private readonly identifiers: IdentifierService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(PLATFORM_EVENTS_QUEUE) private readonly deliveryQueue: Queue,
  ) {}

  async issueFarmerInvitation(
    organizationId: string,
    farmerId: string,
    invitedByUserId: string,
    requestId: string,
  ) {
    await this.assertInvitationRate(invitedByUserId);
    const token = this.createToken();
    const expiresAt = new Date(
      Date.now() + this.config.get('AUTH_INVITATION_TTL_DAYS', { infer: true }) * 86_400_000,
    );
    const invitation = await this.database.client.$transaction(async (transaction) => {
      const membership = await transaction.farmerOrganizationMembership.findUnique({
        where: { farmerId_organizationId: { farmerId, organizationId } },
        include: { farmer: true },
      });
      const farmer = membership?.farmer;
      if (
        !membership ||
        membership.status !== 'ACTIVE' ||
        !farmer ||
        farmer.status !== 'ACTIVE' ||
        farmer.deletedAt
      ) {
        throw new BadRequestException('Farmer is not active in this organization');
      }
      if (farmer.userId) throw new ConflictException('Farmer account already exists');

      const username = this.identifiers.normalizeUsername(farmer.farmerNumber);
      const email = farmer.email?.trim().toLowerCase() ?? null;
      const phone = farmer.primaryPhone
        ? this.identifiers.normalizePhone(farmer.primaryPhone)
        : null;
      const candidateIdentifiers = [
        { kind: 'USERNAME' as const, loginKind: 'username' as const, value: username },
        ...(email ? [{ kind: 'EMAIL' as const, loginKind: 'email' as const, value: email }] : []),
        ...(phone ? [{ kind: 'PHONE' as const, loginKind: 'phone' as const, value: phone }] : []),
      ];
      const retired = await transaction.retiredIdentifier.findFirst({
        where: {
          claimableAt: { gt: new Date() },
          OR: candidateIdentifiers.map((identifier) => ({
            kind: identifier.kind,
            valueHash: this.limiter.hashIdentifier(identifier.loginKind, identifier.value),
          })),
        },
      });
      if (retired) throw new ConflictException('Identifier is temporarily unavailable');
      const user = await transaction.user.create({
        data: {
          username,
          usernameSetAt: new Date(),
          email,
          phone,
          passwordHash: null,
          firstName: farmer.firstName,
          lastName: farmer.lastName,
          status: 'INVITED',
          accountClass: 'FARMER',
        },
      });
      await transaction.farmer.update({ where: { id: farmerId }, data: { userId: user.id } });
      const created = await transaction.userInvitation.create({
        data: {
          tokenHash: this.hashToken(token),
          userId: user.id,
          organizationId,
          invitedByUserId,
          accountClass: 'FARMER',
          expiresAt,
        },
      });
      await this.audit.create(
        {
          organizationId,
          actorUserId: invitedByUserId,
          action: 'FARMER_ACCOUNT_INVITATION_ISSUED',
          entityType: 'UserInvitation',
          entityId: created.id,
          requestId,
          metadata: { farmerId },
        },
        transaction,
      );
      return created;
    });
    return { id: invitation.id, activationCode: token, expiresAt: expiresAt.toISOString() };
  }

  async initiateFarmerAccountReset(
    organizationId: string,
    farmerId: string,
    initiatedByUserId: string,
    requestId: string,
  ) {
    await this.assertFarmerResetRate(organizationId, initiatedByUserId, requestId);
    const code = this.createToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60_000);
    const reset = await this.database.client.$transaction(async (transaction) => {
      const membership = await transaction.farmerOrganizationMembership.findUnique({
        where: { farmerId_organizationId: { farmerId, organizationId } },
        include: { farmer: true },
      });
      if (
        !membership ||
        membership.status !== 'ACTIVE' ||
        membership.farmer.status !== 'ACTIVE' ||
        membership.farmer.deletedAt ||
        !membership.farmer.userId
      ) {
        throw new BadRequestException('Farmer account is not active in this organization');
      }
      await transaction.farmerAccountReset.updateMany({
        where: { farmerId, redeemedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const created = await transaction.farmerAccountReset.create({
        data: {
          codeHash: this.hashToken(code),
          farmerId,
          initiatedByUserId,
          organizationId,
          expiresAt,
        },
      });
      await this.audit.create(
        {
          organizationId,
          actorUserId: initiatedByUserId,
          action: 'FARMER_ACCOUNT_RESET_INITIATED',
          entityType: 'FarmerAccountReset',
          entityId: created.id,
          requestId,
          metadata: { farmerId },
        },
        transaction,
      );
      return created;
    });
    return { id: reset.id, resetCode: code, expiresAt: expiresAt.toISOString() };
  }

  async redeemFarmerAccountReset(input: FarmerAccountResetRedeem, requestId: string) {
    const reset = await this.database.client.farmerAccountReset.findUnique({
      where: { codeHash: this.hashToken(input.code) },
      include: {
        farmer: { include: { user: true } },
        initiatedBy: true,
        organization: true,
      },
    });
    if (
      !reset ||
      reset.redeemedAt ||
      reset.revokedAt ||
      reset.expiresAt <= new Date() ||
      reset.farmer.status !== 'ACTIVE' ||
      reset.farmer.deletedAt ||
      !reset.farmer.user ||
      reset.farmer.user.status !== 'ACTIVE' ||
      reset.farmer.user.deletedAt
    ) {
      throw new BadRequestException('Invalid or expired reset code');
    }
    this.passwords.validatePassword(input.password, 'FARMER');
    const passwordHash = (await hash(input.password, { type: argon2id })) as string;
    const redeemedAt = new Date();
    await this.database.client.$transaction(async (transaction) => {
      const claimed = await transaction.farmerAccountReset.updateMany({
        where: {
          id: reset.id,
          redeemedAt: null,
          revokedAt: null,
          expiresAt: { gt: redeemedAt },
        },
        data: { redeemedAt },
      });
      if (claimed.count !== 1) throw new BadRequestException('Invalid or expired reset code');
      await transaction.user.update({
        where: { id: reset.farmer.userId! },
        data: { passwordHash },
      });
      await transaction.session.updateMany({
        where: { userId: reset.farmer.userId!, revokedAt: null },
        data: { revokedAt: redeemedAt },
      });
      await transaction.notificationDelivery.create({
        data: {
          organizationId: reset.organizationId,
          recipientType: 'USER',
          recipientReference: reset.farmer.userId!,
          channel: 'IN_APP',
          templateCode: 'FARMER_ACCOUNT_RESET',
          templateVersion: 1,
          parameters: {
            message: `Your account was reset by ${reset.initiatedBy.firstName} ${reset.initiatedBy.lastName} at ${reset.organization.name} on ${redeemedAt.toISOString()}`,
            resetId: reset.id,
          },
          status: 'DELIVERED',
          provider: 'console',
          deliveredAt: redeemedAt,
          deduplicationKey: `farmer-account-reset:${reset.id}`,
        },
      });
      await this.audit.create(
        {
          organizationId: reset.organizationId,
          actorUserId: reset.farmer.userId!,
          action: 'FARMER_ACCOUNT_RESET_REDEEMED',
          entityType: 'FarmerAccountReset',
          entityId: reset.id,
          requestId,
          metadata: { farmerId: reset.farmerId, initiatedByUserId: reset.initiatedByUserId },
        },
        transaction,
      );
    });
    return { reset: true };
  }

  async issueInvitation(
    organizationId: string,
    input: IssueUserInvitation,
    invitedByUserId: string,
    requestId: string,
  ) {
    await this.assertInvitationRate(invitedByUserId);
    const token = this.createToken();
    const expiresAt = new Date(
      Date.now() + this.config.get('AUTH_INVITATION_TTL_DAYS', { infer: true }) * 86_400_000,
    );
    const invitation = await this.database.client.$transaction(async (transaction) => {
      const existing = await transaction.user.findUnique({ where: { email: input.email } });
      if (existing && (existing.status !== 'INVITED' || existing.deletedAt)) {
        throw new ConflictException('Account already exists');
      }
      if (existing && existing.accountClass !== input.accountClass) {
        throw new ConflictException('Invitation account class does not match');
      }
      const user =
        existing ??
        (await transaction.user.create({
          data: {
            email: input.email,
            passwordHash: null,
            firstName: input.firstName,
            lastName: input.lastName,
            status: 'INVITED',
            accountClass: input.accountClass,
          },
        }));
      const currentMembership = await transaction.organizationMembership.findUnique({
        where: { organizationId_userId: { organizationId, userId: user.id } },
      });
      if (currentMembership?.status === 'ACTIVE') {
        throw new ConflictException('User is already a member of this organization');
      }
      if (currentMembership) {
        await transaction.organizationMembership.update({
          where: { id: currentMembership.id },
          data: { role: input.role, status: 'INVITED', invitedByUserId, joinedAt: null },
        });
      } else {
        await transaction.organizationMembership.create({
          data: {
            organizationId,
            userId: user.id,
            role: input.role,
            status: 'INVITED',
            invitedByUserId,
          },
        });
      }
      await transaction.userInvitation.updateMany({
        where: {
          organizationId,
          userId: user.id,
          acceptedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      const created = await transaction.userInvitation.create({
        data: {
          tokenHash: this.hashToken(token),
          userId: user.id,
          organizationId,
          invitedByUserId,
          accountClass: input.accountClass,
          expiresAt,
        },
      });
      await this.audit.create(
        {
          organizationId,
          actorUserId: invitedByUserId,
          action: 'USER_INVITATION_ISSUED',
          entityType: 'UserInvitation',
          entityId: created.id,
          requestId,
          metadata: { accountClass: input.accountClass, role: input.role },
        },
        transaction,
      );
      return created;
    });
    await this.enqueueDelivery('INVITATION', invitation.id, invitation.userId);
    return {
      id: invitation.id,
      expiresAt: invitation.expiresAt.toISOString(),
      deliveryQueued: true,
    };
  }

  async reinvite(
    organizationId: string,
    invitationId: string,
    invitedByUserId: string,
    requestId: string,
  ) {
    const prior = await this.database.client.userInvitation.findFirst({
      where: { id: invitationId, organizationId },
      include: { user: true },
    });
    if (!prior || prior.acceptedAt || prior.user.status !== 'INVITED') {
      throw new BadRequestException('Invitation cannot be reissued');
    }
    await this.assertInvitationRate(invitedByUserId);
    const token = this.createToken();
    const expiresAt = new Date(
      Date.now() + this.config.get('AUTH_INVITATION_TTL_DAYS', { infer: true }) * 86_400_000,
    );
    const invitation = await this.database.client.$transaction(async (transaction) => {
      await transaction.userInvitation.updateMany({
        where: {
          organizationId,
          userId: prior.userId,
          acceptedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      await this.audit.create(
        {
          organizationId,
          actorUserId: invitedByUserId,
          action: 'USER_INVITATION_REVOKED',
          entityType: 'UserInvitation',
          entityId: prior.id,
          requestId,
        },
        transaction,
      );
      const created = await transaction.userInvitation.create({
        data: {
          tokenHash: this.hashToken(token),
          userId: prior.userId,
          organizationId,
          invitedByUserId,
          accountClass: prior.accountClass,
          expiresAt,
        },
      });
      await this.audit.create(
        {
          organizationId,
          actorUserId: invitedByUserId,
          action: 'USER_INVITATION_REISSUED',
          entityType: 'UserInvitation',
          entityId: created.id,
          requestId,
        },
        transaction,
      );
      return created;
    });
    await this.enqueueDelivery('INVITATION', invitation.id, invitation.userId);
    return {
      id: invitation.id,
      expiresAt: invitation.expiresAt.toISOString(),
      deliveryQueued: true,
    };
  }

  async acceptInvitation(input: AcceptUserInvitation, requestId: string) {
    const invitation = await this.database.client.userInvitation.findUnique({
      where: { tokenHash: this.hashToken(input.token) },
    });
    if (!invitation || !this.isLive(invitation)) {
      throw new BadRequestException('Invalid or expired invitation');
    }
    this.passwords.validatePassword(input.password, invitation.accountClass);
    const passwordHash = (await hash(input.password, { type: argon2id })) as string;
    await this.database.client.$transaction(async (transaction) => {
      const claimed = await transaction.userInvitation.updateMany({
        where: {
          id: invitation.id,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count !== 1) throw new BadRequestException('Invalid or expired invitation');
      const activated = await transaction.user.updateMany({
        where: { id: invitation.userId, status: 'INVITED', deletedAt: null },
        data: { passwordHash, status: 'ACTIVE', accountClass: invitation.accountClass },
      });
      if (activated.count !== 1)
        throw new BadRequestException('Invitation cannot activate account');
      if (invitation.accountClass === 'STAFF') {
        await transaction.organizationMembership.update({
          where: {
            organizationId_userId: {
              organizationId: invitation.organizationId,
              userId: invitation.userId,
            },
          },
          data: { status: 'ACTIVE', joinedAt: new Date() },
        });
      }
      await this.audit.create(
        {
          organizationId: invitation.organizationId,
          actorUserId: invitation.userId,
          action: 'USER_INVITATION_ACCEPTED',
          entityType: 'UserInvitation',
          entityId: invitation.id,
          requestId,
        },
        transaction,
      );
    });
    return { accepted: true };
  }

  async requestPasswordReset(input: PasswordResetRequest, context: RequestContext) {
    const identifierHash = this.limiter.hashIdentifier('email', input.email);
    const user = await this.database.client.user.findUnique({ where: { email: input.email } });
    const retryAfter = await this.limiter.retryAfter('email', identifierHash, user?.id);
    if (retryAfter === 0) {
      await this.limiter.recordFailure('email', identifierHash, user?.id);
      if (
        user?.status === 'ACTIVE' &&
        !user.deletedAt &&
        user.emailVerifiedAt &&
        !user.platformRole
      ) {
        const token =
          user.accountClass === 'FARMER'
            ? randomInt(0, 1_000_000).toString().padStart(6, '0')
            : this.createToken();
        const reset = await this.database.client.$transaction(async (transaction) => {
          await transaction.passwordReset.updateMany({
            where: { userId: user.id, consumedAt: null, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          const created = await transaction.passwordReset.create({
            data: {
              tokenHash: this.hashToken(token),
              userId: user.id,
              accountClass: user.accountClass,
              expiresAt: new Date(
                Date.now() +
                  (user.accountClass === 'FARMER'
                    ? 10
                    : this.config.get('AUTH_PASSWORD_RESET_TTL_MINUTES', { infer: true })) *
                    60_000,
              ),
            },
          });
          await this.audit.create(
            {
              actorType: 'SYSTEM',
              action: 'AUTH_PASSWORD_RESET_REQUESTED',
              entityType: 'PasswordReset',
              entityId: created.id,
              requestId: context.requestId,
              metadata: { identifierHash },
            },
            transaction,
          );
          return created;
        });
        await this.enqueueDelivery('PASSWORD_RESET', reset.id, user.id);
      }
    }
    return { accepted: true };
  }

  async confirmPasswordReset(input: PasswordResetConfirm, requestId: string) {
    const reset =
      'token' in input
        ? await this.database.client.passwordReset.findUnique({
            where: { tokenHash: this.hashToken(input.token) },
          })
        : await this.database.client.passwordReset.findFirst({
            where: {
              accountClass: 'FARMER',
              consumedAt: null,
              revokedAt: null,
              user: { email: input.email, emailVerifiedAt: { not: null } },
            },
            orderBy: { createdAt: 'desc' },
          });
    if (!reset || !this.isLive(reset) || reset.attemptCount >= 5) {
      throw new BadRequestException('Invalid or expired reset token');
    }
    if ('code' in input) {
      const expected = Buffer.from(reset.tokenHash, 'hex');
      const submitted = Buffer.from(this.hashToken(input.code), 'hex');
      if (!timingSafeEqual(expected, submitted)) {
        const attemptCount = reset.attemptCount + 1;
        await this.database.client.passwordReset.update({
          where: { id: reset.id },
          data: { attemptCount, ...(attemptCount >= 5 ? { revokedAt: new Date() } : {}) },
        });
        throw new BadRequestException('Invalid or expired reset token');
      }
    }
    try {
      this.passwords.validatePassword(input.password, reset.accountClass);
    } catch (error) {
      const attemptCount = reset.attemptCount + 1;
      await this.database.client.passwordReset.update({
        where: { id: reset.id },
        data: { attemptCount, ...(attemptCount >= 5 ? { revokedAt: new Date() } : {}) },
      });
      throw error;
    }
    const passwordHash = (await hash(input.password, { type: argon2id })) as string;
    await this.database.client.$transaction(async (transaction) => {
      const claimed = await transaction.passwordReset.updateMany({
        where: {
          id: reset.id,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          attemptCount: { lt: 5 },
        },
        data: { consumedAt: new Date() },
      });
      if (claimed.count !== 1) throw new BadRequestException('Invalid or expired reset token');
      await transaction.user.update({ where: { id: reset.userId }, data: { passwordHash } });
      await transaction.session.updateMany({
        where: { userId: reset.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.create(
        {
          actorUserId: reset.userId,
          action: 'AUTH_PASSWORD_RESET_COMPLETED',
          entityType: 'PasswordReset',
          entityId: reset.id,
          requestId,
        },
        transaction,
      );
    });
    return { reset: true };
  }

  async changePassword(
    userId: string,
    sessionId: string,
    input: PasswordChange,
    requestId: string,
  ) {
    const user = await this.database.client.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash || !(await verify(user.passwordHash, input.currentPassword))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    this.passwords.validatePassword(input.newPassword, user.accountClass);
    const passwordHash = (await hash(input.newPassword, { type: argon2id })) as string;
    await this.database.client.$transaction(async (transaction) => {
      await transaction.user.update({ where: { id: userId }, data: { passwordHash } });
      await transaction.session.updateMany({
        where: { userId, id: { not: sessionId }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.create(
        {
          actorUserId: userId,
          action: 'AUTH_PASSWORD_CHANGED',
          entityType: 'User',
          entityId: userId,
          requestId,
        },
        transaction,
      );
    });
    return { changed: true };
  }

  async requestEmailVerification(userId: string, requestId: string) {
    const user = await this.database.client.user.findUnique({ where: { id: userId } });
    if (!user?.email || user.deletedAt) throw new BadRequestException('Email is unavailable');
    const email = user.email;
    const token = this.createToken();
    const verification = await this.database.client.$transaction(async (transaction) => {
      await transaction.emailVerification.updateMany({
        where: { userId, consumedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const created = await transaction.emailVerification.create({
        data: {
          tokenHash: this.hashToken(token),
          userId,
          email,
          expiresAt: new Date(
            Date.now() +
              this.config.get('AUTH_EMAIL_VERIFICATION_TTL_HOURS', { infer: true }) * 3_600_000,
          ),
        },
      });
      await this.audit.create(
        {
          actorUserId: userId,
          action: 'AUTH_EMAIL_VERIFICATION_REQUESTED',
          entityType: 'EmailVerification',
          entityId: created.id,
          requestId,
        },
        transaction,
      );
      return created;
    });
    await this.enqueueDelivery('EMAIL_VERIFICATION', verification.id, userId);
    return { accepted: true };
  }

  async confirmEmailVerification(token: string, requestId: string) {
    const verification = await this.database.client.emailVerification.findUnique({
      where: { tokenHash: this.hashToken(token) },
    });
    if (!verification || !this.isLive(verification)) {
      throw new BadRequestException('Invalid or expired verification token');
    }
    await this.database.client.$transaction(async (transaction) => {
      const claimed = await transaction.emailVerification.updateMany({
        where: {
          id: verification.id,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });
      if (claimed.count !== 1)
        throw new BadRequestException('Invalid or expired verification token');
      const verified = await transaction.user.updateMany({
        where: { id: verification.userId, email: verification.email, deletedAt: null },
        data: { emailVerifiedAt: new Date() },
      });
      if (verified.count !== 1) throw new BadRequestException('Email address has changed');
      await this.audit.create(
        {
          actorUserId: verification.userId,
          action: 'AUTH_EMAIL_VERIFIED',
          entityType: 'EmailVerification',
          entityId: verification.id,
          requestId,
        },
        transaction,
      );
    });
    return { verified: true };
  }

  private createToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private hashToken(token: string): string {
    return createHmac('sha256', this.config.get('AUTH_CREDENTIAL_TOKEN_PEPPER', { infer: true }))
      .update(token)
      .digest('hex');
  }

  private isLive(record: {
    expiresAt: Date;
    revokedAt: Date | null;
    acceptedAt?: Date | null;
    consumedAt?: Date | null;
  }): boolean {
    return (
      record.expiresAt > new Date() && !record.revokedAt && !record.acceptedAt && !record.consumedAt
    );
  }

  private async assertInvitationRate(invitedByUserId: string): Promise<void> {
    const day = new Date().toISOString().slice(0, 10);
    const key = `auth:invitation:inviter:${invitedByUserId}:${day}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 172_800);
    if (count > this.config.get('AUTH_INVITATION_MAX_PER_INVITER_DAY', { infer: true })) {
      throw new HttpException('Invitation daily limit exceeded', 429);
    }
  }

  private async assertFarmerResetRate(
    organizationId: string,
    initiatedByUserId: string,
    requestId: string,
  ): Promise<void> {
    const day = new Date().toISOString().slice(0, 10);
    const key = `auth:farmer-reset:staff:${initiatedByUserId}:${day}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 172_800);
    if (count > this.config.get('AUTH_FARMER_RESET_MAX_PER_STAFF_DAY', { infer: true })) {
      await this.audit.create({
        organizationId,
        actorUserId: initiatedByUserId,
        action: 'FARMER_ACCOUNT_RESET_RATE_EXCEEDED',
        entityType: 'User',
        entityId: initiatedByUserId,
        requestId,
        metadata: { count },
      });
      throw new HttpException('Farmer account reset daily limit exceeded', 429);
    }
  }

  private async enqueueDelivery(kind: string, credentialId: string, userId: string): Promise<void> {
    await this.deliveryQueue.add(CREDENTIAL_DELIVERY_JOB, { kind, credentialId, userId });
  }
}
