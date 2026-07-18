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
const farmerId = '00000000-0000-4000-8000-000000000401';
const commodityId = '00000000-0000-4000-8000-000000000801';
const commodityFormId = '00000000-0000-4000-8000-000000000811';
const qualityDefinitionId = '00000000-0000-4000-8000-000000000823';
const deviceId = '00000000-0000-4000-8000-000000000901';
const collectionSessionId = '00000000-0000-4000-8000-000000000902';
const password = process.env.SEED_STAFF_PASSWORD ?? 'ClyCites-local-2026!';
const testPrefix = '20000000-0000-4000-8000-00000000';
const offlineOperationIds = [`${testPrefix}0201`, `${testPrefix}0202`];

describe.sequential('Phase 2 API', () => {
  let app: INestApplication;
  let agentToken: string;
  let adminToken: string;
  const deliveryIds: string[] = [];

  beforeAll(async () => {
    await database.offlineOperation.deleteMany({
      where: { deviceId, clientOperationId: { in: offlineOperationIds } },
    });
    await database.registeredDevice.update({
      where: { id: deviceId },
      data: { status: 'ACTIVE', revokedAt: null },
    });
    await database.collectionSession.update({
      where: { id: collectionSessionId },
      data: { status: 'OPEN', closedAt: null },
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
    await database.offlineOperation.deleteMany({
      where: { deviceId, clientOperationId: { in: offlineOperationIds } },
    });
    const created = await database.delivery.findMany({
      where: { OR: [{ id: { in: deliveryIds } }, { publicId: { startsWith: 'phase2_test_' } }] },
      select: { id: true },
    });
    const ids = created.map((delivery) => delivery.id);
    await database.offlineOperation.deleteMany({ where: { clientEntityId: { in: ids } } });
    await database.deliveryCorrectionRequest.deleteMany({ where: { deliveryId: { in: ids } } });
    await database.deliveryReceipt.deleteMany({ where: { deliveryId: { in: ids } } });
    await database.deliveryConfirmation.deleteMany({ where: { deliveryId: { in: ids } } });
    await database.deliveryQualityMeasurement.deleteMany({ where: { deliveryId: { in: ids } } });
    await database.deliveryPricing.deleteMany({ where: { deliveryId: { in: ids } } });
    await database.deliveryMeasurement.deleteMany({ where: { deliveryId: { in: ids } } });
    await database.auditEvent.deleteMany({ where: { entityId: { in: ids } } });
    await database.outboxEvent.deleteMany({ where: { aggregateId: { in: ids } } });
    await database.delivery.deleteMany({ where: { id: { in: ids } } });
    await database.idempotencyRecord.deleteMany({
      where: { scopeId: { startsWith: `delivery:${organizationId}:` } },
    });
    await database.session.deleteMany({
      where: {
        userId: {
          in: ['00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000103'],
        },
      },
    });
    await app.close();
    await database.$disconnect();
  });

  it('creates accepted delivery facts and a receipt atomically with fixed-point totals', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/deliveries`)
      .set('authorization', `Bearer ${agentToken}`)
      .set('idempotency-key', `${testPrefix}0001`)
      .send(deliveryPayload(`${testPrefix}0101`, '12.3456'))
      .expect(201);
    deliveryIds.push(response.body.data.id);
    expect(response.body.data).toMatchObject({
      status: 'ACCEPTED',
      netQuantity: '12.3456',
      netAmountMinor: '37037',
    });
    expect(
      await database.deliveryMeasurement.count({ where: { deliveryId: response.body.data.id } }),
    ).toBe(1);
    expect(
      await database.deliveryPricing.count({ where: { deliveryId: response.body.data.id } }),
    ).toBe(1);
    expect(
      await database.deliveryQualityMeasurement.count({
        where: { deliveryId: response.body.data.id },
      }),
    ).toBe(1);
    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/deliveries/${response.body.data.id}/receipt`)
      .set('authorization', `Bearer ${agentToken}`)
      .expect(200)
      .expect((receipt) =>
        expect(receipt.body.data.statement).toMatch(/not necessarily proof of final payment/),
      );
  });

  it('replays the same idempotency key and rejects a changed payload', async () => {
    const key = `${testPrefix}0002`;
    const entityId = `${testPrefix}0102`;
    const payload = deliveryPayload(entityId, '10.0000');
    const first = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/deliveries`)
      .set('authorization', `Bearer ${agentToken}`)
      .set('idempotency-key', key)
      .send(payload)
      .expect(201);
    deliveryIds.push(first.body.data.id);
    const replay = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/deliveries`)
      .set('authorization', `Bearer ${agentToken}`)
      .set('idempotency-key', key)
      .send(payload)
      .expect(201);
    expect(replay.body.data.id).toBe(first.body.data.id);
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/deliveries`)
      .set('authorization', `Bearer ${agentToken}`)
      .set('idempotency-key', key)
      .send(deliveryPayload(entityId, '11.0000'))
      .expect(409);
  });

  it('returns stable partial offline outcomes and replays them', async () => {
    const validOperationId = `${testPrefix}0201`;
    const invalidOperationId = `${testPrefix}0202`;
    const entityId = `${testPrefix}0103`;
    const batch = {
      deviceId,
      operations: [
        {
          clientOperationId: validOperationId,
          clientEntityId: entityId,
          clientCreatedAt: new Date().toISOString(),
          baseVersion: null,
          operationType: 'CREATE_DELIVERY',
          payload: deliveryPayload(entityId, '9.0000'),
        },
        {
          clientOperationId: invalidOperationId,
          clientEntityId: `${testPrefix}0104`,
          clientCreatedAt: new Date().toISOString(),
          baseVersion: null,
          operationType: 'CREATE_DELIVERY',
          payload: {
            ...deliveryPayload(`${testPrefix}0104`, '9.0000'),
            commodityFormId: `${testPrefix}0999`,
          },
        },
      ],
    };
    const first = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/offline-sync`)
      .set('authorization', `Bearer ${agentToken}`)
      .send(batch)
      .expect(201);
    const firstData = first.body as {
      data: { operations: { status: string; serverEntityId: string | null }[] };
    };
    expect(firstData.data.operations.map((operation) => operation.status)).toEqual([
      'PROCESSED',
      'REJECTED',
    ]);
    const createdId = firstData.data.operations[0]?.serverEntityId;
    if (!createdId) throw new Error('Synced delivery ID missing');
    deliveryIds.push(createdId);
    const replay = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/offline-sync`)
      .set('authorization', `Bearer ${agentToken}`)
      .send(batch)
      .expect(201);
    expect(replay.body.data.operations).toEqual(firstData.data.operations);
  });

  it('requires a separate supervisor and creates immutable correction and receipt versions', async () => {
    const create = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/deliveries`)
      .set('authorization', `Bearer ${agentToken}`)
      .set('idempotency-key', `${testPrefix}0004`)
      .send(deliveryPayload(`${testPrefix}0105`, '15.0000'))
      .expect(201);
    deliveryIds.push(create.body.data.id);
    const correction = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/deliveries/${create.body.data.id}/corrections`)
      .set('authorization', `Bearer ${agentToken}`)
      .send({
        reasonCode: 'WEIGHT_ENTRY_ERROR',
        reason: 'Scale ticket shows sixteen kilograms.',
        proposedChanges: {
          weight: {
            mode: 'DIRECT_NET',
            netQuantity: '16.0000',
            unit: 'KG',
            captureMethod: 'MANUAL',
          },
        },
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(
        `/api/v1/organizations/${organizationId}/deliveries/${create.body.data.id}/corrections/${correction.body.data.id}/approve`,
      )
      .set('authorization', `Bearer ${agentToken}`)
      .send({ reviewNotes: 'Self approval attempt' })
      .expect(403);
    const approved = await request(app.getHttpServer())
      .post(
        `/api/v1/organizations/${organizationId}/deliveries/${create.body.data.id}/corrections/${correction.body.data.id}/approve`,
      )
      .set('authorization', `Bearer ${adminToken}`)
      .send({ reviewNotes: 'Compared with signed scale ticket.' })
      .expect(201);
    deliveryIds.push(approved.body.data.id);
    expect(approved.body.data).toMatchObject({
      version: 2,
      status: 'ACCEPTED',
      supersedesDeliveryId: create.body.data.id,
      netQuantity: '16',
    });
    const original = await database.delivery.findUniqueOrThrow({
      where: { id: create.body.data.id },
      include: { receipts: true },
    });
    expect(original.status).toBe('CORRECTED');
    expect(original.receipts[0]?.status).toBe('SUPERSEDED');
  });

  function deliveryPayload(clientEntityId: string, netQuantity: string) {
    const clientCreatedAt = new Date().toISOString();
    return {
      clientEntityId,
      deviceId,
      collectionSessionId,
      collectionPointId,
      farmerId,
      commodityId,
      commodityFormId,
      clientCreatedAt,
      weight: { mode: 'DIRECT_NET', netQuantity, unit: 'KG', captureMethod: 'MANUAL' },
      pricing: {
        unitPriceMinor: '3000',
        currency: 'UGX',
        adjustmentAmountMinor: '0',
        priceSource: 'COLLECTION_POINT',
      },
      qualityMeasurements: [
        {
          qualityAttributeDefinitionId: qualityDefinitionId,
          dataType: 'ENUM',
          value: 'RED',
          capturedAt: clientCreatedAt,
        },
      ],
      confirmation: {
        method: 'VERBAL_WITNESSED',
        status: 'CONFIRMED',
        confirmedByName: 'Amina Nakato',
        confirmedAt: clientCreatedAt,
      },
      submit: true,
      accept: true,
    };
  }

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(201);
    return response.body.data.accessToken as string;
  }
});
