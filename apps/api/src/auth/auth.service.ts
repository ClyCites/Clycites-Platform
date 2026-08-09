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
import { jwtVerify, SignJWT } from 'jose';
import { ROLE_PERMISSIONS, ROLES, type AuthenticatedPrincipal } from '@clycites/auth';
import type { CurrentUser, LoginRequest, LoginResponse } from '@clycites/contracts';

import { AuditService } from '../audit/audit.service.js';
import type { ApiEnvironment } from '../config/environment.js';
import { DatabaseService } from '../database/database.service.js';
import { LoginLockedOutException } from './login-locked-out.exception.js';
import { LoginLimiterService } from './login-limiter.service.js';

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
  ) {}

  async login(
    input: LoginRequest,
    details: RequestDetails,
  ): Promise<LoginResponse & { refreshToken: string }> {
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
    await this.loginLimiter.reset('email', identifierHash, user.id);

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
    const sessionId = refreshToken.split('.', 1)[0];
    if (!sessionId) throw new UnauthorizedException('Invalid refresh session');
    const session = await this.database.client.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
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
      ...(await this.issueLoginResponse(session.userId, session.id)),
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
        lastUsedAt: true,
        createdAt: true,
      },
    });
  }

  async authenticateAccessToken(token: string): Promise<AuthenticatedPrincipal> {
    try {
      const verified = await jwtVerify(token, this.signingKey(), {
        issuer: 'clycites-api',
        audience: 'clycites-web',
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

  async currentUser(userId: string): Promise<CurrentUser> {
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
            membership.organization.status === 'ACTIVE' && !membership.organization.deletedAt,
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

  private async issueLoginResponse(userId: string, sessionId: string): Promise<LoginResponse> {
    const expiresIn = this.config.get('AUTH_ACCESS_TOKEN_TTL_MINUTES', { infer: true }) * 60;
    const issuedAt = Date.now() / 1000;
    const accessToken = await new SignJWT({ type: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setJti(sessionId)
      .setIssuer('clycites-api')
      .setAudience('clycites-web')
      .setIssuedAt(issuedAt)
      .setExpirationTime(`${expiresIn}s`)
      .sign(this.signingKey());
    return { accessToken, expiresIn, user: await this.currentUser(userId) };
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
        revokedAt: true,
        expiresAt: true,
        accessTokenValidAfter: true,
        user: {
          select: {
            id: true,
            status: true,
            deletedAt: true,
            platformRole: true,
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
      issuedAt < session.accessTokenValidAfter.getTime() / 1000
    ) {
      throw new UnauthorizedException('Invalid access token');
    }
    const user = session.user;
    if (user.status !== 'ACTIVE' || user.deletedAt)
      throw new UnauthorizedException('Account unavailable');
    const platformRole: { platformRole: typeof ROLES.PLATFORM_ADMIN } | Record<string, never> =
      user.platformRole === ROLES.PLATFORM_ADMIN ? { platformRole: ROLES.PLATFORM_ADMIN } : {};
    return {
      subjectId: user.id,
      sessionId,
      ...platformRole,
      memberships: new Map(
        user.memberships
          .filter(
            (membership) =>
              membership.organization.status === 'ACTIVE' && !membership.organization.deletedAt,
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

  private signingKey(): Uint8Array {
    return new TextEncoder().encode(this.config.get('AUTH_ACCESS_TOKEN_SECRET', { infer: true }));
  }
}
