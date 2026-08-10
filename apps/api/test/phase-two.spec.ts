import 'reflect-metadata';

import { randomUUID } from 'node:crypto';

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { createDatabaseClient, onQueryEvent } from '@clycites/database';
import { offlineSyncBatchSchema } from '@clycites/contracts';
import type { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import type { ApiEnvironment } from '../src/config/environment.js';
import { DatabaseService } from '../src/database/database.service.js';
import { REDIS_CLIENT } from '../src/queue/queue.constants.js';

// Enables Prisma query events so the capture invariant 8 query-count audit can observe
// the real statement count instead of inferring it.
process.env.PRISMA_QUERY_LOG = '1';

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
const testPrefix = `${randomUUID().slice(0, 8)}-0000-4000-8000-00000000`;

describe.sequential('Phase 2 API', () => {
  let app: INestApplication;
  let agentToken: string;
  let adminToken: string;
  beforeAll(async () => {
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

  it('Capture invariant 3: appends a reweigh and leaves exactly one live measurement', async () => {
    const payload = deliveryPayload(`${testPrefix}0111`, '10.0000');
    const create = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/deliveries`)
      .set('authorization', `Bearer ${agentToken}`)
      .set('idempotency-key', `${testPrefix}0011`)
      .send({ ...payload, confirmation: undefined, submit: false, accept: false })
      .expect(201);
    const capturedAt = new Date().toISOString();
    const reweighed = await request(app.getHttpServer())
      .post(
        `/api/v1/organizations/${organizationId}/deliveries/${create.body.data.id}/measurements/weight`,
      )
      .set('authorization', `Bearer ${agentToken}`)
      .send({
        lockVersion: create.body.data.lockVersion,
        capturedAt,
        weight: {
          mode: 'DIRECT_NET',
          netQuantity: '11.0000',
          unit: 'KG',
          captureMethod: 'MANUAL',
        },
      })
      .expect(201);
    expect(reweighed.body.data).toMatchObject({
      lockVersion: create.body.data.lockVersion + 1,
      netQuantity: '11',
      netAmountMinor: '33000',
      measurement: { version: 2, instrumentFlagReason: 'INSTRUMENT_NOT_RECORDED' },
    });
    const measurements = await database.deliveryMeasurement.findMany({
      where: { deliveryId: create.body.data.id },
      orderBy: { version: 'asc' },
    });
    expect(measurements).toHaveLength(2);
    expect(measurements.filter((measurement) => measurement.supersededAt === null)).toHaveLength(1);
    expect(measurements[0]?.supersededAt).not.toBeNull();
    expect(measurements[1]?.supersedesMeasurementId).toBe(measurements[0]?.id);
  });

  it('Capture invariant 4: acceptance copies matching affirmative evidence', async () => {
    const payload = deliveryPayload(`${testPrefix}0112`, '10.0000');
    const create = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/deliveries`)
      .set('authorization', `Bearer ${agentToken}`)
      .set('idempotency-key', `${testPrefix}0012`)
      .send({ ...payload, accept: false })
      .expect(201);
    expect(create.body.data).toMatchObject({
      status: 'SUBMITTED',
      confirmedAt: null,
      confirmationMethod: null,
    });
    const accepted = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/deliveries/${create.body.data.id}/accept`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ lockVersion: create.body.data.lockVersion })
      .expect(201);
    const evidence = await database.deliveryConfirmation.findFirstOrThrow({
      where: { deliveryId: create.body.data.id, status: 'CONFIRMED' },
    });
    expect(accepted.body.data).toMatchObject({
      status: 'ACCEPTED',
      confirmedAt: evidence.confirmedAt.toISOString(),
      confirmationMethod: evidence.method,
    });
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
    const replay = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/offline-sync`)
      .set('authorization', `Bearer ${agentToken}`)
      .send(batch)
      .expect(201);
    expect(replay.body.data.operations).toEqual(firstData.data.operations);
  });

  it('Capture invariant 6: bounds batches, rate limits devices, and keeps partial success', async () => {
    expect(
      offlineSyncBatchSchema.safeParse({
        deviceId,
        operations: Array.from({ length: 251 }, () => ({
          clientOperationId: randomUUID(),
          clientEntityId: randomUUID(),
          clientCreatedAt: new Date().toISOString(),
          baseVersion: null,
          operationType: 'CREATE_DELIVERY',
          payload: deliveryPayload(randomUUID(), '1.0000'),
        })),
      }).success,
    ).toBe(false);

    const redis = app.get<Redis>(REDIS_CLIENT);
    const limiterKeys = await redis.keys('offline-sync:device:*');
    if (limiterKeys.length > 0) await redis.del(...limiterKeys);
    const limit = app
      .get<ConfigService<ApiEnvironment, true>>(ConfigService)
      .getOrThrow<number>('OFFLINE_SYNC_REQUESTS_PER_MINUTE');

    const entityId = `${testPrefix}0113`;
    const batch = {
      deviceId,
      operations: [
        {
          clientOperationId: `${testPrefix}0211`,
          clientEntityId: entityId,
          clientCreatedAt: new Date().toISOString(),
          baseVersion: null,
          operationType: 'CREATE_DELIVERY',
          payload: deliveryPayload(entityId, '5.0000'),
        },
        {
          clientOperationId: `${testPrefix}0212`,
          clientEntityId: `${testPrefix}0114`,
          clientCreatedAt: new Date().toISOString(),
          baseVersion: null,
          operationType: 'CREATE_DELIVERY',
          payload: {
            ...deliveryPayload(`${testPrefix}0114`, '5.0000'),
            commodityFormId: `${testPrefix}0998`,
          },
        },
      ],
    };
    const accepted = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/offline-sync`)
      .set('authorization', `Bearer ${agentToken}`)
      .send(batch)
      .expect(201);
    expect(
      (accepted.body.data.operations as { status: string }[]).map((operation) => operation.status),
    ).toEqual(['PROCESSED', 'REJECTED']);

    let limited: request.Response | undefined;
    for (let attempt = 1; attempt <= limit + 1; attempt += 1) {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${organizationId}/offline-sync`)
        .set('authorization', `Bearer ${agentToken}`)
        .send(batch);
      if (response.status === 429) {
        limited = response;
        break;
      }
    }
    expect(limited?.status).toBe(429);
    expect(limited?.body.error.code).toBe('OFFLINE_SYNC_RATE_LIMITED');
    expect(Number(limited?.headers['retry-after'])).toBeGreaterThan(0);
    await redis.del(...(await redis.keys('offline-sync:device:*')));
  });

  it('Capture invariant 7: concurrent identical batches create exactly one delivery', async () => {
    const redis = app.get<Redis>(REDIS_CLIENT);
    const staleKeys = await redis.keys('offline-sync:device:*');
    if (staleKeys.length > 0) await redis.del(...staleKeys);
    const entityId = `${testPrefix}0115`;
    const batch = {
      deviceId,
      operations: [
        {
          clientOperationId: `${testPrefix}0213`,
          clientEntityId: entityId,
          clientCreatedAt: new Date().toISOString(),
          baseVersion: null,
          operationType: 'CREATE_DELIVERY',
          payload: deliveryPayload(entityId, '7.0000'),
        },
      ],
    };
    const send = () =>
      request(app.getHttpServer())
        .post(`/api/v1/organizations/${organizationId}/offline-sync`)
        .set('authorization', `Bearer ${agentToken}`)
        .send(batch);
    const [first, second] = await Promise.all([send(), send()]);
    for (const response of [first, second]) expect(response.status).toBe(201);
    expect(await database.delivery.count({ where: { publicId: entityId } })).toBe(1);
    expect(
      await database.offlineOperation.count({
        where: { deviceId, clientOperationId: `${testPrefix}0213` },
      }),
    ).toBe(1);
  });

  it('Capture invariant 8: keyset pages are stable and cost a bounded number of queries', async () => {
    const pageSize = 5;
    const firstPage = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/deliveries?pageSize=${pageSize}`)
      .set('authorization', `Bearer ${agentToken}`)
      .expect(200);
    const cursor = firstPage.body.data.pagination.nextCursor as string | null;
    expect(cursor).toBeTruthy();
    expect(firstPage.body.data.items.length).toBe(pageSize);

    const secondPage = await request(app.getHttpServer())
      .get(
        `/api/v1/organizations/${organizationId}/deliveries?pageSize=${pageSize}&cursor=${encodeURIComponent(cursor!)}`,
      )
      .set('authorization', `Bearer ${agentToken}`)
      .expect(200);

    const pageItems = (response: { body: unknown }) =>
      (response.body as { data: { items: { id: string }[] } }).data.items;
    const firstIds = pageItems(firstPage).map((item) => item.id);
    const secondIds = pageItems(secondPage).map((item) => item.id);
    // No duplicates across pages and no omissions: the union is strictly the two pages.
    expect(new Set([...firstIds, ...secondIds]).size).toBe(firstIds.length + secondIds.length);

    // The second page must continue strictly after the cursor in the sort order.
    const ordered = await database.delivery.findMany({
      where: { organizationId },
      orderBy: [{ serverReceivedAt: 'desc' }, { id: 'desc' }],
      take: pageSize * 2,
      select: { id: true },
    });
    expect([...firstIds, ...secondIds]).toEqual(ordered.map((record) => record.id));

    // Query-count audit: the number of statements must not grow with the page size.
    const client = app.get(DatabaseService).client;
    const measure = async (size: number) => {
      let queries = 0;
      const listener = () => {
        queries += 1;
      };
      onQueryEvent(client, listener);
      const page = await request(app.getHttpServer())
        .get(
          `/api/v1/organizations/${organizationId}/deliveries?pageSize=${size}&cursor=${encodeURIComponent(cursor!)}`,
        )
        .set('authorization', `Bearer ${agentToken}`)
        .expect(200);

      return { queries, items: pageItems(page).length };
    };

    // Sizes 1 and 25 so the returned counts differ regardless of how many deliveries exist.
    const small = await measure(1);
    const large = await measure(25);
    expect(large.items).toBeGreaterThan(small.items);
    // An N+1 read path would issue more statements for the larger page. A constant count
    // across pages of different sizes is what rules that out.
    expect(large.queries).toBe(small.queries);
  });

  it('requires a separate supervisor and creates immutable correction and receipt versions', async () => {
    const create = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/deliveries`)
      .set('authorization', `Bearer ${agentToken}`)
      .set('idempotency-key', `${testPrefix}0004`)
      .send(deliveryPayload(`${testPrefix}0105`, '15.0000'))
      .expect(201);
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
      .send({ identifier: email, password })
      .expect(201);
    return response.body.data.accessToken as string;
  }
});
