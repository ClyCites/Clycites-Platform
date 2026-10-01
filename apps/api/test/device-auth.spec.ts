import 'reflect-metadata';

import { createHmac } from 'node:crypto';

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createDatabaseClient } from '@clycites/database';
import { decodeJwt, decodeProtectedHeader } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';

const database = createDatabaseClient();
const organizationId = '00000000-0000-4000-8000-000000000201';
const assignedUserId = '00000000-0000-4000-8000-000000000103';
const password = process.env.SEED_STAFF_PASSWORD ?? 'ClyCites-local-2026!';

describe.sequential('device authentication', () => {
  let app: INestApplication;
  let adminToken: string;
  let browserToken: string;
  let browserRefreshCookie: string;
  let deviceId: string;
  let devicePublicId: string;
  let deviceToken: string;
  let deviceAccessToken: string;
  let deviceRefreshToken: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    const admin = await login('cooperative.admin@clycites.local');
    adminToken = admin.body.data.accessToken as string;
    const browser = await login('collection.agent@clycites.local');
    browserToken = browser.body.data.accessToken as string;
    browserRefreshCookie = browser.headers['set-cookie']?.[0] ?? '';
  });

  afterAll(async () => {
    await database.user.update({
      where: { id: assignedUserId },
      data: { mfaEnrolledAt: null, mfaSecretEncrypted: null },
    });
    const sessionIds = [adminToken, browserToken]
      .map((token) => decodeJwt(token).jti)
      .filter((id): id is string => Boolean(id));
    if (deviceId) await database.session.deleteMany({ where: { deviceId } });
    await database.session.deleteMany({ where: { id: { in: sessionIds } } });
    if (deviceId) await database.registeredDevice.delete({ where: { id: deviceId } });
    await app.close();
    await database.$disconnect();
  });

  it('provisions a device credential once and stores only its keyed digest', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/devices`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ assignedUserId, name: 'WP7 test handset', platform: 'Android' })
      .expect(201);

    deviceId = response.body.data.id as string;
    devicePublicId = response.body.data.devicePublicId as string;
    deviceToken = response.body.data.deviceToken as string;
    expect(deviceToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(response.body.data).not.toHaveProperty('deviceTokenHash');

    const stored = await database.registeredDevice.findUniqueOrThrow({ where: { id: deviceId } });
    expect(stored.deviceTokenHash).toBe(
      createHmac(
        'sha256',
        process.env.AUTH_DEVICE_TOKEN_PEPPER ?? 'local-only-device-token-pepper-change-me',
      )
        .update(deviceToken)
        .digest('hex'),
    );
    expect(JSON.stringify(stored)).not.toContain(deviceToken);
  });

  it('rejects device exchange when the assigned user has enrolled in MFA', async () => {
    await database.user.update({
      where: { id: assignedUserId },
      data: { mfaEnrolledAt: new Date() },
    });

    await request(app.getHttpServer())
      .post('/api/v1/auth/device/token')
      .send({ devicePublicId, deviceToken })
      .expect(401);

    await database.user.update({
      where: { id: assignedUserId },
      data: { mfaEnrolledAt: null },
    });
  });

  it('accepts device credentials only in the body and creates an organization-capped session', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/auth/device/token?devicePublicId=${devicePublicId}&deviceToken=${deviceToken}`)
      .expect(422);

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/device/token')
      .send({ devicePublicId, deviceToken })
      .expect(201);
    deviceAccessToken = response.body.data.accessToken as string;
    deviceRefreshToken = response.body.data.refreshToken as string;
    expect(decodeProtectedHeader(deviceAccessToken).kid).toBe('local-v1');

    const sessionId = deviceRefreshToken.split('.', 1)[0];
    if (!sessionId) throw new Error('Device refresh session ID missing');
    const session = await database.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.deviceId).toBe(deviceId);

    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/devices`)
      .set('authorization', `Bearer ${deviceAccessToken}`)
      .expect(200);
  });

  it('keeps browser and device refresh channels isolated', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('cookie', `clycites_refresh=${deviceRefreshToken}`)
      .expect(401);

    const browserRefreshToken = decodeURIComponent(
      browserRefreshCookie.match(/clycites_refresh=([^;]+)/)?.[1] ?? '',
    );
    await request(app.getHttpServer())
      .post('/api/v1/auth/device/token')
      .send({ refreshToken: browserRefreshToken })
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/auth/device/token')
      .send({ refreshToken: deviceRefreshToken })
      .expect(201)
      .expect((response) => expect(response.body.data.refreshToken).toBeTypeOf('string'));
  });

  it('revokes device sessions without revoking browser sessions', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/organizations/${organizationId}/devices/${deviceId}/revoke`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/devices`)
      .set('authorization', `Bearer ${deviceAccessToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${browserToken}`)
      .expect(200);
  });

  function login(email: string) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: email, password })
      .expect(201);
  }
});
