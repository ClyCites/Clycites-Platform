import 'reflect-metadata';

import { createHmac } from 'node:crypto';

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createDatabaseClient } from '@clycites/database';
import { decodeJwt } from 'jose';
import * as OTPAuth from 'otpauth';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';

const database = createDatabaseClient();
const password = process.env.SEED_STAFF_PASSWORD ?? 'ClyCites-local-2026!';

describe.sequential('TOTP MFA', () => {
  let app: INestApplication;
  let accessToken: string;
  let secondAccessToken: string;
  let challengeToken: string;
  let secret: string;
  let recoveryCodes: string[];
  let loginChallengeToken: string;
  let mfaAccessToken: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'cooperative.admin@clycites.local', password })
      .expect(201);
    accessToken = login.body.data.accessToken as string;
    const secondLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'cooperative.admin@clycites.local', password })
      .expect(201);
    secondAccessToken = secondLogin.body.data.accessToken as string;
  });

  afterAll(async () => {
    const user = await database.user.findUniqueOrThrow({
      where: { email: 'cooperative.admin@clycites.local' },
    });
    await database.mfaChallenge.deleteMany({ where: { userId: user.id } });
    await database.mfaRecoveryCode.deleteMany({ where: { userId: user.id } });
    await database.user.update({
      where: { id: user.id },
      data: { mfaSecretEncrypted: null, mfaEnrolledAt: null },
    });
    const sessionIds = [accessToken, secondAccessToken, mfaAccessToken]
      .filter((token): token is string => Boolean(token))
      .map((token) => decodeJwt(token).jti)
      .filter((id): id is string => Boolean(id));
    await database.session.deleteMany({ where: { id: { in: sessionIds } } });
    await app.close();
    await database.$disconnect();
  });

  it('requires an unenrolled platform administrator to enroll before creating a session', async () => {
    const platformAdmin = await database.user.findUniqueOrThrow({
      where: { email: 'platform.admin@clycites.local' },
    });
    const sessionCount = await database.session.count({ where: { userId: platformAdmin.id } });
    await database.user.update({
      where: { id: platformAdmin.id },
      data: { mfaSecretEncrypted: null, mfaEnrolledAt: null },
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: platformAdmin.email, password })
      .expect(201);

    expect(response.body.data).toMatchObject({
      mfaRequired: true,
      enrollmentRequired: true,
      challengeToken: expect.any(String),
      secret: expect.any(String),
      uri: expect.stringMatching(/^otpauth:\/\/totp\//),
    });
    expect(response.body.data).not.toHaveProperty('accessToken');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await database.session.count({ where: { userId: platformAdmin.id } })).toBe(
      sessionCount,
    );

    await database.mfaChallenge.deleteMany({ where: { userId: platformAdmin.id } });
    await database.user.update({
      where: { id: platformAdmin.id },
      data: {
        mfaSecretEncrypted: platformAdmin.mfaSecretEncrypted,
        mfaEnrolledAt: platformAdmin.mfaEnrolledAt,
      },
    });
  });

  it('starts optional TOTP enrollment for a cooperative administrator', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/enroll')
      .set('authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(response.body.data).toMatchObject({
      challengeToken: expect.any(String),
      secret: expect.any(String),
      uri: expect.stringMatching(/^otpauth:\/\/totp\//),
    });
    challengeToken = response.body.data.challengeToken as string;
    secret = response.body.data.secret as string;
  });

  it('confirms enrollment with ten one-time recovery codes and satisfies only this session', async () => {
    const code = new OTPAuth.TOTP({
      issuer: 'ClyCites',
      label: 'cooperative.admin@clycites.local',
      secret: OTPAuth.Secret.fromBase32(secret),
    }).generate();
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/enroll/confirm')
      .send({ challengeToken, code })
      .expect(200);
    recoveryCodes = response.body.data.recoveryCodes as string[];
    expect(recoveryCodes).toHaveLength(10);
    expect(new Set(recoveryCodes)).toHaveLength(10);

    const user = await database.user.findUniqueOrThrow({
      where: { email: 'cooperative.admin@clycites.local' },
    });
    expect(user.mfaSecretEncrypted).not.toContain(secret);
    const storedCodes = await database.mfaRecoveryCode.findMany({ where: { userId: user.id } });
    expect(storedCodes).toHaveLength(10);
    expect(JSON.stringify(storedCodes)).not.toContain(recoveryCodes[0]);
    const currentSession = await database.session.findUniqueOrThrow({
      where: { id: tokenSessionId(accessToken) },
    });
    const otherSession = await database.session.findUniqueOrThrow({
      where: { id: tokenSessionId(secondAccessToken) },
    });
    expect(currentSession.mfaSatisfiedAt).not.toBeNull();
    expect(otherSession.revokedAt).not.toBeNull();
  });

  it('returns only a five-minute challenge after password verification for an enrolled user', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'cooperative.admin@clycites.local', password })
      .expect(201);

    expect(response.body.data).toMatchObject({
      mfaRequired: true,
      challengeToken: expect.any(String),
    });
    expect(response.body.data).not.toHaveProperty('accessToken');
    expect(response.headers['set-cookie']).toBeUndefined();
    loginChallengeToken = response.body.data.challengeToken as string;
    const challenge = await database.mfaChallenge.findUniqueOrThrow({
      where: {
        tokenHash: createHmac(
          'sha256',
          process.env.AUTH_MFA_TOKEN_PEPPER ?? 'local-only-mfa-token-pepper-change-me',
        )
          .update(loginChallengeToken)
          .digest('hex'),
      },
    });
    expect(challenge.attemptsRemaining).toBe(5);
    expect(challenge.expiresAt.getTime() - challenge.createdAt.getTime()).toBeGreaterThanOrEqual(
      5 * 60_000 - 5,
    );
  });

  it('consumes one recovery code and creates an MFA-satisfied session', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/verify')
      .send({ challengeToken: loginChallengeToken, code: recoveryCodes[0] })
      .expect(200);
    mfaAccessToken = response.body.data.accessToken as string;
    expect(response.headers['set-cookie']?.[0]).toMatch(/clycites_refresh=/);

    const session = await database.session.findUniqueOrThrow({
      where: { id: tokenSessionId(mfaAccessToken) },
    });
    expect(session.mfaSatisfiedAt).not.toBeNull();
    const usedCodes = await database.mfaRecoveryCode.count({
      where: { userId: session.userId, usedAt: { not: null } },
    });
    expect(usedCodes).toBe(1);
  });

  it('consumes a challenge after five invalid attempts', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'cooperative.admin@clycites.local', password })
      .expect(201);
    const failedChallengeToken = login.body.data.challengeToken as string;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/verify')
        .send({ challengeToken: failedChallengeToken, code: '000000' })
        .expect(401);
    }
    const challenge = await database.mfaChallenge.findUniqueOrThrow({
      where: {
        tokenHash: createHmac(
          'sha256',
          process.env.AUTH_MFA_TOKEN_PEPPER ?? 'local-only-mfa-token-pepper-change-me',
        )
          .update(failedChallengeToken)
          .digest('hex'),
      },
    });
    expect(challenge.attemptsRemaining).toBe(0);
    expect(challenge.consumedAt).not.toBeNull();
  });

  function tokenSessionId(token: string): string {
    const sessionId = decodeJwt(token).jti;
    if (!sessionId) throw new Error('Access-token session ID missing');
    return sessionId;
  }
});
