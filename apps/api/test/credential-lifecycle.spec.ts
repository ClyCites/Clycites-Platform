import 'reflect-metadata';

import { createHmac } from 'node:crypto';

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createDatabaseClient } from '@clycites/database';
import type { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { REDIS_CLIENT } from '../src/queue/queue.constants.js';

const database = createDatabaseClient();
const organizationId = '00000000-0000-4000-8000-000000000201';
const adminEmail = 'cooperative.admin@clycites.local';
const originalPassword = process.env.SEED_STAFF_PASSWORD ?? 'ClyCites-local-2026!';
const invitedEmail = 'wp5.invited@clycites.local';
const expiredEmail = 'wp5.expired@clycites.local';
const invitationToken = 'wp5-invitation-token-with-at-least-32-characters';
const expiredToken = 'wp5-expired-token-with-at-least-32-characters';
const verificationToken = 'wp5-verification-token-with-at-least-32-characters';
const resetToken = 'wp5-password-reset-token-with-at-least-32-characters';
const invitedPassword = 'invited-staff-password';
const changedPassword = 'changed-staff-password';
const resetPassword = 'reset-complete-password';

interface LoginResult {
  accessToken: string;
  cookie: string;
}

describe.sequential('Credential lifecycle API', () => {
  let app: INestApplication;
  let adminToken: string;
  let invitedUserId: string;
  let expiredUserId: string;
  let currentPassword = invitedPassword;

  beforeAll(async () => {
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
    adminToken = (await login(adminEmail, originalPassword)).accessToken;
  });

  afterAll(async () => {
    const userIds = [invitedUserId, expiredUserId].filter(Boolean);
    if (userIds.length > 0) {
      const credentialIds = [
        ...(await database.userInvitation.findMany({
          where: { userId: { in: userIds } },
          select: { id: true },
        })),
        ...(await database.passwordReset.findMany({
          where: { userId: { in: userIds } },
          select: { id: true },
        })),
        ...(await database.emailVerification.findMany({
          where: { userId: { in: userIds } },
          select: { id: true },
        })),
      ].map(({ id }) => id);
      await database.auditEvent.deleteMany({
        where: {
          OR: [
            { actorUserId: { in: userIds } },
            ...(credentialIds.length > 0 ? [{ entityId: { in: credentialIds } }] : []),
          ],
        },
      });
      await database.session.deleteMany({ where: { userId: { in: userIds } } });
      await database.emailVerification.deleteMany({ where: { userId: { in: userIds } } });
      await database.passwordReset.deleteMany({ where: { userId: { in: userIds } } });
      await database.userInvitation.deleteMany({ where: { userId: { in: userIds } } });
      await database.organizationMembership.deleteMany({ where: { userId: { in: userIds } } });
      await database.user.deleteMany({ where: { id: { in: userIds } } });
    }
    const redis = app.get<Redis>(REDIS_CLIENT);
    const keys = [
      ...(await redis.keys('auth:invitation:*')),
      ...(await redis.keys('auth:login:*')),
    ];
    if (keys.length > 0) await redis.del(...keys);
    await app.close();
    await database.$disconnect();
  });

  it('issues and accepts a single-use invitation, then permits login', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/members/invitations`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        email: invitedEmail,
        firstName: 'Invited',
        lastName: 'Staff',
        role: 'VIEWER',
        accountClass: 'STAFF',
      })
      .expect(201);
    expect(response.body.data.deliveryQueued).toBe(true);
    const invitation = await database.userInvitation.findUniqueOrThrow({
      where: { id: response.body.data.id as string },
    });
    invitedUserId = invitation.userId;
    await database.userInvitation.update({
      where: { id: invitation.id },
      data: { tokenHash: tokenHash(invitationToken) },
    });

    await request(app.getHttpServer())
      .post('/api/v1/auth/invitations/accept')
      .send({ token: invitationToken, password: invitedPassword })
      .expect(200);
    await login(invitedEmail, invitedPassword);
    await request(app.getHttpServer())
      .post('/api/v1/auth/invitations/accept')
      .send({ token: invitationToken, password: invitedPassword })
      .expect(400);
    expect(await database.user.findUniqueOrThrow({ where: { id: invitedUserId } })).toMatchObject({
      status: 'ACTIVE',
      accountClass: 'STAFF',
    });
  });

  it('rejects an expired invitation, leaves the user invited, and permits reinvitation', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/members/invitations`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        email: expiredEmail,
        firstName: 'Expired',
        lastName: 'Invite',
        role: 'VIEWER',
        accountClass: 'STAFF',
      })
      .expect(201);
    const invitation = await database.userInvitation.findUniqueOrThrow({
      where: { id: response.body.data.id as string },
    });
    expiredUserId = invitation.userId;
    await database.userInvitation.update({
      where: { id: invitation.id },
      data: { tokenHash: tokenHash(expiredToken), expiresAt: new Date(Date.now() - 1_000) },
    });

    await request(app.getHttpServer())
      .post('/api/v1/auth/invitations/accept')
      .send({ token: expiredToken, password: invitedPassword })
      .expect(400);
    expect((await database.user.findUniqueOrThrow({ where: { id: expiredUserId } })).status).toBe(
      'INVITED',
    );
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/members/invitations/${invitation.id}/reinvite`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);
  });

  it('verifies email with a hashed, expiring, single-use token', async () => {
    const authenticated = await login(invitedEmail, currentPassword);
    await request(app.getHttpServer())
      .post('/api/v1/auth/email-verification/request')
      .set('authorization', `Bearer ${authenticated.accessToken}`)
      .expect(202);
    const verification = await database.emailVerification.findFirstOrThrow({
      where: { userId: invitedUserId, consumedAt: null, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    await database.emailVerification.update({
      where: { id: verification.id },
      data: { tokenHash: tokenHash(verificationToken) },
    });

    await request(app.getHttpServer())
      .post('/api/v1/auth/email-verification/confirm')
      .send({ token: verificationToken })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/email-verification/confirm')
      .send({ token: verificationToken })
      .expect(400);
    expect(
      (await database.user.findUniqueOrThrow({ where: { id: invitedUserId } })).emailVerifiedAt,
    ).toBeInstanceOf(Date);
  });

  it('changes a password while preserving only the calling session', async () => {
    const calling = await login(invitedEmail, currentPassword);
    const other = await login(invitedEmail, currentPassword);

    await request(app.getHttpServer())
      .post('/api/v1/auth/password')
      .set('authorization', `Bearer ${calling.accessToken}`)
      .send({ currentPassword, newPassword: changedPassword })
      .expect(200);
    currentPassword = changedPassword;

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${calling.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${other.accessToken}`)
      .expect(401);
    await login(invitedEmail, currentPassword);
  });

  it('returns identical reset responses and revokes every session on confirmation', async () => {
    const first = await login(invitedEmail, currentPassword);
    const second = await login(invitedEmail, currentPassword);
    const startedExisting = performance.now();
    const existing = await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset/request')
      .send({ email: invitedEmail })
      .expect(202);
    const existingDuration = performance.now() - startedExisting;
    const startedMissing = performance.now();
    const missing = await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset/request')
      .send({ email: 'missing.wp5@clycites.local' })
      .expect(202);
    const missingDuration = performance.now() - startedMissing;

    expect(existing.body.data).toEqual(missing.body.data);
    expect(Math.max(existingDuration, missingDuration)).toBeLessThan(
      Math.min(existingDuration, missingDuration) * 4 + 50,
    );
    const reset = await database.passwordReset.findFirstOrThrow({
      where: { userId: invitedUserId, consumedAt: null, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    await database.passwordReset.update({
      where: { id: reset.id },
      data: { tokenHash: tokenHash(resetToken) },
    });
    await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token: resetToken, password: resetPassword })
      .expect(200);
    currentPassword = resetPassword;

    for (const token of [first.accessToken, second.accessToken]) {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('authorization', `Bearer ${token}`)
        .expect(401);
    }
    await login(invitedEmail, currentPassword);
  });

  it('burns a reset token after five invalid password confirmations', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset/request')
      .send({ email: invitedEmail })
      .expect(202);
    const reset = await database.passwordReset.findFirstOrThrow({
      where: { userId: invitedUserId, consumedAt: null, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const burnToken = `${resetToken}-burn`;
    await database.passwordReset.update({
      where: { id: reset.id },
      data: { tokenHash: tokenHash(burnToken) },
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token: burnToken, password: 'short' })
        .expect(400);
    }
    await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token: burnToken, password: 'valid-after-burn-password' })
      .expect(400);
    expect(
      (await database.passwordReset.findUniqueOrThrow({ where: { id: reset.id } })).revokedAt,
    ).toBeInstanceOf(Date);
  });

  it('enforces invariant 10: an unverified channel cannot initiate recovery', async () => {
    await database.user.update({
      where: { id: invitedUserId },
      data: { emailVerifiedAt: null },
    });
    const before = await database.passwordReset.count({ where: { userId: invitedUserId } });

    await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset/request')
      .send({ email: invitedEmail })
      .expect(202);

    expect(await database.passwordReset.count({ where: { userId: invitedUserId } })).toBe(before);
  });

  async function login(email: string, password: string): Promise<LoginResult> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(201);
    const header: unknown = response.headers['set-cookie'];
    const cookie = Array.isArray(header) ? header[0] : header;
    if (typeof cookie !== 'string') throw new Error('Refresh cookie missing');
    return {
      accessToken: response.body.data.accessToken as string,
      cookie: cookie.split(';', 1)[0] ?? '',
    };
  }

  function tokenHash(token: string): string {
    return createHmac(
      'sha256',
      process.env.AUTH_CREDENTIAL_TOKEN_PEPPER ?? 'local-only-credential-token-pepper-change-me',
    )
      .update(token)
      .digest('hex');
  }
});
