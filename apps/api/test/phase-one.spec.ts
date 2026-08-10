import 'reflect-metadata';

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createDatabaseClient } from '@clycites/database';
import * as argon2 from 'argon2';
import type { Redis } from 'ioredis';
import { decodeJwt, SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { DatabaseService } from '../src/database/database.service.js';
import { REDIS_CLIENT } from '../src/queue/queue.constants.js';
import { loginForTest } from './auth-test-helper.js';

vi.mock('argon2', async (importOriginal) => {
  const actual = await importOriginal<typeof argon2>();
  return { ...actual, verify: vi.fn(actual.verify) };
});

const database = createDatabaseClient();
let recordedQueries: string[] | undefined;
const applicationDatabase = database.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        recordedQueries?.push(`${model}.${operation}`);
        return query(args);
      },
    },
  },
});
const cooperativeId = '00000000-0000-4000-8000-000000000201';
const collectionAgentId = '00000000-0000-4000-8000-000000000103';
const financeOfficerId = '00000000-0000-4000-8000-000000000104';
const testOrganizationId = '10000000-0000-4000-8000-000000000201';
const farmerNumber = 'TEST-PHASE1-0001';
const password = process.env.SEED_STAFF_PASSWORD ?? 'ClyCites-local-2026!';

describe.sequential('Phase 1 API', () => {
  let app: INestApplication;
  let platformToken: string;
  let adminToken: string;
  let agentToken: string;
  let farmerId: string;
  let qrIdentityId: string;
  let publicId: string;

  beforeAll(async () => {
    await database.user.update({ where: { id: collectionAgentId }, data: { status: 'ACTIVE' } });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(DatabaseService)
      .useValue({ client: applicationDatabase })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    platformToken = await login('platform.admin@clycites.local');
    adminToken = await login('cooperative.admin@clycites.local');
    agentToken = await login('collection.agent@clycites.local');
  });

  afterAll(async () => {
    await database.auditEvent.deleteMany({
      where: { OR: [{ organizationId: testOrganizationId }, { entityId: farmerId }] },
    });
    await database.outboxEvent.deleteMany({
      where: { OR: [{ aggregateId: testOrganizationId }, { aggregateId: farmerId }] },
    });
    if (farmerId) {
      await database.farmerQrIdentity.deleteMany({ where: { farmerId } });
      await database.farmerConsent.deleteMany({ where: { farmerId } });
      await database.farm.deleteMany({ where: { farmerId } });
      await database.farmerOrganizationMembership.deleteMany({ where: { farmerId } });
      await database.farmer.deleteMany({ where: { id: farmerId } });
    }
    await database.organization.deleteMany({ where: { id: testOrganizationId } });
    await database.session.deleteMany({
      where: {
        userId: {
          in: [
            '00000000-0000-4000-8000-000000000101',
            '00000000-0000-4000-8000-000000000102',
            collectionAgentId,
            financeOfficerId,
          ],
        },
      },
    });
    await app.close();
    await database.$disconnect();
  });

  it('logs in without exposing credential hashes and authenticates access tokens', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'cooperative.admin@clycites.local', password })
      .expect(201);

    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|refreshTokenHash/);
    expect(setCookieHeader(response)).toContain('Path=/api;');
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${response.body.data.accessToken}`)
      .expect(200);
  });

  it('rejects an access token immediately after logout', async () => {
    const loginResponse = await performLogin('cooperative.admin@clycites.local');
    const accessToken = loginResponse.body.data.accessToken as string;

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('authorization', `Bearer ${accessToken}`)
      .set('cookie', cookie(loginResponse))
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${accessToken}`)
      .expect(401);
  });

  it('rejects an access token immediately after logout-all', async () => {
    const loginResponse = await performLogin('buyer@clycites.local');
    const accessToken = loginResponse.body.data.accessToken as string;

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout-all')
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${accessToken}`)
      .expect(401);
  });

  it('rejects an access token immediately after revoking its session', async () => {
    const loginResponse = await performLogin('cooperative.admin@clycites.local');
    const accessToken = loginResponse.body.data.accessToken as string;
    const sessionId = sessionIdFromToken(accessToken);

    await request(app.getHttpServer())
      .delete(`/api/v1/auth/sessions/${sessionId}`)
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${accessToken}`)
      .expect(401);
  });

  it('returns 404 when revoking a session that does not exist', async () => {
    const loginResponse = await performLogin('cooperative.admin@clycites.local');
    await request(app.getHttpServer())
      .delete('/api/v1/auth/sessions/00000000-0000-4000-8000-000000000099')
      .set('authorization', `Bearer ${loginResponse.body.data.accessToken as string}`)
      .expect(404);
  });

  it('returns 200 without a revocation audit when logout has no cookie', async () => {
    const loginResponse = await performLogin('cooperative.admin@clycites.local');
    const accessToken = loginResponse.body.data.accessToken as string;
    const sessionId = sessionIdFromToken(accessToken);
    const before = await database.auditEvent.count({
      where: { action: 'SESSION_REVOKED', entityId: sessionId },
    });

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(
      await database.auditEvent.count({
        where: { action: 'SESSION_REVOKED', entityId: sessionId },
      }),
    ).toBe(before);
  });

  it('rejects a token whose session belongs to a different user', async () => {
    const loginResponse = await performLogin('cooperative.admin@clycites.local');
    const sessionId = sessionIdFromToken(loginResponse.body.data.accessToken as string);
    const mismatchedToken = await accessTokenFor(financeOfficerId, sessionId);

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${mismatchedToken}`)
      .expect(401);
  });

  it('rejects an access token when its session has expired', async () => {
    const loginResponse = await performLogin('cooperative.admin@clycites.local');
    const accessToken = loginResponse.body.data.accessToken as string;
    await database.session.update({
      where: { id: sessionIdFromToken(accessToken) },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${accessToken}`)
      .expect(401);
  });

  it('keeps the session jti across refresh and rejects the previous access token', async () => {
    const loginResponse = await performLogin('cooperative.admin@clycites.local');
    const originalAccessToken = loginResponse.body.data.accessToken as string;
    const refreshResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('cookie', cookie(loginResponse))
      .expect(201);
    const rotatedAccessToken = refreshResponse.body.data.accessToken as string;

    expect(sessionIdFromToken(rotatedAccessToken)).toBe(sessionIdFromToken(originalAccessToken));
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${originalAccessToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${rotatedAccessToken}`)
      .expect(200);
  });

  it('authenticates a bearer token with one database query', async () => {
    const loginResponse = await performLogin('cooperative.admin@clycites.local');
    const accessToken = loginResponse.body.data.accessToken as string;
    recordedQueries = [];

    try {
      await request(app.getHttpServer())
        .get('/api/v1/auth/sessions')
        .set('authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(recordedQueries).toEqual(['Session.findUnique', 'Session.findMany']);
    } finally {
      recordedQueries = undefined;
    }
  });

  it('rejects invalid credentials and suspended users generically', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'cooperative.admin@clycites.local', password: 'incorrect' })
      .expect(401);
    await database.user.update({ where: { id: collectionAgentId }, data: { status: 'SUSPENDED' } });
    try {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: 'collection.agent@clycites.local', password })
        .expect(403);
    } finally {
      await database.user.update({ where: { id: collectionAgentId }, data: { status: 'ACTIVE' } });
    }
  });

  it('verifies exactly one password hash for existing and missing accounts', async () => {
    const verifyMock = vi.mocked(argon2.verify);
    verifyMock.mockClear();
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'cooperative.admin@clycites.local', password: 'incorrect' })
      .expect(401);
    expect(verifyMock).toHaveBeenCalledTimes(1);

    verifyMock.mockClear();
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'missing-account@clycites.local', password: 'incorrect' })
      .expect(401);
    expect(verifyMock).toHaveBeenCalledTimes(1);
  });

  it('uses the dummy hash once when an invited user has no password', async () => {
    const userId = '00000000-0000-4000-8000-000000000190';
    const email = 'invited-without-password@clycites.local';
    await database.$executeRaw`
      INSERT INTO "User" (
        "id", "email", "passwordHash", "firstName", "lastName", "status", "createdAt", "updatedAt"
      ) VALUES (
        ${userId}::uuid, ${email}, NULL, 'Invited', 'User', 'INVITED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `;
    try {
      const verifyMock = vi.mocked(argon2.verify);
      verifyMock.mockClear();

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: email, password: 'not-yet-set' })
        .expect(401);

      expect(verifyMock).toHaveBeenCalledTimes(1);
    } finally {
      await database.user.delete({ where: { id: userId } });
    }
  });

  it('rejects an active user without a password under the named check constraint', async () => {
    await expect(
      database.$executeRaw`
        INSERT INTO "User" (
          "id", "email", "passwordHash", "firstName", "lastName", "status", "createdAt", "updatedAt"
        ) VALUES (
          '00000000-0000-4000-8000-000000000191'::uuid,
          'active-without-password@clycites.local',
          NULL,
          'Active',
          'User',
          'ACTIVE',
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `,
    ).rejects.toThrow(/User_active_requires_password/);
  });

  it('locks existing and missing identifiers identically after five failures', async () => {
    await clearLoginLimiter();
    try {
      const existing = await lockIdentifier('buyer@clycites.local', 'wrong-existing-password');
      await clearLoginLimiter();
      const missing = await lockIdentifier(
        'unknown-login@clycites.local',
        'wrong-missing-password',
      );

      expect(existing.status).toBe(429);
      expect(missing.status).toBe(429);
      expect(existing.headers['retry-after']).toBe('60');
      expect(missing.headers['retry-after']).toBe('60');
      expect(existing.body.error).toEqual(missing.body.error);
    } finally {
      await clearLoginLimiter();
    }
  });

  it('resets identifier and user counters after successful authentication', async () => {
    await clearLoginLimiter();
    try {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ identifier: 'buyer@clycites.local', password: 'incorrect' })
          .expect(401);
      }
      await performLogin('buyer@clycites.local');
      expect(await loginLimiterKeys()).toEqual([]);

      for (let attempt = 0; attempt < 4; attempt += 1) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ identifier: 'buyer@clycites.local', password: 'incorrect' })
          .expect(401);
      }
      await performLogin('buyer@clycites.local');
    } finally {
      await clearLoginLimiter();
    }
  });

  it('escalates lockout windows to one hour and never makes them permanent', async () => {
    await clearLoginLimiter();
    try {
      const retryAfter: string[] = [];
      for (let level = 0; level < 5; level += 1) {
        const locked = await lockIdentifier(
          'progressive-lockout@clycites.local',
          'wrong-progressive-password',
        );
        retryAfter.push(locked.headers['retry-after'] as string);
        await removeLoginLocks();
      }
      expect(retryAfter).toEqual(['60', '300', '900', '3600', '3600']);
    } finally {
      await clearLoginLimiter();
    }
  });

  it('audits failed and locked-out logins without raw credentials', async () => {
    await clearLoginLimiter();
    const email = 'audit-target@clycites.local';
    const attemptedPassword = 'never-store-this-password';
    try {
      const locked = await lockIdentifier(email, attemptedPassword, 'wp3-audit-agent');
      const events = await database.auditEvent.findMany({
        where: {
          requestId: { in: locked.requestIds },
          action: { in: ['AUTH_LOGIN_FAILED', 'AUTH_LOGIN_LOCKED_OUT'] },
        },
        orderBy: { createdAt: 'asc' },
      });
      const failed = events.find((event) => event.action === 'AUTH_LOGIN_FAILED');
      const lockout = events.find((event) => event.action === 'AUTH_LOGIN_LOCKED_OUT');
      const serialized = JSON.stringify(events);

      expect(failed?.metadata).toMatchObject({
        reason: 'invalid_credentials',
        identifierHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        ipAddress: expect.any(String),
        userAgent: 'wp3-audit-agent',
      });
      expect(lockout).toBeDefined();
      expect(serialized).not.toContain(email);
      expect(serialized).not.toContain(attemptedPassword);
    } finally {
      await clearLoginLimiter();
    }
  });

  it('rotates refresh tokens and rejects reuse of the previous token', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'cooperative.admin@clycites.local', password })
      .expect(201);
    const originalCookie = cookie(loginResponse);
    const originalSessionId = refreshTokenFromCookie(originalCookie).split('.', 1)[0];
    if (!originalSessionId) throw new Error('Refresh session id missing');
    const originalSession = await database.session.findUniqueOrThrow({
      where: { id: originalSessionId },
    });
    expect(originalSession.refreshTokenHash).toMatch(/^[a-f0-9]{64}$/);
    const refreshResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('cookie', originalCookie)
      .expect(201);
    expect(cookie(refreshResponse)).not.toBe(originalCookie);
    const rotatedSession = await database.session.findUniqueOrThrow({
      where: { id: originalSessionId },
    });
    expect(rotatedSession.refreshTokenHash).toMatch(/^[a-f0-9]{64}$/);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('cookie', originalCookie)
      .expect(401);
  });

  it('creates organizations as a platform administrator and rejects cross-organization access', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('authorization', `Bearer ${platformToken}`)
      .send({
        name: 'Phase One Test Cooperative',
        slug: 'phase-one-test-cooperative',
        type: 'COOPERATIVE',
        status: 'ACTIVE',
        registrationNumber: null,
        phone: null,
        email: null,
        district: 'Gulu',
        subCounty: null,
        address: null,
      })
      .expect(201);
    const created = await database.organization.findUniqueOrThrow({
      where: { slug: 'phase-one-test-cooperative' },
    });
    await database.organization.update({
      where: { id: created.id },
      data: { id: testOrganizationId },
    });
    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${testOrganizationId}/farmers`)
      .set('authorization', `Bearer ${agentToken}`)
      .expect(403);
  });

  it('enforces membership, role, uniqueness, and last-administrator invariants', async () => {
    const agentMembership = await database.organizationMembership.findUniqueOrThrow({
      where: {
        organizationId_userId: { organizationId: cooperativeId, userId: collectionAgentId },
      },
    });
    const financeMembership = await database.organizationMembership.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId: cooperativeId, userId: financeOfficerId } },
    });
    const administratorMembership = await database.organizationMembership.findFirstOrThrow({
      where: { organizationId: cooperativeId, role: 'COOPERATIVE_ADMIN', status: 'ACTIVE' },
    });
    const existingPoint = await database.collectionPoint.findFirstOrThrow({
      where: { organizationId: cooperativeId },
    });

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/members`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ userId: collectionAgentId, role: 'COLLECTION_AGENT', status: 'ACTIVE' })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/collection-points`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Duplicate Code',
        code: existingPoint.code,
        district: 'Kasese',
        status: 'ACTIVE',
        timezone: 'Africa/Kampala',
        subCounty: null,
        parish: null,
        village: null,
        latitude: existingPoint.latitude?.toString(),
        longitude: existingPoint.longitude?.toString(),
      })
      .expect(409);
    await request(app.getHttpServer())
      .delete(`/api/v1/organizations/${cooperativeId}/members/${administratorMembership.id}`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(409);

    await database.organizationMembership.update({
      where: { id: agentMembership.id },
      data: { status: 'SUSPENDED' },
    });
    try {
      await request(app.getHttpServer())
        .get(`/api/v1/organizations/${cooperativeId}/farmers`)
        .set('authorization', `Bearer ${agentToken}`)
        .expect(403);
    } finally {
      await database.organizationMembership.update({
        where: { id: agentMembership.id },
        data: { status: 'ACTIVE' },
      });
    }

    await database.organizationMembership.update({
      where: { id: financeMembership.id },
      data: { role: 'BUYER' },
    });
    try {
      const buyerToken = await login('finance.officer@clycites.local');
      await request(app.getHttpServer())
        .get(`/api/v1/organizations/${cooperativeId}/farmers`)
        .set('authorization', `Bearer ${buyerToken}`)
        .expect(403);
    } finally {
      await database.organizationMembership.update({
        where: { id: financeMembership.id },
        data: { role: 'FINANCE_OFFICER' },
      });
    }
  });

  it('registers a farmer, farm, consent, membership, QR, audit, and outbox atomically', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/farmers`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        farmerNumber,
        firstName: 'Test',
        lastName: 'Farmer',
        district: 'Kasese',
        membershipNumber: 'TEST-MEMBER-0001',
        initialFarm: {
          name: 'Test Farm',
          district: 'Kasese',
          latitude: '0.080000',
          longitude: '29.720000',
          locationMethod: 'DECLARED',
          totalArea: '1.2500',
          areaUnit: 'ACRE',
        },
        initialConsents: [
          { consentType: 'DATA_PROCESSING', policyVersion: 'test-v1', captureMethod: 'CHECKBOX' },
        ],
        issueQrIdentity: true,
      })
      .expect(201);
    farmerId = response.body.data.id;
    const [farmCount, consentCount, membershipCount, qr, auditCount, outboxCount] =
      await Promise.all([
        database.farm.count({ where: { farmerId } }),
        database.farmerConsent.count({ where: { farmerId } }),
        database.farmerOrganizationMembership.count({
          where: { farmerId, organizationId: cooperativeId },
        }),
        database.farmerQrIdentity.findFirstOrThrow({ where: { farmerId, status: 'ACTIVE' } }),
        database.auditEvent.count({ where: { entityId: farmerId } }),
        database.outboxEvent.count({ where: { aggregateId: farmerId } }),
      ]);
    qrIdentityId = qr.id;
    publicId = qr.publicId;
    expect([farmCount, consentCount, membershipCount]).toEqual([1, 1, 1]);
    expect(auditCount).toBeGreaterThan(0);
    expect(outboxCount).toBeGreaterThan(0);
    expect(publicId).toMatch(/^fq1_[A-Za-z0-9_-]{32}$/);
    expect(publicId).not.toContain(farmerNumber);
  });

  it('does not leave partial records when nested registration conflicts', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/farmers`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        farmerNumber: 'TEST-PHASE1-ROLLBACK',
        firstName: 'Rollback',
        lastName: 'Test',
        district: 'Kasese',
        membershipNumber: 'TEST-MEMBER-0001',
        initialFarm: {
          name: 'Should Roll Back',
          district: 'Kasese',
          latitude: '0.081000',
          longitude: '29.721000',
          locationMethod: 'DECLARED',
          totalArea: '2.0000',
          areaUnit: 'ACRE',
        },
        issueQrIdentity: true,
      })
      .expect(409);
    expect(await database.farmer.count({ where: { farmerNumber: 'TEST-PHASE1-ROLLBACK' } })).toBe(
      0,
    );
  });

  it('returns only the permitted collection profile and enforces QR state changes', async () => {
    const lookup = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${cooperativeId}/farmer-lookup/${publicId}`)
      .set('authorization', `Bearer ${agentToken}`)
      .expect(200);
    expect(lookup.body.data).toMatchObject({ farmerId, farmerNumber });
    expect(lookup.body.data).not.toHaveProperty('primaryPhone');
    expect(lookup.body.data).not.toHaveProperty('latitude');
    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${cooperativeId}/farmer-lookup/${publicId}`)
      .expect(401);

    const replacement = await request(app.getHttpServer())
      .post(
        `/api/v1/organizations/${cooperativeId}/farmers/${farmerId}/qr-identities/${qrIdentityId}/replace`,
      )
      .set('authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${cooperativeId}/farmer-lookup/${publicId}`)
      .set('authorization', `Bearer ${agentToken}`)
      .expect(404);
    const replacementId = replacement.body.data.id;
    const replacementPublicId = replacement.body.data.publicId;
    await request(app.getHttpServer())
      .post(
        `/api/v1/organizations/${cooperativeId}/farmers/${farmerId}/qr-identities/${replacementId}/revoke`,
      )
      .set('authorization', `Bearer ${adminToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${cooperativeId}/farmer-lookup/${replacementPublicId}`)
      .set('authorization', `Bearer ${agentToken}`)
      .expect(404);
  });

  async function login(email: string): Promise<string> {
    if (email === 'platform.admin@clycites.local') return loginForTest(app, email, password);
    const response = await performLogin(email);
    return response.body.data.accessToken as string;
  }

  function performLogin(email: string) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: email, password })
      .expect(201);
  }

  function sessionIdFromToken(token: string): string {
    const sessionId = decodeJwt(token).jti;
    if (!sessionId) throw new Error('Access token jti missing');
    return sessionId;
  }

  function accessTokenFor(userId: string, sessionId: string): Promise<string> {
    const secret =
      process.env.AUTH_ACCESS_TOKEN_SECRET ?? 'local-only-access-token-secret-change-me';
    return new SignJWT({ type: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setJti(sessionId)
      .setIssuer('clycites-api')
      .setAudience('clycites-web')
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode(secret));
  }

  async function lockIdentifier(email: string, attemptedPassword: string, userAgent?: string) {
    const requestIds: string[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('user-agent', userAgent ?? 'wp3-lockout-test')
        .send({ identifier: email, password: attemptedPassword })
        .expect(401);
      requestIds.push(response.body.meta.requestId as string);
    }
    const locked = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('user-agent', userAgent ?? 'wp3-lockout-test')
      .send({ identifier: email, password: attemptedPassword });
    requestIds.push(locked.body.meta.requestId as string);
    return { status: locked.status, headers: locked.headers, body: locked.body, requestIds };
  }

  async function loginLimiterKeys(): Promise<string[]> {
    return app.get<Redis>(REDIS_CLIENT).keys('auth:login:*');
  }

  async function clearLoginLimiter(): Promise<void> {
    const redis = app.get<Redis>(REDIS_CLIENT);
    const keys = await loginLimiterKeys();
    if (keys.length > 0) await redis.del(...keys);
  }

  async function removeLoginLocks(): Promise<void> {
    const redis = app.get<Redis>(REDIS_CLIENT);
    const keys = await redis.keys('auth:login:*:lock');
    if (keys.length > 0) await redis.del(...keys);
  }

  function cookie(response: request.Response): string {
    return setCookieHeader(response).split(';', 1)[0] ?? '';
  }

  function setCookieHeader(response: request.Response): string {
    const header: unknown = response.headers['set-cookie'];
    const value =
      typeof header === 'string'
        ? header
        : Array.isArray(header) && typeof header[0] === 'string'
          ? header[0]
          : undefined;
    if (!value) throw new Error('Refresh cookie missing');
    return value;
  }

  function refreshTokenFromCookie(cookieValue: string): string {
    const separator = cookieValue.indexOf('=');
    if (separator < 0) throw new Error('Invalid refresh cookie');
    return cookieValue.slice(separator + 1);
  }
});
