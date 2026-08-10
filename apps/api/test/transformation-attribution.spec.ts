import 'reflect-metadata';

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';

const cooperativeId = '00000000-0000-4000-8000-000000000201';
const commodityId = '00000000-0000-4000-8000-000000000801';
const cherryFormId = '00000000-0000-4000-8000-000000000811';
const parchmentFormId = '00000000-0000-4000-8000-000000000813';
const qualityDefinitionId = '00000000-0000-4000-8000-000000000823';
const farmerId = '00000000-0000-4000-8000-000000000401';
const password = process.env.SEED_STAFF_PASSWORD ?? 'ClyCites-local-2026!';

describe.sequential('Transformation attribution', () => {
  let app: INestApplication;
  let adminToken: string;
  let agentToken: string;
  const suffix = Date.now().toString();

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    adminToken = await login('cooperative.admin@clycites.local');
    agentToken = await login('collection.agent@clycites.local');
  });

  afterAll(async () => {
    await app.close();
  });

  it('Transformation invariant 1: a lot built through a transformation reports its contributing farmers', async () => {
    const { lotId, deliveryId } = await buildLotThroughTransformation('INV1');

    const lineage = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${cooperativeId}/lots/${lotId}/lineage`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);

    const farmers = collectFarmerIds(lineage.body.data);
    const deliveries = collectDeliveryIds(lineage.body.data);

    expect(deliveries).toContain(deliveryId);
    expect(farmers).toContain(farmerId);
  });

  it('Transformation invariant 2: derived contributions conserve the output batch quantity', async () => {
    const { outputBatchId } = await buildLotThroughTransformation('INV2');

    const batch = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${cooperativeId}/batches/${outputBatchId}`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);

    const contributions = (batch.body.data.contributions ?? []) as {
      quantity: string;
      origin: string;
    }[];

    expect(contributions.length).toBeGreaterThan(0);
    expect(contributions.every((contribution) => contribution.origin === 'DERIVED')).toBe(true);

    const total = contributions.reduce(
      (sum, contribution) => sum + toUnits(contribution.quantity),
      0n,
    );
    // The output batch was 10.0000kg drawn from a 50.0000kg cherry batch.
    expect(total).toBe(toUnits('10.0000'));
  });

  async function buildLotThroughTransformation(tag: string) {
    const clientCreatedAt = new Date().toISOString();
    const delivery = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/deliveries`)
      .set('authorization', `Bearer ${agentToken}`)
      .set('idempotency-key', crypto.randomUUID())
      .send({
        clientEntityId: crypto.randomUUID(),
        deviceId: '00000000-0000-4000-8000-000000000901',
        collectionSessionId: '00000000-0000-4000-8000-000000000902',
        collectionPointId: '00000000-0000-4000-8000-000000000301',
        farmerId,
        commodityId,
        commodityFormId: cherryFormId,
        clientCreatedAt,
        weight: { mode: 'DIRECT_NET', netQuantity: '50.0000', unit: 'KG', captureMethod: 'MANUAL' },
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
      })
      .expect(201);
    const deliveryId = delivery.body.data.id as string;

    const batch = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/batches`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ batchNumber: `BAT-${tag}-${suffix}`, commodityId, commodityFormId: cherryFormId })
      .expect(201);
    const batchId = batch.body.data.id as string;

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/batches/${batchId}/contributions`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ deliveryId, quantity: '50.0000', unit: 'KG' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/batches/${batchId}/seal`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(201);

    // Cherry -> parchment: the ordinary coffee path, and the one that loses attribution.
    const transformed = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/batch-transformations`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        transformationNumber: `TR-${tag}-${suffix}`,
        type: 'TRANSFORMATION',
        inputs: [{ batchId, quantity: '50.0000', unit: 'KG' }],
        lossReason: 'PULP_REMOVAL',
        outputs: [
          {
            batchNumber: `BAT-OUT-${tag}-${suffix}`,
            commodityId,
            commodityFormId: parchmentFormId,
            quantity: '10.0000',
            unit: 'KG',
          },
        ],
      })
      .expect(201);
    const outputBatchId = transformed.body.data.outputs[0].batchId as string;

    const lot = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/lots`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        lotNumber: `LOT-${tag}-${suffix}`,
        commodityId,
        commodityFormId: parchmentFormId,
        contributions: [{ batchId: outputBatchId, quantity: '10.0000' }],
      })
      .expect(201);

    return { lotId: lot.body.data.id as string, deliveryId, outputBatchId, batchId };
  }

  function collectFarmerIds(value: unknown): string[] {
    const found: string[] = [];
    walk(value, (node) => {
      const farmer = (node as { farmer?: { id?: unknown } }).farmer;
      if (farmer && typeof farmer.id === 'string') found.push(farmer.id);
    });
    return found;
  }

  function collectDeliveryIds(value: unknown): string[] {
    const found: string[] = [];
    walk(value, (node) => {
      const record = node as { deliveryId?: unknown };
      if (typeof record.deliveryId === 'string') found.push(record.deliveryId);
    });
    return found;
  }

  function walk(value: unknown, visit: (node: object) => void) {
    if (Array.isArray(value)) {
      for (const item of value) walk(item, visit);
      return;
    }
    if (value && typeof value === 'object') {
      visit(value);
      for (const item of Object.values(value)) walk(item, visit);
    }
  }

  function toUnits(value: string): bigint {
    const [whole = '0', fraction = ''] = value.split('.');
    return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0').slice(0, 4));
  }

  async function login(email: string) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: email, password })
      .expect(201);
    return response.body.data.accessToken as string;
  }
});
