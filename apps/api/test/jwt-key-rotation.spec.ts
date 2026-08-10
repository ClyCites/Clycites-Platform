import 'reflect-metadata';

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createDatabaseClient } from '@clycites/database';
import { decodeJwt, decodeProtectedHeader, SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const database = createDatabaseClient();
const currentSecret = 'test-current-access-token-secret-at-least-32-characters';
const previousSecret = 'test-previous-access-token-secret-at-least-32-characters';
const buyerUserId = '00000000-0000-4000-8000-000000000105';
const password = process.env.SEED_STAFF_PASSWORD ?? 'ClyCites-local-2026!';

const tokenKeys = JSON.stringify([
  { kid: 'current-v2', secret: currentSecret },
  { kid: 'previous-v1', secret: previousSecret },
]);

describe.sequential('JWT key rotation and clock tolerance', () => {
  let app: INestApplication;
  const sessionIds: string[] = [];

  beforeAll(async () => {
    vi.stubEnv('AUTH_ACCESS_TOKEN_KEYS', tokenKeys);
    vi.stubEnv('AUTH_JWT_CLOCK_TOLERANCE_SECONDS', '120');
    const { AppModule } = await import('../src/app.module.js');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await database.session.deleteMany({ where: { id: { in: sessionIds } } });
    await app.close();
    await database.$disconnect();
    vi.unstubAllEnvs();
  });

  it('signs new tokens with the first configured key id', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'buyer@clycites.local', password })
      .expect(201);
    const token = response.body.data.accessToken as string;
    expect(decodeProtectedHeader(token).kid).toBe('current-v2');
    const sessionId = decodeJwt(token).jti;
    if (!sessionId) throw new Error('Access-token session ID missing');
    sessionIds.push(sessionId);
  });

  it('verifies a previous key and applies bounded expiration tolerance', async () => {
    const sessionId = crypto.randomUUID();
    sessionIds.push(sessionId);
    await database.session.create({
      data: {
        id: sessionId,
        userId: buyerUserId,
        refreshTokenHash: 'test-refresh-hash',
        expiresAt: new Date(Date.now() + 60_000),
        accessTokenValidAfter: new Date(Date.now() - 1_000),
      },
    });
    const now = Math.floor(Date.now() / 1000);
    const withinTolerance = await signedToken(sessionId, 'previous-v1', previousSecret, now - 119);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${withinTolerance}`)
      .expect(200);

    const beyondTolerance = await signedToken(sessionId, 'previous-v1', previousSecret, now - 121);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${beyondTolerance}`)
      .expect(401);

    const unknownKid = await signedToken(sessionId, 'unknown-v0', previousSecret, now + 60);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${unknownKid}`)
      .expect(401);
  });

  function signedToken(sessionId: string, kid: string, secret: string, expiration: number) {
    return new SignJWT({ type: 'access' })
      .setProtectedHeader({ alg: 'HS256', kid })
      .setSubject(buyerUserId)
      .setJti(sessionId)
      .setIssuer('clycites-api')
      .setAudience('clycites-web')
      .setIssuedAt()
      .setExpirationTime(expiration)
      .sign(new TextEncoder().encode(secret));
  }
});
