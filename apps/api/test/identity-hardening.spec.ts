import 'reflect-metadata';
import { createHmac, randomUUID } from 'node:crypto';
import { hash } from 'argon2';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createDatabaseClient } from '@clycites/database';
import { decodeJwt } from 'jose';
import * as OTPAuth from 'otpauth';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

const database = createDatabaseClient();
const orgA = '00000000-0000-4000-8000-000000000201';
const orgB = '00000000-0000-4000-8000-000000000202';
const viewerId = randomUUID();
const mfaUserId = randomUUID();
const password = 'Identity-regression-2026!';
const viewerEmail = `identity-${viewerId}@test.local`;
const mfaEmail = `identity-${mfaUserId}@test.local`;
const roleId = randomUUID();
const deviceId = randomUUID();

type Session = { token: string; cookie: string; id: string };
describe.sequential('Identity operational regressions', () => {
  let app: INestApplication;
  let viewer: Session;
  let enrollment: { challengeToken: string; secret: string };
  let enrollmentSession: Session;
  let recoveryCodes: string[];
  const login = async (email = viewerEmail): Promise<Session> => {
    const result = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: email, password })
      .expect(201);
    const token = result.body.data.accessToken as string;
    return {
      token,
      cookie: result.headers['set-cookie']?.[0]?.split(';')[0] ?? '',
      id: decodeJwt(token).jti!,
    };
  };
  const code = (secret: string) =>
    new OTPAuth.TOTP({
      secret: OTPAuth.Secret.fromBase32(secret),
      digits: 6,
      period: 30,
    }).generate();
  beforeAll(async () => {
    const passwordHash = await hash(password);
    for (const [id, email, role] of [
      [viewerId, viewerEmail, 'VIEWER'],
      [mfaUserId, mfaEmail, 'COOPERATIVE_ADMIN'],
    ] as const) {
      await database.user.create({
        data: {
          id,
          email,
          firstName: 'Identity',
          lastName: 'Regression',
          passwordHash,
          status: 'ACTIVE',
          accountClass: 'STAFF',
          memberships: { create: { organizationId: orgA, role, status: 'ACTIVE' } },
        },
      });
    }
    await database.organizationMembership.create({
      data: { userId: viewerId, organizationId: orgB, role: 'COOPERATIVE_ADMIN', status: 'ACTIVE' },
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    viewer = await login();
  });
  afterAll(async () => {
    if (app) await app.close();
    const users = { in: [viewerId, mfaUserId] };
    await database.membershipCustomRole.deleteMany({ where: { customRoleId: roleId } });
    await database.customRole.deleteMany({ where: { id: roleId } });
    await database.mfaChallenge.deleteMany({ where: { userId: users } });
    await database.mfaRecoveryCode.deleteMany({ where: { userId: users } });
    await database.session.deleteMany({ where: { userId: users } });
    await database.registeredDevice.deleteMany({ where: { id: deviceId } });
    await database.organizationMembership.deleteMany({ where: { userId: users } });
    await database.auditEvent.deleteMany({ where: { actorUserId: users } });
    await database.user.deleteMany({ where: { id: users } });
    await database.$disconnect();
  });
  it('rejects malformed refresh credentials without a database UUID error', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set(
        'Cookie',
        `${process.env.AUTH_REFRESH_COOKIE_NAME ?? 'clycites_refresh'}=not-a-uuid.secret`,
      )
      .expect(401);
  });
  it('validates session ids and isolates session ownership', async () => {
    await request(app.getHttpServer())
      .delete('/api/v1/auth/sessions/invalid-id')
      .set('authorization', `Bearer ${viewer.token}`)
      .expect(400);
    const other = await login(mfaEmail);
    await request(app.getHttpServer())
      .delete(`/api/v1/auth/sessions/${other.id}`)
      .set('authorization', `Bearer ${viewer.token}`)
      .expect(404);
  });
  it('logs out the authenticated session even when no cookie is present', async () => {
    const session = await login();
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('authorization', `Bearer ${session.token}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${session.token}`)
      .expect(401);
    expect(
      (await database.session.findUniqueOrThrow({ where: { id: session.id } })).revokedAt,
    ).not.toBeNull();
  });
  it('does not let a mismatched refresh cookie choose which session logout revokes', async () => {
    const first = await login();
    const second = await login();
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('authorization', `Bearer ${first.token}`)
      .set('Cookie', second.cookie)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${second.token}`)
      .expect(200);
    expect(
      (await database.session.findUniqueOrThrow({ where: { id: first.id } })).revokedAt,
    ).not.toBeNull();
  });
  it('allows at most one concurrent rotation of the same refresh credential', async () => {
    const session = await login();
    const results = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', session.cookie),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([201, 401]);
  });
  it('revokes the session when a rotated refresh credential is replayed', async () => {
    const session = await login();
    const rotated = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', session.cookie)
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', session.cookie)
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${rotated.body.data.accessToken as string}`)
      .expect(401);
  });
  it('applies custom roles to ordinary API routes and removes grants immediately on archive', async () => {
    const path = `/api/v1/organizations/${orgA}/devices`;
    await request(app.getHttpServer())
      .get(path)
      .set('authorization', `Bearer ${viewer.token}`)
      .expect(403);
    const membership = await database.organizationMembership.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId: orgA, userId: viewerId } },
    });
    await database.customRole.create({
      data: {
        id: roleId,
        organizationId: orgA,
        name: `Identity role ${roleId}`,
        createdByUserId: mfaUserId,
        permissions: { create: { permissionCode: 'device.read' } },
        assignments: { create: { membershipId: membership.id, assignedByUserId: mfaUserId } },
      },
    });
    await request(app.getHttpServer())
      .get(path)
      .set('authorization', `Bearer ${viewer.token}`)
      .expect(200);
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${viewer.token}`)
      .expect(200);
    const organizations = me.body.data.organizations as Array<{
      organizationId: string;
      permissions: string[];
    }>;
    expect(organizations.find((org) => org.organizationId === orgA)?.permissions).toContain(
      'device.read',
    );
    await database.customRole.update({ where: { id: roleId }, data: { status: 'ARCHIVED' } });
    await request(app.getHttpServer())
      .get(path)
      .set('authorization', `Bearer ${viewer.token}`)
      .expect(403);
  });
  it('caps device dashboard access and context to its assigned organization', async () => {
    const deviceToken = 'device-regression-token-long-enough-for-the-contract';
    await database.registeredDevice.create({
      data: {
        id: deviceId,
        organizationId: orgA,
        assignedUserId: viewerId,
        devicePublicId: `dev_${deviceId}`,
        name: 'Identity regression',
        platform: 'Android',
        deviceTokenIssuedAt: new Date(),
        deviceTokenHash: createHmac('sha256', process.env.AUTH_DEVICE_TOKEN_PEPPER!)
          .update(deviceToken)
          .digest('hex'),
      },
    });
    await database.user.update({
      where: { id: viewerId },
      data: { platformRole: 'PLATFORM_ADMIN' },
    });
    try {
      const result = await request(app.getHttpServer())
        .post('/api/v1/auth/device/token')
        .send({ devicePublicId: `dev_${deviceId}`, deviceToken })
        .expect(201);
      const token = result.body.data.accessToken as string;
      expect(result.body.data.user.platformRole).toBeNull();
      await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgB}/roles`)
        .set('authorization', `Bearer ${token}`)
        .expect(403);
      const context = await request(app.getHttpServer())
        .get('/api/v1/me/context')
        .set('authorization', `Bearer ${token}`)
        .expect(200);
      expect(context.body.data.user.platformRole).toBeNull();
      const memberships = context.body.data.memberships as Array<{ organizationId: string }>;
      expect(memberships.map((member) => member.organizationId)).toEqual([orgA]);
      for (const path of [
        'sessions',
        'logout-all',
        'mfa/enroll',
        'password',
        'email-verification/request',
      ]) {
        const operation =
          path === 'sessions'
            ? request(app.getHttpServer()).get(`/api/v1/auth/${path}`)
            : request(app.getHttpServer()).post(`/api/v1/auth/${path}`);
        await operation.set('authorization', `Bearer ${token}`).expect(403);
      }
    } finally {
      await database.user.update({ where: { id: viewerId }, data: { platformRole: null } });
    }
  });
  it('refuses to enroll through a revoked browser session', async () => {
    const session = await login(mfaEmail);
    const result = await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/enroll')
      .set('authorization', `Bearer ${session.token}`)
      .expect(201);
    const challenge = result.body.data as { challengeToken: string; secret: string };
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('authorization', `Bearer ${session.token}`)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/enroll/confirm')
      .send({ challengeToken: challenge.challengeToken, code: code(challenge.secret) })
      .expect(401);
    expect(
      (await database.user.findUniqueOrThrow({ where: { id: mfaUserId } })).mfaEnrolledAt,
    ).toBeNull();
  });
  it('claims enrollment once under concurrent confirmation', async () => {
    enrollmentSession = await login(mfaEmail);
    const result = await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/enroll')
      .set('authorization', `Bearer ${enrollmentSession.token}`)
      .expect(201);
    enrollment = result.body.data as typeof enrollment;
    const results = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .post('/api/v1/auth/mfa/enroll/confirm')
          .send({ challengeToken: enrollment.challengeToken, code: code(enrollment.secret) }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([200, 401]);
    recoveryCodes = results.find((result) => result.status === 200)!.body.data
      .recoveryCodes as string[];
    expect(await database.mfaRecoveryCode.count({ where: { userId: mfaUserId } })).toBe(10);
    expect(
      await database.auditEvent.count({
        where: { actorUserId: mfaUserId, action: 'AUTH_MFA_ENROLLED' },
      }),
    ).toBe(1);
  });
  it('audits recovery-code use and rejects a second use without logging the code', async () => {
    const challenge = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: mfaEmail, password })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/verify')
      .send({ challengeToken: challenge.body.data.challengeToken, code: recoveryCodes[0] })
      .expect(200);
    const second = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: mfaEmail, password })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/verify')
      .send({ challengeToken: second.body.data.challengeToken, code: recoveryCodes[0] })
      .expect(401);
    const events = await database.auditEvent.findMany({
      where: {
        actorUserId: mfaUserId,
        action: { in: ['AUTH_MFA_RECOVERY_CODE_USED', 'AUTH_MFA_FAILED'] },
      },
    });
    expect(events.filter((event) => event.action === 'AUTH_MFA_RECOVERY_CODE_USED')).toHaveLength(
      1,
    );
    expect(events.filter((event) => event.action === 'AUTH_MFA_FAILED')).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain(recoveryCodes[0]);
    expect(JSON.stringify(events)).not.toContain(second.body.data.challengeToken);
  });
  it('does not complete a pending MFA login after the account is suspended', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: mfaEmail, password })
      .expect(201);
    await database.user.update({ where: { id: mfaUserId }, data: { status: 'SUSPENDED' } });
    await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/verify')
      .send({ challengeToken: login.body.data.challengeToken, code: code(enrollment.secret) })
      .expect(401);
  });
});
