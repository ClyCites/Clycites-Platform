import 'reflect-metadata';

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';

const cooperativeId = '00000000-0000-4000-8000-000000000201';
const recipientId = '00000000-0000-4000-8000-000000000202';
const commodityId = '00000000-0000-4000-8000-000000000801';
const cherryFormId = '00000000-0000-4000-8000-000000000811';
const parchmentFormId = '00000000-0000-4000-8000-000000000813';
const qualityDefinitionId = '00000000-0000-4000-8000-000000000823';
const cooperativeStorageLocationId = '00000000-0000-4000-8000-000000000f01';
const password = process.env.SEED_STAFF_PASSWORD ?? 'ClyCites-local-2026!';

describe.sequential('Phase 3 traceability API', () => {
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

  it('rejects cross-organization access before service queries execute', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${recipientId}/batches`)
      .set('authorization', `Bearer ${agentToken}`)
      .expect(403);
  });

  it('replays safe offline batch creation exactly once', async () => {
    const operationId = crypto.randomUUID();
    const batchId = crypto.randomUUID();
    const payload = {
      deviceId: '00000000-0000-4000-8000-000000000901',
      operations: [
        {
          clientOperationId: operationId,
          clientEntityId: batchId,
          clientCreatedAt: new Date().toISOString(),
          baseVersion: null,
          operationType: 'CREATE_BATCH',
          payload: {
            clientBatchId: batchId,
            batchNumber: `OFF-${suffix}`,
            commodityId,
            commodityFormId: cherryFormId,
          },
        },
      ],
    };
    const first = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/offline-sync`)
      .set('authorization', `Bearer ${agentToken}`)
      .send(payload)
      .expect(201);
    const replay = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/offline-sync`)
      .set('authorization', `Bearer ${agentToken}`)
      .send(payload)
      .expect(201);
    expect(first.body.data.operations[0]).toMatchObject({
      status: 'PROCESSED',
      serverEntityId: batchId,
    });
    expect(replay.body.data.operations).toEqual(first.body.data.operations);
  });

  it('enforces quantity conservation through lot approval, custody, and publication', async () => {
    const clientEntityId = crypto.randomUUID();
    const clientCreatedAt = new Date().toISOString();
    const delivery = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/deliveries`)
      .set('authorization', `Bearer ${agentToken}`)
      .set('idempotency-key', crypto.randomUUID())
      .send({
        clientEntityId,
        deviceId: '00000000-0000-4000-8000-000000000901',
        collectionSessionId: '00000000-0000-4000-8000-000000000902',
        collectionPointId: '00000000-0000-4000-8000-000000000301',
        farmerId: '00000000-0000-4000-8000-000000000401',
        commodityId,
        commodityFormId: cherryFormId,
        clientCreatedAt,
        weight: { mode: 'DIRECT_NET', netQuantity: '52.0000', unit: 'KG', captureMethod: 'MANUAL' },
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
    const createdBatch = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/batches`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ batchNumber: `BAT-TEST-${suffix}`, commodityId, commodityFormId: cherryFormId })
      .expect(201);
    const batchId = createdBatch.body.data.id as string;
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/batches/${batchId}/contributions`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ deliveryId, quantity: '52.0000', unit: 'KG' })
      .expect(201);
    const overAllocation = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/batches/${batchId}/contributions`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ deliveryId, quantity: '0.0001', unit: 'KG' })
      .expect(409);
    expect(overAllocation.body.error.code).toBe('INSUFFICIENT_AVAILABLE_QUANTITY');
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/batches/${batchId}/seal`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(201);

    const invalidSplit = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/batch-transformations`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        transformationNumber: `TR-INVALID-${suffix}`,
        type: 'SPLIT',
        inputs: [{ batchId, quantity: '52.0000', unit: 'KG' }],
        outputs: [
          {
            batchNumber: `BAT-INVALID-${suffix}`,
            commodityId,
            commodityFormId: parchmentFormId,
            quantity: '51.0000',
            unit: 'KG',
          },
        ],
      })
      .expect(409);
    expect(invalidSplit.body.error.code).toBe('COMMODITY_MISMATCH');

    const transformed = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/batch-transformations`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        transformationNumber: `TR-TEST-${suffix}`,
        type: 'SPLIT',
        inputs: [{ batchId, quantity: '52.0000', unit: 'KG' }],
        outputs: [
          {
            batchNumber: `BAT-OUT-${suffix}`,
            commodityId,
            commodityFormId: cherryFormId,
            quantity: '51.0000',
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
        lotNumber: `LOT-TEST-${suffix}`,
        commodityId,
        commodityFormId: cherryFormId,
        contributions: [{ batchId: outputBatchId, quantity: '51.0000' }],
      })
      .expect(201);
    const lotId = lot.body.data.id as string;
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/lots/${lotId}/approve`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(409);
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/lots/${lotId}/inspections`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        status: 'PASSED',
        inspectedAt: new Date().toISOString(),
        measurements: [
          { qualityAttributeDefinitionId: qualityDefinitionId, dataType: 'ENUM', value: 'RED' },
        ],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/lots/${lotId}/approve`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/lots/${lotId}/custody-transfers`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        transferNumber: `CT-INVALID-${suffix}`,
        toOrganizationId: recipientId,
        destinationLocationId: cooperativeStorageLocationId,
        quantity: '51.0000',
        unit: 'KG',
      })
      .expect(422);
    const transfer = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/lots/${lotId}/custody-transfers`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        transferNumber: `CT-TEST-${suffix}`,
        toOrganizationId: recipientId,
        quantity: '51.0000',
        unit: 'KG',
      })
      .expect(201);
    const transferId = transfer.body.data.id as string;
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/custody-transfers/${transferId}/dispatch`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${recipientId}/custody-transfers/${transferId}/receive`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ accepted: true })
      .expect(201);
    const published = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/lots/${lotId}/publish`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        originDistrict: 'Kasese',
        harvestSeason: '2026 test crop',
        processingSummary: 'Test traceability processing record.',
      })
      .expect(201);
    const publicId = published.body.data.publication.publicId as string;
    const publicResponse = await request(app.getHttpServer())
      .get(`/api/v1/traceability/lots/${publicId}`)
      .expect(200);
    expect(publicResponse.body.data).toMatchObject({
      lotNumber: `LOT-TEST-${suffix}`,
      status: 'APPROVED',
      quantity: '51',
    });
    expect(JSON.stringify(publicResponse.body.data)).not.toMatch(/farmer|deliveryId|farmId|notes/i);
  });

  it('serves the seeded public trace without private source identifiers', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/traceability/lots/tr1_local_export_2026')
      .expect(200);
    expect(response.body.data).toMatchObject({
      lotNumber: 'LOT-KIS-2026-001',
      originDistrict: 'Kasese',
    });
    expect(JSON.stringify(response.body.data)).not.toContain(
      '00000000-0000-4000-8000-000000000401',
    );
  });

  async function login(email: string) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: email, password })
      .expect(201);
    return response.body.data.accessToken as string;
  }
});
