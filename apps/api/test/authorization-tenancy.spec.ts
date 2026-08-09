import 'reflect-metadata';

import { randomUUID } from 'node:crypto';

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createDatabaseClient } from '@clycites/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';

const database = createDatabaseClient();
const organizationA = '00000000-0000-4000-8000-000000000201';
const organizationB = '00000000-0000-4000-8000-000000000202';
const cooperativeAdminId = '00000000-0000-4000-8000-000000000102';
const platformAdminId = '00000000-0000-4000-8000-000000000101';
const password = process.env.SEED_STAFF_PASSWORD ?? 'ClyCites-local-2026!';
const pilotId = randomUUID();
const incidentId = randomUUID();

describe.sequential('cross-organization authorization', () => {
  let app: INestApplication;
  let accessToken: string;

  beforeAll(async () => {
    await database.pilot.create({
      data: {
        id: pilotId,
        publicId: `pilot_wp1_${pilotId.replaceAll('-', '')}`,
        code: `WP1-${pilotId.slice(0, 8)}`,
        name: 'WP1 organization B authorization fixture',
        organizationId: organizationB,
        crop: 'COFFEE',
        region: 'WP1 test region',
        district: 'WP1 test district',
        plannedStartDate: new Date('2026-08-01T00:00:00.000Z'),
        plannedEndDate: new Date('2026-09-01T00:00:00.000Z'),
        targetFarmerCount: 1,
        targetAgentCount: 1,
        targetCollectionPointCount: 1,
        targetBuyerCount: 1,
        paymentMode: 'MOCK',
        hederaMode: 'MOCK',
        smsMode: 'MOCK',
        supportModel: 'WP1 authorization test fixture',
        environmentLabel: 'TEST',
        createdByUserId: platformAdminId,
      },
    });
    await database.operationalIncident.create({
      data: {
        id: incidentId,
        incidentNumber: `WP1-${incidentId.slice(0, 8)}`,
        title: 'WP1 organization B authorization fixture',
        description: 'Cross-organization authorization integration test.',
        category: 'AVAILABILITY',
        severity: 'SEV4',
        organizationId: organizationB,
        detectedAt: new Date(),
        reportedByUserId: cooperativeAdminId,
      },
    });

    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'cooperative.admin@clycites.local', password })
      .expect(201);
    accessToken = login.body.data.accessToken as string;
  });

  afterAll(async () => {
    if (app) await app.close();
    await database.session.deleteMany({ where: { userId: cooperativeAdminId } });
    await database.operationalIncident.deleteMany({ where: { id: incidentId } });
    await database.pilot.deleteMany({ where: { id: pilotId } });
    await database.$disconnect();
  });

  it('denies organization A permissions on an organization B parameter route', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationB}`)
      .set('authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('denies organization A permissions after resolving an organization B entity', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/pilots/${pilotId}`)
      .set('authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('denies organization A mutation after resolving an organization B entity', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/operations/incidents/${incidentId}`)
      .set('authorization', `Bearer ${accessToken}`)
      .send({ status: 'ACKNOWLEDGED' })
      .expect(403);
  });

  it('does not treat organization permissions as platform permissions', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/operations/overview')
      .set('authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('filters self-scoped lists by the permission held in each organization', async () => {
    const organizations = await request(app.getHttpServer())
      .get('/api/v1/organizations')
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(organizations.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: organizationA })]),
    );
    expect(organizations.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: organizationB })]),
    );

    const pilots = await request(app.getHttpServer())
      .get('/api/v1/pilots')
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(pilots.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: pilotId })]),
    );

    const incidents = await request(app.getHttpServer())
      .get('/api/v1/operations/incidents')
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(incidents.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: incidentId })]),
    );
  });
});
