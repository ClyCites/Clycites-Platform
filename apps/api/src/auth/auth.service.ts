import { randomBytes } from 'node:crypto';

import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { argon2id, hash, verify } from 'argon2';
import { jwtVerify, SignJWT } from 'jose';
import { ROLE_PERMISSIONS, ROLES, type AuthenticatedPrincipal } from '@clycites/auth';
import type { CurrentUser, LoginRequest, LoginResponse } from '@clycites/contracts';

import { AuditService } from '../audit/audit.service.js';
import type { ApiEnvironment } from '../config/environment.js';
import { DatabaseService } from '../database/database.service.js';

interface RequestDetails {
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ConfigService) private readonly config: ConfigService<ApiEnvironment, true>,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async login(
    input: LoginRequest,
    details: RequestDetails,
  ): Promise<LoginResponse & { refreshToken: string }> {
    const user = await this.database.client.user.findUnique({ where: { email: input.email } });
    if (!user || !(await verify(user.passwordHash, input.password))) {
      await this.audit.create({
        action: 'AUTH_LOGIN_FAILED',
        entityType: 'Authentication',
        entityId: '00000000-0000-4000-8000-000000000000',
        requestId: details.requestId,
        metadata: { reason: 'invalid_credentials' },
      });
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.status !== 'ACTIVE' || user.deletedAt)
      throw new ForbiddenException('Account is not active');

    const expiresAt = new Date(
      Date.now() + this.config.get('AUTH_SESSION_TTL_DAYS', { infer: true }) * 86_400_000,
    );
    const sessionId = crypto.randomUUID();
    const refreshToken = this.createRefreshToken(sessionId);
    await this.database.client.$transaction(async (transaction) => {
      await transaction.session.create({
        data: {
          id: sessionId,
          userId: user.id,
          refreshTokenHash: (await hash(refreshToken, { type: argon2id })) as string,
          ...(input.deviceName ? { deviceName: input.deviceName } : {}),
          ...(details.ipAddress ? { ipAddress: details.ipAddress } : {}),
          ...(details.userAgent ? { userAgent: details.userAgent.slice(0, 512) } : {}),
          expiresAt,
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
    return { ...(await this.issueLoginResponse(user.id)), refreshToken };
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
    if (!(await verify(session.refreshTokenHash, refreshToken))) {
      await this.database.client.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Invalid refresh session');
    }
    if (session.user.status !== 'ACTIVE' || session.user.deletedAt)
      throw new ForbiddenException('Account is not active');

    const rotatedToken = this.createRefreshToken(session.id);
    await this.database.client.session.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: (await hash(rotatedToken, { type: argon2id })) as string,
        lastUsedAt: new Date(),
        ...(details.ipAddress ? { ipAddress: details.ipAddress } : {}),
      },
    });
    return { ...(await this.issueLoginResponse(session.userId)), refreshToken: rotatedToken };
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
    if (!session) throw new UnauthorizedException('Session not found');
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
      if (!verified.payload.sub) throw new UnauthorizedException('Invalid access token');
      return await this.principalForUser(verified.payload.sub);
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

  private async issueLoginResponse(userId: string): Promise<LoginResponse> {
    const expiresIn = this.config.get('AUTH_ACCESS_TOKEN_TTL_MINUTES', { infer: true }) * 60;
    const accessToken = await new SignJWT({ type: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuer('clycites-api')
      .setAudience('clycites-web')
      .setIssuedAt()
      .setExpirationTime(`${expiresIn}s`)
      .sign(this.signingKey());
    return { accessToken, expiresIn, user: await this.currentUser(userId) };
  }

  private async principalForUser(userId: string): Promise<AuthenticatedPrincipal> {
    const user = await this.currentUser(userId);
    const platformRole: { platformRole: typeof ROLES.PLATFORM_ADMIN } | Record<string, never> =
      user.platformRole === ROLES.PLATFORM_ADMIN ? { platformRole: ROLES.PLATFORM_ADMIN } : {};
    return {
      subjectId: user.id,
      sessionId: '',
      ...platformRole,
      memberships: new Map(
        user.organizations.map((organization) => [organization.organizationId, organization.role]),
      ),
    };
  }

  private createRefreshToken(sessionId: string): string {
    return `${sessionId}.${randomBytes(32).toString('base64url')}`;
  }

  private signingKey(): Uint8Array {
    return new TextEncoder().encode(this.config.get('AUTH_ACCESS_TOKEN_SECRET', { infer: true }));
  }
}
