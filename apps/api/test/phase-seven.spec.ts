import 'reflect-metadata';

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createDatabaseClient } from '@clycites/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';

const retentionPolicyId = '00000000-0000-4000-8000-000000005021';
const password = process.env.SEED_STAFF_PASSWORD ?? 'ClyCites-local-2026!';
const database = createDatabaseClient();

describe.sequential('Phase 7 operations API', () => {
  let app: INestApplication;
  let platformToken: string;
  let cooperativeToken: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    platformToken = await login('platform.admin@clycites.local');
    cooperativeToken = await login('cooperative.admin@clycites.local');
  });

  afterAll(async () => {
    if (app) await app.close();
    await database.$disconnect();
  });

  it('reports not ready while seeded blocking gates remain open', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/operations/overview')
      .set('authorization', `Bearer ${platformToken}`)
      .expect(200);

    expect(response.body.data.readiness).toMatchObject({ ready: false });
    expect(response.body.data.readiness.openBlockingGateCount).toBeGreaterThan(0);
    expect(response.body.data.gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'UGANDA_LEGAL_REVIEW', status: 'BLOCKED' }),
      ]),
    );
  });

  it('restricts platform readiness governance from cooperative administrators', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/operations/readiness-gates')
      .set('authorization', `Bearer ${cooperativeToken}`)
      .expect(403);
  });

  it('records a non-destructive retention dry run and preserves audit authority', async () => {
    const auditCountBefore = await database.auditEvent.count();
    const dryRunsBefore = await database.dataRetentionDryRun.count({
      where: { dataRetentionPolicyId: retentionPolicyId },
    });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/operations/retention-policies/${retentionPolicyId}/dry-runs`)
      .set('authorization', `Bearer ${cooperativeToken}`)
      .expect(201);

    expect(response.body.data.report).toMatchObject({ destructiveExecution: false });
    expect(
      await database.dataRetentionDryRun.count({
        where: { dataRetentionPolicyId: retentionPolicyId },
      }),
    ).toBe(dryRunsBefore + 1);
    expect(await database.auditEvent.count()).toBe(auditCountBefore + 1);
  });

  async function login(email: string) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(201);
    return response.body.data.accessToken as string;
  }
});
