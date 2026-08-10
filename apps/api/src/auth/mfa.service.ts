import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { MfaChallengeVerification } from '@clycites/contracts';
import { ConfigService } from '@nestjs/config';
import { ROLES } from '@clycites/auth';
import * as OTPAuth from 'otpauth';

import type { ApiEnvironment } from '../config/environment.js';
import { DatabaseService } from '../database/database.service.js';

const encryptionAlgorithm = 'aes-256-gcm';

@Injectable()
export class MfaService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ConfigService) private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  async beginEnrollment(userId: string, sessionId: string) {
    const user = await this.database.client.user.findUnique({
      where: { id: userId },
      include: { memberships: { where: { status: 'ACTIVE' } } },
    });
    if (!user) throw new ForbiddenException('MFA enrollment unavailable');
    const eligible =
      user.platformRole === ROLES.PLATFORM_ADMIN ||
      user.memberships.some(({ role }) => role === ROLES.COOPERATIVE_ADMIN);
    if (!eligible) throw new ForbiddenException('MFA enrollment unavailable');
    if (user.mfaEnrolledAt) throw new ConflictException('MFA is already enrolled');

    const secret = new OTPAuth.Secret({ size: 20 });
    const challengeToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + this.config.get('AUTH_MFA_CHALLENGE_TTL_MINUTES', { infer: true }) * 60_000,
    );
    await this.database.client.mfaChallenge.create({
      data: {
        tokenHash: this.hashToken(challengeToken),
        userId,
        purpose: 'ENROLLMENT',
        pendingSecretEncrypted: this.encrypt(secret.base32),
        sessionId,
        attemptsRemaining: this.config.get('AUTH_MFA_CHALLENGE_MAX_ATTEMPTS', { infer: true }),
        expiresAt,
      },
    });
    const totp = this.totp(secret, user.email ?? userId);
    return {
      challengeToken,
      secret: secret.base32,
      uri: totp.toString(),
      expiresAt: expiresAt.toISOString(),
    };
  }

  async beginLogin(
    userId: string,
    details: { ipAddress?: string; userAgent?: string },
  ): Promise<{ mfaRequired: true; challengeToken: string; expiresAt: string }> {
    const challengeToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + this.config.get('AUTH_MFA_CHALLENGE_TTL_MINUTES', { infer: true }) * 60_000,
    );
    await this.database.client.mfaChallenge.create({
      data: {
        tokenHash: this.hashToken(challengeToken),
        userId,
        purpose: 'LOGIN',
        ...(details.ipAddress ? { ipAddress: details.ipAddress } : {}),
        ...(details.userAgent ? { userAgent: details.userAgent.slice(0, 512) } : {}),
        attemptsRemaining: this.config.get('AUTH_MFA_CHALLENGE_MAX_ATTEMPTS', { infer: true }),
        expiresAt,
      },
    });
    return { mfaRequired: true, challengeToken, expiresAt: expiresAt.toISOString() };
  }

  async beginRequiredEnrollment(userId: string, label: string) {
    const secret = new OTPAuth.Secret({ size: 20 });
    const challengeToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + this.config.get('AUTH_MFA_CHALLENGE_TTL_MINUTES', { infer: true }) * 60_000,
    );
    await this.database.client.mfaChallenge.create({
      data: {
        tokenHash: this.hashToken(challengeToken),
        userId,
        purpose: 'ENROLLMENT',
        pendingSecretEncrypted: this.encrypt(secret.base32),
        attemptsRemaining: this.config.get('AUTH_MFA_CHALLENGE_MAX_ATTEMPTS', { infer: true }),
        expiresAt,
      },
    });
    return {
      mfaRequired: true as const,
      enrollmentRequired: true as const,
      challengeToken,
      secret: secret.base32,
      uri: this.totp(secret, label).toString(),
      expiresAt: expiresAt.toISOString(),
    };
  }

  async confirmEnrollment(input: MfaChallengeVerification) {
    const challenge = await this.database.client.mfaChallenge.findUnique({
      where: { tokenHash: this.hashToken(input.challengeToken) },
      include: { user: true },
    });
    if (
      !challenge ||
      challenge.purpose !== 'ENROLLMENT' ||
      !challenge.pendingSecretEncrypted ||
      challenge.consumedAt ||
      challenge.expiresAt <= new Date() ||
      challenge.attemptsRemaining <= 0
    ) {
      throw new UnauthorizedException('Invalid MFA challenge');
    }
    const secret = this.decrypt(challenge.pendingSecretEncrypted);
    const valid =
      this.totp(
        OTPAuth.Secret.fromBase32(secret),
        challenge.user.email ?? challenge.userId,
      ).validate({ token: input.code, window: 1 }) !== null;
    if (!valid) {
      await this.database.client.mfaChallenge.update({
        where: { id: challenge.id },
        data: {
          attemptsRemaining: { decrement: 1 },
          ...(challenge.attemptsRemaining === 1 ? { consumedAt: new Date() } : {}),
        },
      });
      throw new UnauthorizedException('Invalid MFA code');
    }

    const recoveryCodes = Array.from({ length: 10 }, () => randomBytes(10).toString('base64url'));
    const enrollmentSessionId = challenge.sessionId;
    const now = new Date();
    await this.database.client.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: challenge.userId },
        data: { mfaSecretEncrypted: this.encrypt(secret), mfaEnrolledAt: now },
      });
      await transaction.mfaChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: now },
      });
      await transaction.mfaRecoveryCode.deleteMany({ where: { userId: challenge.userId } });
      await transaction.mfaRecoveryCode.createMany({
        data: recoveryCodes.map((code) => ({
          userId: challenge.userId,
          codeHash: this.hashToken(code),
        })),
      });
      if (enrollmentSessionId) {
        await transaction.session.updateMany({
          where: { userId: challenge.userId, id: { not: enrollmentSessionId }, revokedAt: null },
          data: { revokedAt: now },
        });
        await transaction.session.update({
          where: { id: enrollmentSessionId },
          data: { mfaSatisfiedAt: now, accessTokenValidAfter: now },
        });
      }
    });
    return { recoveryCodes };
  }

  async verifyLogin(input: MfaChallengeVerification): Promise<{ userId: string }> {
    const now = new Date();
    const challenge = await this.database.client.mfaChallenge.findUnique({
      where: { tokenHash: this.hashToken(input.challengeToken) },
      include: { user: true },
    });
    if (
      !challenge ||
      challenge.purpose !== 'LOGIN' ||
      challenge.consumedAt ||
      challenge.expiresAt <= now ||
      challenge.attemptsRemaining <= 0 ||
      !challenge.user.mfaSecretEncrypted ||
      !challenge.user.mfaEnrolledAt
    ) {
      throw new UnauthorizedException('Invalid MFA challenge');
    }

    const recoveryCode = await this.database.client.mfaRecoveryCode.findFirst({
      where: { userId: challenge.userId, codeHash: this.hashToken(input.code), usedAt: null },
    });
    const secret = this.decrypt(challenge.user.mfaSecretEncrypted);
    const validTotp =
      this.totp(
        OTPAuth.Secret.fromBase32(secret),
        challenge.user.email ?? challenge.userId,
      ).validate({ token: input.code, window: 1 }) !== null;
    if (!recoveryCode && !validTotp) {
      await this.database.client.mfaChallenge.update({
        where: { id: challenge.id },
        data: {
          attemptsRemaining: { decrement: 1 },
          ...(challenge.attemptsRemaining === 1 ? { consumedAt: now } : {}),
        },
      });
      throw new UnauthorizedException('Invalid MFA code');
    }

    await this.database.client.$transaction(async (transaction) => {
      const consumed = await transaction.mfaChallenge.updateMany({
        where: {
          id: challenge.id,
          consumedAt: null,
          expiresAt: { gt: now },
          attemptsRemaining: { gt: 0 },
        },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) throw new UnauthorizedException('Invalid MFA challenge');
      if (recoveryCode) {
        const used = await transaction.mfaRecoveryCode.updateMany({
          where: { id: recoveryCode.id, usedAt: null },
          data: { usedAt: now },
        });
        if (used.count !== 1) throw new UnauthorizedException('Invalid MFA code');
      }
    });
    return { userId: challenge.userId };
  }

  private totp(secret: OTPAuth.Secret, label: string): OTPAuth.TOTP {
    return new OTPAuth.TOTP({
      issuer: 'ClyCites',
      label,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });
  }

  private hashToken(token: string): string {
    return createHmac('sha256', this.config.get('AUTH_MFA_TOKEN_PEPPER', { infer: true }))
      .update(token)
      .digest('hex');
  }

  private encrypt(plaintext: string): string {
    const initializationVector = randomBytes(12);
    const cipher = createCipheriv(encryptionAlgorithm, this.encryptionKey(), initializationVector);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [
      'v1',
      initializationVector.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  private decrypt(envelope: string): string {
    const [version, initializationVector, authenticationTag, ciphertext, ...extra] =
      envelope.split('.');
    if (
      version !== 'v1' ||
      !initializationVector ||
      !authenticationTag ||
      ciphertext === undefined ||
      extra.length > 0
    ) {
      throw new Error('Invalid encrypted MFA secret');
    }
    const decipher = createDecipheriv(
      encryptionAlgorithm,
      this.encryptionKey(),
      Buffer.from(initializationVector, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(authenticationTag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  private encryptionKey(): Buffer {
    return Buffer.from(
      String(this.config.get('AUTH_MFA_ENCRYPTION_KEY_BASE64', { infer: true })),
      'base64',
    );
  }
}
