import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verify } from 'argon2';
import { decodeProtectedHeader, jwtVerify, SignJWT } from 'jose';
import { ROLE_PERMISSIONS, ROLES, type AuthenticatedPrincipal } from '@clycites/auth';
import type {
  CurrentUser,
  DeviceTokenRequest,
  LoginRequest,
  LoginResponse,
  MfaChallengeVerification,
} from '@clycites/contracts';

import { AuditService } from '../audit/audit.service.js';
import type { ApiEnvironment } from '../config/environment.js';
import { DatabaseService } from '../database/database.service.js';
import { LoginLockedOutException } from './login-locked-out.exception.js';
import { LoginLimiterService } from './login-limiter.service.js';
import { DeviceCredentialService } from './device-credential.service.js';
import { MfaService } from './mfa.service.js';

interface RequestDetails {
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
}

const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,p=4,t=3$osADcL/dC7zotVGoR9qutQ$vb26p94beXL+PPHBSD1sMe6BTtxo05Mvuw4R5kgxHpg';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ConfigService) private readonly config: ConfigService<ApiEnvironment, true>,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(LoginLimiterService) private readonly loginLimiter: LoginLimiterService,
    @Inject(DeviceCredentialService) private readonly deviceCredentials: DeviceCredentialService,
    @Inject(MfaService) private readonly mfa: MfaService,
  ) {}

  async login(input: LoginRequest, details: RequestDetails) {
    const normalizedIdentifier = input.email.trim().toLowerCase();
    const identifierHash = this.loginLimiter.hashIdentifier('email', normalizedIdentifier);
    const user = await this.database.client.user.findUnique({
      where: { email: normalizedIdentifier },
    });
    const retryAfter = await this.loginLimiter.retryAfter('email', identifierHash, user?.id);
    if (retryAfter > 0) throw new LoginLockedOutException(retryAfter);

    const passwordMatches = await verify(user?.passwordHash ?? DUMMY_PASSWORD_HASH, input.password);
    if (!user || !passwordMatches) {
      const failure = await this.loginLimiter.recordFailure('email', identifierHash, user?.id);
      const metadata = {
        reason: 'invalid_credentials',
        identifierHash,
        ipAddress: details.ipAddress ?? null,
        userAgent: details.userAgent?.slice(0, 512) ?? null,
      };
      await this.audit.create({
        action: 'AUTH_LOGIN_FAILED',
        entityType: 'Authentication',
        entityId: '00000000-0000-4000-8000-000000000000',
        requestId: details.requestId,
        metadata,
      });
      if (failure.lockedOut) {
        await this.audit.create({
          action: 'AUTH_LOGIN_LOCKED_OUT',
          entityType: 'Authentication',
          entityId: '00000000-0000-4000-8000-000000000000',
          requestId: details.requestId,
          metadata: { ...metadata, retryAfterSeconds: failure.retryAfterSeconds },
        });
      }
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.status !== 'ACTIVE' || user.deletedAt)
      throw new ForbiddenException('Account is not active');
    if (
      this.config.get('AUTH_REQUIRE_VERIFIED_EMAIL', { infer: true }) &&
      user.email &&
      !user.emailVerifiedAt
    ) {
      throw new ForbiddenException('Email verification is required');
    }
    await this.loginLimiter.reset('email', identifierHash, user.id);
    if (user.platformRole === ROLES.PLATFORM_ADMIN && !user.mfaEnrolledAt) {
      return this.mfa.beginRequiredEnrollment(user.id, user.email ?? user.id);
    }
    if (user.mfaEnrolledAt) return this.mfa.beginLogin(user.id, details);

    const expiresAt = new Date(
      Date.now() + this.config.get('AUTH_SESSION_TTL_DAYS', { infer: true }) * 86_400_000,
    );
    const sessionId = crypto.randomUUID();
    const refreshToken = this.createRefreshToken(sessionId);
    const accessTokenValidAfter = new Date();
    await this.database.client.$transaction(async (transaction) => {
      await transaction.session.create({
        data: {
          id: sessionId,
          userId: user.id,
          refreshTokenHash: this.hashRefreshToken(refreshToken),
          ...(input.deviceName ? { deviceName: input.deviceName } : {}),
          ...(details.ipAddress ? { ipAddress: details.ipAddress } : {}),
          ...(details.userAgent ? { userAgent: details.userAgent.slice(0, 512) } : {}),
          expiresAt,
          accessTokenValidAfter,
        },
      });
      await transaction.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await this.audit.create(
        {
          actorUserId: user.id,
          action: 'AUTH_LOGIN_SUCCEEDED',
          entityType: 'Session',
          entityId: sessionId,
          requestId: details.requestId,
          metadata: { deviceName: input.deviceName ?? null },
        },
        transaction,
      );
    });
    return { ...(await this.issueLoginResponse(user.id, sessionId)), refreshToken };
  }

  async refresh(
    refreshToken: string,
    details: RequestDetails,
  ): Promise<LoginResponse & { refreshToken: string }> {
    return this.refreshSession(refreshToken, details, 'browser');
  }

  async deviceToken(
    input: DeviceTokenRequest,
    details: RequestDetails,
  ): Promise<LoginResponse & { refreshToken: string }> {
    if ('refreshToken' in input) return this.refreshSession(input.refreshToken, details, 'device');
    const device = await this.database.client.registeredDevice.findUnique({
      where: { devicePublicId: input.devicePublicId },
      include: {
        assignedUser: true,
        organization: true,
      },
    });
    if (
      !device ||
      device.status !== 'ACTIVE' ||
      device.revokedAt ||
      device.organization.status !== 'ACTIVE' ||
      device.organization.deletedAt ||
      device.assignedUser.status !== 'ACTIVE' ||
      device.assignedUser.deletedAt ||
      device.assignedUser.mfaEnrolledAt ||
      !this.deviceCredentials.matches(device.deviceTokenHash, input.deviceToken)
    ) {
      throw new UnauthorizedException('Invalid device credentials');
    }
    const membership = await this.database.client.organizationMembership.findFirst({
      where: {
        organizationId: device.organizationId,
        userId: device.assignedUserId,
        status: 'ACTIVE',
      },
    });
    if (!membership) throw new UnauthorizedException('Invalid device credentials');

    const sessionId = crypto.randomUUID();
    const refreshToken = this.createRefreshToken(sessionId);
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.config.get('AUTH_DEVICE_SESSION_TTL_DAYS', { infer: true }) * 86_400_000,
    );
    await this.database.client.$transaction(async (transaction) => {
      await transaction.session.create({
        data: {
          id: sessionId,
          userId: device.assignedUserId,
          deviceId: device.id,
          deviceName: device.name,
          refreshTokenHash: this.hashRefreshToken(refreshToken),
          ...(details.ipAddress ? { ipAddress: details.ipAddress } : {}),
          ...(details.userAgent ? { userAgent: details.userAgent.slice(0, 512) } : {}),
          expiresAt,
          accessTokenValidAfter: now,
        },
      });
      await transaction.registeredDevice.update({
        where: { id: device.id },
        data: { lastSeenAt: now },
      });
      await this.audit.create(
        {
          organizationId: device.organizationId,
          actorUserId: device.assignedUserId,
          action: 'DEVICE_SESSION_CREATED',
          entityType: 'Session',
          entityId: sessionId,
          requestId: details.requestId,
          metadata: { deviceId: device.id },
        },
        transaction,
      );
    });
    return {
      ...(await this.issueLoginResponse(device.assignedUserId, sessionId, device.organizationId)),
      refreshToken,
    };
  }

  async completeMfaLogin(
    input: MfaChallengeVerification,
    details: RequestDetails,
  ): Promise<LoginResponse & { refreshToken: string }> {
    const { userId } = await this.mfa.verifyLogin(input);
    const sessionId = crypto.randomUUID();
    const refreshToken = this.createRefreshToken(sessionId);
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.config.get('AUTH_SESSION_TTL_DAYS', { infer: true }) * 86_400_000,
    );
    await this.database.client.$transaction(async (transaction) => {
      await transaction.session.create({
        data: {
          id: sessionId,
          userId,
          refreshTokenHash: this.hashRefreshToken(refreshToken),
          ...(details.ipAddress ? { ipAddress: details.ipAddress } : {}),
          ...(details.userAgent ? { userAgent: details.userAgent.slice(0, 512) } : {}),
          expiresAt,
          accessTokenValidAfter: now,
          mfaSatisfiedAt: now,
        },
      });
      await transaction.user.update({ where: { id: userId }, data: { lastLoginAt: now } });
      await this.audit.create(
        {
          actorUserId: userId,
          action: 'AUTH_MFA_LOGIN_SUCCEEDED',
          entityType: 'Session',
          entityId: sessionId,
          requestId: details.requestId,
        },
        transaction,
      );
    });
    return { ...(await this.issueLoginResponse(userId, sessionId)), refreshToken };
  }

  private async refreshSession(
    refreshToken: string,
    details: RequestDetails,
    channel: 'browser' | 'device',
  ): Promise<LoginResponse & { refreshToken: string }> {
    const sessionId = refreshToken.split('.', 1)[0];
    if (!sessionId) throw new UnauthorizedException('Invalid refresh session');
    const session = await this.database.client.session.findUnique({
      where: { id: sessionId },
      include: { user: true, device: true },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Invalid refresh session');
    }
    if (session.user.mfaEnrolledAt && !session.mfaSatisfiedAt) {
      throw new UnauthorizedException('MFA required');
    }
    if (
      (channel === 'browser' && session.deviceId) ||
      (channel === 'device' &&
        (!session.device || session.device.status !== 'ACTIVE' || session.device.revokedAt))
    ) {
      throw new UnauthorizedException('Invalid refresh session');
    }
    if (!this.refreshTokenMatches(session.refreshTokenHash, refreshToken)) {
      await this.database.client.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Invalid refresh session');
    }
    if (session.user.status !== 'ACTIVE' || session.user.deletedAt)
      throw new ForbiddenException('Account is not active');

    const rotatedToken = this.createRefreshToken(session.id);
    const accessTokenValidAfter = new Date();
    await this.database.client.session.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: this.hashRefreshToken(rotatedToken),
        lastUsedAt: new Date(),
        accessTokenValidAfter,
        ...(details.ipAddress ? { ipAddress: details.ipAddress } : {}),
      },
    });
    return {
      ...(await this.issueLoginResponse(
        session.userId,
        session.id,
        session.device?.organizationId,
      )),
      refreshToken: rotatedToken,
    };
  }

  async logout(refreshToken: string | undefined, userId: string, requestId: string): Promise<void> {
    const sessionId = refreshToken?.split('.', 1)[0];
    if (!sessionId) return;
    const session = await this.database.client.session.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session || session.revokedAt) return;
    await this.database.client.$transaction(async (transaction) => {
      await transaction.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      await this.audit.create(
        {
          actorUserId: userId,
          action: 'SESSION_REVOKED',
          entityType: 'Session',
          entityId: session.id,
          requestId,
        },
        transaction,
      );
    });
  }

  async logoutAll(userId: string, requestId: string): Promise<void> {
    await this.database.client.$transaction(async (transaction) => {
      await transaction.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.create(
        {
          actorUserId: userId,
          action: 'ALL_SESSIONS_REVOKED',
          entityType: 'User',
          entityId: userId,
          requestId,
        },
        transaction,
      );
    });
  }

  async revokeSession(userId: string, sessionId: string, requestId: string): Promise<void> {
    const session = await this.database.client.session.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) throw new NotFoundException('Session not found');
    await this.database.client.$transaction(async (transaction) => {
      await transaction.session.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() },
      });
      await this.audit.create(
        {
          actorUserId: userId,
          action: 'SESSION_REVOKED',
          entityType: 'Session',
          entityId: sessionId,
          requestId,
        },
        transaction,
      );
    });
  }

  listSessions(userId: string) {
    return this.database.client.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        deviceName: true,
        ipAddress: true,
        userAgent: true,
        expiresAt: true,
        revokedAt: true,
        mfaSatisfiedAt: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });
  }

  async authenticateAccessToken(token: string): Promise<AuthenticatedPrincipal> {
    try {
      const { kid } = decodeProtectedHeader(token);
      const verificationKey = this.accessTokenKeys().find((key) => key.kid === kid);
      if (!verificationKey) throw new UnauthorizedException('Invalid access token');
      const verified = await jwtVerify(token, this.encodeSecret(verificationKey.secret), {
        issuer: 'clycites-api',
        audience: 'clycites-web',
        clockTolerance: this.config.get('AUTH_JWT_CLOCK_TOLERANCE_SECONDS', { infer: true }),
      });
      if (
        verified.payload.type !== 'access' ||
        !verified.payload.sub ||
        !verified.payload.jti ||
        typeof verified.payload.iat !== 'number'
      ) {
        throw new UnauthorizedException('Invalid access token');
      }
      return await this.principalForSession(
        verified.payload.jti,
        verified.payload.sub,
        verified.payload.iat,
      );
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  async currentUser(userId: string, organizationId?: string): Promise<CurrentUser> {
    const user = await this.database.client.user.findUnique({
      where: { id: userId },
      include: { memberships: { where: { status: 'ACTIVE' }, include: { organization: true } } },
    });
    if (!user || user.status !== 'ACTIVE' || user.deletedAt)
      throw new UnauthorizedException('Account unavailable');
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      platformRole: user.platformRole,
      organizations: user.memberships
        .filter(
          (membership) =>
            membership.organization.status === 'ACTIVE' &&
            !membership.organization.deletedAt &&
            (!organizationId || membership.organizationId === organizationId),
        )
        .map((membership) => {
          const role = membership.role;
          return {
            organizationId: membership.organizationId,
            organizationName: membership.organization.name,
            role,
            permissions: [...ROLE_PERMISSIONS[role]],
          };
        }),
    };
  }

  private async issueLoginResponse(
    userId: string,
    sessionId: string,
    organizationId?: string,
  ): Promise<LoginResponse> {
    const expiresIn = this.config.get('AUTH_ACCESS_TOKEN_TTL_MINUTES', { infer: true }) * 60;
    const issuedAt = Date.now() / 1000;
    const signingKey = this.accessTokenKeys()[0];
    if (!signingKey) throw new Error('At least one access-token key must be configured');
    const accessToken = await new SignJWT({ type: 'access' })
      .setProtectedHeader({ alg: 'HS256', kid: signingKey.kid })
      .setSubject(userId)
      .setJti(sessionId)
      .setIssuer('clycites-api')
      .setAudience('clycites-web')
      .setIssuedAt(issuedAt)
      .setExpirationTime(`${expiresIn}s`)
      .sign(this.encodeSecret(signingKey.secret));
    return { accessToken, expiresIn, user: await this.currentUser(userId, organizationId) };
  }

  private async principalForSession(
    sessionId: string,
    userId: string,
    issuedAt: number,
  ): Promise<AuthenticatedPrincipal> {
    const session = await this.database.client.session.findUnique({
      where: { id: sessionId },
      select: {
        userId: true,
        deviceId: true,
        revokedAt: true,
        mfaSatisfiedAt: true,
        expiresAt: true,
        accessTokenValidAfter: true,
        device: {
          select: { organizationId: true, status: true, revokedAt: true },
        },
        user: {
          select: {
            id: true,
            status: true,
            deletedAt: true,
            platformRole: true,
            mfaEnrolledAt: true,
            memberships: {
              where: { status: 'ACTIVE' },
              select: {
                organizationId: true,
                role: true,
                organization: { select: { status: true, deletedAt: true } },
              },
            },
          },
        },
      },
    });
    if (
      !session ||
      session.userId !== userId ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      (session.user.mfaEnrolledAt && !session.mfaSatisfiedAt) ||
      (session.deviceId &&
        (!session.device || session.device.status !== 'ACTIVE' || session.device.revokedAt)) ||
      issuedAt < session.accessTokenValidAfter.getTime() / 1000
    ) {
      throw new UnauthorizedException('Invalid access token');
    }
    const user = session.user;
    if (user.status !== 'ACTIVE' || user.deletedAt)
      throw new UnauthorizedException('Account unavailable');
    const platformRole: { platformRole: typeof ROLES.PLATFORM_ADMIN } | Record<string, never> =
      !session.deviceId && user.platformRole === ROLES.PLATFORM_ADMIN
        ? { platformRole: ROLES.PLATFORM_ADMIN }
        : {};
    const devicePrincipal: { deviceId: string } | Record<string, never> = session.deviceId
      ? { deviceId: session.deviceId }
      : {};
    return {
      subjectId: user.id,
      sessionId,
      ...platformRole,
      ...devicePrincipal,
      memberships: new Map(
        user.memberships
          .filter(
            (membership) =>
              membership.organization.status === 'ACTIVE' &&
              !membership.organization.deletedAt &&
              (!session.device || membership.organizationId === session.device.organizationId),
          )
          .map((membership) => [membership.organizationId, membership.role]),
      ),
    };
  }

  private createRefreshToken(sessionId: string): string {
    return `${sessionId}.${randomBytes(32).toString('base64url')}`;
  }

  private hashRefreshToken(refreshToken: string): string {
    return createHmac('sha256', this.config.get('AUTH_REFRESH_TOKEN_PEPPER', { infer: true }))
      .update(refreshToken)
      .digest('hex');
  }

  private refreshTokenMatches(storedHash: string, refreshToken: string): boolean {
    const expected = Buffer.from(storedHash, 'hex');
    const actual = Buffer.from(this.hashRefreshToken(refreshToken), 'hex');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private accessTokenKeys(): ApiEnvironment['AUTH_ACCESS_TOKEN_KEYS'] {
    return this.config.get('AUTH_ACCESS_TOKEN_KEYS', { infer: true });
  }

  private encodeSecret(secret: string): Uint8Array {
    return new TextEncoder().encode(secret);
  }
}
