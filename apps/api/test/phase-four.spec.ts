import 'reflect-metadata';

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';

const cooperativeId = '00000000-0000-4000-8000-000000000201';
const recipientId = '00000000-0000-4000-8000-000000000202';
const password = process.env.SEED_STAFF_PASSWORD ?? 'ClyCites-local-2026!';

describe.sequential('Phase 4 Hedera verification API', () => {
  let app: INestApplication;
  let cooperativeToken: string;
  let agentToken: string;
  let platformToken: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    cooperativeToken = await login('cooperative.admin@clycites.local');
    agentToken = await login('collection.agent@clycites.local');
    platformToken = await login('platform.admin@clycites.local');
  });

  afterAll(async () => app.close());

  it('isolates organization anchor queries before returning records', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${recipientId}/anchors`)
      .set('authorization', `Bearer ${agentToken}`)
      .expect(403);

    const response = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${cooperativeId}/anchors?pageSize=5`)
      .set('authorization', `Bearer ${cooperativeToken}`)
      .expect(200);
    const body = response.body as {
      data: { page: number; pageSize: number; items: Array<{ organizationId: string }> };
    };
    expect(body.data).toMatchObject({ page: 1, pageSize: 5 });
    expect(body.data.items).toEqual(expect.any(Array));
    expect(body.data.items.every((item) => item.organizationId === cooperativeId)).toBe(true);
  });

  it('returns organization verification metrics without credentials', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${cooperativeId}/verification/dashboard`)
      .set('authorization', `Bearer ${cooperativeToken}`)
      .expect(200);
    expect(response.body.data).toMatchObject({ provider: 'MOCK', network: 'LOCAL' });
    expect(JSON.stringify(response.body.data)).not.toMatch(/secret|operatorKey|privateKey/i);
  });

  it('restricts global Hedera diagnostics to platform administrators', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/hedera/status')
      .set('authorization', `Bearer ${cooperativeToken}`)
      .expect(403);
    const response = await request(app.getHttpServer())
      .get('/api/v1/admin/hedera/status')
      .set('authorization', `Bearer ${platformToken}`)
      .expect(200);
    expect(response.body.data).toMatchObject({
      provider: 'MOCK',
      network: 'LOCAL',
      configured: true,
    });
    expect(JSON.stringify(response.body.data)).not.toMatch(
      /operatorKey|privateKey|referenceSecret/i,
    );
  });

  it('adds explicit privacy-safe Hedera evidence to public lot traceability', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/traceability/lots/tr1_local_export_2026')
      .expect(200);
    expect(response.body.data.ledgerVerification).toMatchObject({
      limitation: expect.stringMatching(/does not independently prove/i),
      eligibleLineageEventCount: expect.any(Number),
      confirmedLineageAnchorCount: expect.any(Number),
    });
    const publicJson = JSON.stringify(response.body.data.ledgerVerification);
    expect(publicJson).not.toMatch(
      /canonicalPayload|organizationId|entityId|farmerId|deliveryId|errorMessage/i,
    );
  });

  async function login(email: string) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(201);
    return response.body.data.accessToken as string;
  }
});
