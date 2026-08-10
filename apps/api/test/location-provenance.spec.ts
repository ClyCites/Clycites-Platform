import 'reflect-metadata';

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createDatabaseClient } from '@clycites/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';

const database = createDatabaseClient();
const organizationId = '00000000-0000-4000-8000-000000000201';
const collectionPointId = '00000000-0000-4000-8000-000000000301';
const collectionAgentId = '00000000-0000-4000-8000-000000000103';
const farmerId = '00000000-0000-4000-8000-000000000401';
const farmId = '00000000-0000-4000-8000-000000000501';
const lotId = '00000000-0000-4000-8000-000000001031';
const deviceIds = ['00000000-0000-4000-8000-000000009701', '00000000-0000-4000-8000-000000009702'];
const password = process.env.SEED_STAFF_PASSWORD ?? 'ClyCites-local-2026!';
let plotId: string | undefined;
const sessionIds: string[] = [];
let lineageContributionId: string | undefined;
let lineageDeliveryId: string | undefined;
let originalLineageFarmId: string | null | undefined;

describe.sequential('Location provenance API', () => {
  let app: INestApplication;
  let agentToken: string;
  let adminToken: string;

  beforeAll(async () => {
    const lotContribution = await database.cooperativeLotContribution.findFirstOrThrow({
      where: { lotId },
      select: { batchId: true },
    });
    const lineageDelivery = await database.delivery.findFirstOrThrow({
      where: { farmerId },
      select: { id: true, farmId: true },
    });
    lineageDeliveryId = lineageDelivery.id;
    originalLineageFarmId = lineageDelivery.farmId;
    await database.delivery.update({
      where: { id: lineageDeliveryId },
      data: { farmId },
    });
    const lineageContribution = await database.farmerBatchContribution.create({
      data: { batchId: lotContribution.batchId, deliveryId: lineageDeliveryId, quantity: 1 },
    });
    lineageContributionId = lineageContribution.id;
    await database.registeredDevice.createMany({
      data: deviceIds.map((id, index) => ({
        id,
        organizationId,
        assignedUserId: collectionAgentId,
        devicePublicId: `wp10-location-device-${index + 1}`,
        name: `WP10 location device ${index + 1}`,
        platform: 'WEB',
      })),
    });
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    agentToken = await login('collection.agent@clycites.local');
    adminToken = await login('cooperative.admin@clycites.local');
  });

  afterAll(async () => {
    if (plotId) await database.farmPlot.deleteMany({ where: { id: plotId } });
    await database.auditEvent.deleteMany({
      where: { entityId: { in: [...sessionIds, ...(plotId ? [plotId] : [])] } },
    });
    await database.outboxEvent.deleteMany({ where: { aggregateId: { in: sessionIds } } });
    await database.collectionSession.deleteMany({ where: { id: { in: sessionIds } } });
    await database.registeredDevice.deleteMany({ where: { id: { in: deviceIds } } });
    if (lineageContributionId) {
      await database.farmerBatchContribution.delete({ where: { id: lineageContributionId } });
    }
    if (lineageDeliveryId && originalLineageFarmId !== undefined) {
      await database.delivery.update({
        where: { id: lineageDeliveryId },
        data: { farmId: originalLineageFarmId },
      });
    }
    await database.session.deleteMany({
      where: {
        userId: {
          in: ['00000000-0000-4000-8000-000000000102', collectionAgentId],
        },
      },
    });
    await app.close();
    await database.$disconnect();
  });

  it('records and audits a distant opening without blocking the session', async () => {
    const response = await openSession(deviceIds[0]!, {
      latitude: 0.123,
      longitude: 29.718,
      accuracyMeters: 10,
    });
    sessionIds.push(response.body.data.id as string);
    expect(response.body.data).toMatchObject({
      status: 'OPEN',
      openedAccuracyMeters: 10,
      openedLocationFlagged: true,
    });
    expect(response.body.data.openedDistanceMeters).toBeGreaterThan(4_500);
    expect(
      await database.auditEvent.count({
        where: {
          entityId: response.body.data.id as string,
          action: 'COLLECTION_SESSION_LOCATION_FLAGGED',
        },
      }),
    ).toBe(1);
  });

  it('records a coarse reading without raising a flag', async () => {
    const response = await openSession(deviceIds[1]!, {
      latitude: 0.123,
      longitude: 29.718,
      accuracyMeters: 750,
    });
    sessionIds.push(response.body.data.id as string);
    expect(response.body.data).toMatchObject({
      openedAccuracyMeters: 750,
      openedLocationFlagged: false,
    });
    expect(response.body.data.openedDistanceMeters).toBeGreaterThan(4_500);
  });

  it('rejects malformed and self-intersecting survey boundaries', async () => {
    await createPlot({ type: 'Point', coordinates: [29.72, 0.08] }).expect(400);
    await createPlot({
      type: 'Polygon',
      coordinates: [
        [
          [29.72, 0.08],
          [29.74, 0.1],
          [29.74, 0.08],
          [29.72, 0.1],
          [29.72, 0.08],
        ],
      ],
    }).expect(400);
  });

  it('derives plot geometry and flags a greater-than-25-percent area discrepancy', async () => {
    const response = await createPlot({
      type: 'Polygon',
      coordinates: [
        [
          [29.72, 0.08],
          [29.722, 0.08],
          [29.722, 0.082],
          [29.72, 0.082],
          [29.72, 0.08],
        ],
      ],
    }).expect(201);
    plotId = response.body.data.id as string;
    expect(response.body.data).toMatchObject({
      farmId,
      vertexCount: 5,
      areaDiscrepancyFlagged: true,
    });
  });

  it('does not expose farm geolocation through authenticated lot lineage', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/lots/${lotId}/lineage`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(JSON.stringify(response.body)).not.toMatch(
      /latitude|longitude|boundary|centroidLatitude|centroidLongitude/i,
    );
  });

  function openSession(
    deviceId: string,
    location: { latitude: number; longitude: number; accuracyMeters: number },
  ) {
    return request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/collection-sessions`)
      .set('authorization', `Bearer ${agentToken}`)
      .send({ collectionPointId, deviceId, businessDate: '2026-08-10', location })
      .expect(201);
  }

  function createPlot(boundary: unknown) {
    return request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/farmers/${farmerId}/farms/${farmId}/plots`)
      .set('authorization', `Bearer ${agentToken}`)
      .send({
        plotNumber: 'WP10-PLOT-1',
        boundary,
        surveyMethod: 'WALKED_GPS',
        surveyAccuracyMeters: 8,
        surveyedAt: '2026-08-10T08:00:00.000Z',
      });
  }

  async function login(identifier: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier, password })
      .expect(201);
    return response.body.data.accessToken as string;
  }
});
