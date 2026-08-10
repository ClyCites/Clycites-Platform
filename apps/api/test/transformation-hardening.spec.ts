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

type BatchResponse = {
  status: string;
  allocatedQuantity: string;
  contributions?: { quantity: string }[];
};

describe.sequential('Transformation hardening', () => {
  let app: INestApplication;
  let adminToken: string;
  let agentToken: string;
  const suffix = Date.now().toString();
  let counter = 0;

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

  it('Transformation invariant 9: a plausible cherry to parchment yield is recorded and not flagged', async () => {
    const { batchId, tag } = await sealedCherryBatch();
    const response = await transform(batchId, tag, {
      outputQuantity: '10.0000',
      lossReason: 'PULP_REMOVAL',
    }).expect(201);

    expect(Number(response.body.data.yieldRatio)).toBeCloseTo(0.2, 6);
    expect(response.body.data.yieldFlagged).toBe(false);
    expect(response.body.data.yieldFlagReason).toBeNull();
    expect(response.body.data.conversionId).not.toBeNull();
  });

  it('Transformation invariant 10: an implausible yield is flagged but still accepted', async () => {
    const { batchId, tag } = await sealedCherryBatch();
    // 40kg of parchment from 50kg of cherry is roughly double the published ceiling.
    const response = await transform(batchId, tag, {
      outputQuantity: '40.0000',
      lossReason: 'PULP_REMOVAL',
    }).expect(201);

    expect(response.body.data.yieldFlagged).toBe(true);
    expect(response.body.data.yieldFlagReason).toBe('YIELD_OUT_OF_RANGE');
    expect(Number(response.body.data.yieldRatio)).toBeCloseTo(0.8, 6);
  });

  it('Transformation invariant 11: unexplained mass loss is rejected', async () => {
    const { batchId, tag } = await sealedCherryBatch();
    const rejected = await transform(batchId, tag, { outputQuantity: '10.0000' }).expect(422);

    expect(rejected.body.error.code).toBe('TRANSFORMATION_LOSS_REASON_REQUIRED');

    // The same request succeeds once the missing mass is named.
    await transform(batchId, tag, {
      outputQuantity: '10.0000',
      lossReason: 'WATER_LOSS',
    }).expect(201);
  });

  it('Transformation invariant 12: a declared loss quantity must match the quantities', async () => {
    const { batchId, tag } = await sealedCherryBatch();
    const rejected = await transform(batchId, tag, {
      outputQuantity: '10.0000',
      lossReason: 'WATER_LOSS',
      lossQuantity: '5.0000',
    }).expect(422);

    expect(rejected.body.error.code).toBe('TRANSFORMATION_LOSS_QUANTITY_MISMATCH');
  });

  it('Transformation invariant 13: transformation weights record who measured them and on what', async () => {
    const { batchId, tag } = await sealedCherryBatch();
    const unregisteredInstrumentId = crypto.randomUUID();
    const response = await transform(batchId, tag, {
      outputQuantity: '10.0000',
      lossReason: 'PULP_REMOVAL',
      inputInstrumentId: unregisteredInstrumentId,
    }).expect(201);

    const [recordedInput] = response.body.data.inputs as {
      instrumentFlagged: boolean;
      instrumentFlagReason: string;
      reportedInstrumentId: string | null;
      recordedByUserId: string | null;
      captureMethod: string;
    }[];
    expect(recordedInput?.reportedInstrumentId).toBe(unregisteredInstrumentId);
    expect(recordedInput?.instrumentFlagged).toBe(true);
    expect(recordedInput?.instrumentFlagReason).toBe('INSTRUMENT_NOT_REGISTERED');
    expect(recordedInput?.recordedByUserId).not.toBeNull();
    expect(recordedInput?.captureMethod).toBe('MANUAL');

    // An output weighed with no instrument at all is flagged rather than silently trusted.
    const [recordedOutput] = response.body.data.outputs as {
      instrumentFlagged: boolean;
      instrumentFlagReason: string;
    }[];
    expect(recordedOutput?.instrumentFlagged).toBe(true);
    expect(recordedOutput?.instrumentFlagReason).toBe('INSTRUMENT_NOT_RECORDED');
  });

  it('Transformation invariant 14: superseding a transformation reverses it and restores the input', async () => {
    const { batchId, tag } = await sealedCherryBatch();
    const original = await transform(batchId, tag, {
      outputQuantity: '10.0000',
      lossReason: 'PULP_REMOVAL',
    }).expect(201);
    const originalId = original.body.data.id as string;
    const originalOutputBatchId = original.body.data.outputs[0].batchId as string;

    const consumed = await getBatch(batchId);
    expect(consumed.status).toBe('CONSUMED');

    const replacement = await request(app.getHttpServer())
      .post(
        `/api/v1/organizations/${cooperativeId}/batch-transformations/${originalId}/supersede`,
      )
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        reason: 'Output was weighed on an uncalibrated scale',
        replacement: transformationBody(batchId, `${tag}-V2`, {
          outputQuantity: '9.0000',
          lossReason: 'PULP_REMOVAL',
        }),
      })
      .expect(201);

    expect(replacement.body.data.version).toBe(2);
    expect(replacement.body.data.supersedesTransformationId).toBe(originalId);

    // The original survives, marked superseded rather than deleted.
    const originalAfter = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${cooperativeId}/batch-transformations/${originalId}`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(originalAfter.body.data.supersededAt).not.toBeNull();
    expect(originalAfter.body.data.supersessionReason).toBe(
      'Output was weighed on an uncalibrated scale',
    );

    // The reversed output batch is cancelled and its derived attribution withdrawn.
    const cancelled = await getBatch(originalOutputBatchId);
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.contributions ?? []).toHaveLength(0);

    // The input's availability came back and was then spent by the replacement, so the
    // 50kg input is consumed exactly once and not double counted.
    const input = await getBatch(batchId);
    expect(input.status).toBe('CONSUMED');
    expect(input.allocatedQuantity).toBe('50.0000');

    const replacementOutputBatchId = replacement.body.data.outputs[0].batchId as string;
    const replacementBatch = await getBatch(replacementOutputBatchId);
    const total = (replacementBatch.contributions ?? []).reduce(
      (sum, contribution) => sum + toUnits(contribution.quantity),
      0n,
    );
    expect(total).toBe(toUnits('9.0000'));
  });

  it('Transformation invariant 15: a transformation cannot be superseded twice', async () => {
    const { batchId, tag } = await sealedCherryBatch();
    const original = await transform(batchId, tag, {
      outputQuantity: '10.0000',
      lossReason: 'PULP_REMOVAL',
    }).expect(201);
    const originalId = original.body.data.id as string;

    await supersede(originalId, batchId, `${tag}-A`).expect(201);
    const second = await supersede(originalId, batchId, `${tag}-B`).expect(409);
    expect(second.body.error.code).toBe('TRANSFORMATION_ALREADY_SUPERSEDED');
  });

  it('Transformation invariant 16: a transformation whose output has moved on cannot be superseded', async () => {
    const { batchId, tag } = await sealedCherryBatch();
    const original = await transform(batchId, tag, {
      outputQuantity: '10.0000',
      lossReason: 'PULP_REMOVAL',
    }).expect(201);
    const originalId = original.body.data.id as string;
    const outputBatchId = original.body.data.outputs[0].batchId as string;

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/lots`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        lotNumber: `LOT-${tag}-${suffix}`,
        commodityId,
        commodityFormId: parchmentFormId,
        contributions: [{ batchId: outputBatchId, quantity: '10.0000' }],
      })
      .expect(201);

    const rejected = await supersede(originalId, batchId, `${tag}-X`).expect(409);
    expect(rejected.body.error.code).toBe('TRANSFORMATION_OUTPUT_NOT_REVERSIBLE');
  });

  function transformationBody(
    batchId: string,
    tag: string,
    options: {
      outputQuantity: string;
      lossReason?: string;
      lossQuantity?: string;
      inputInstrumentId?: string;
    },
  ) {
    return {
      transformationNumber: `TRH-${tag}-${suffix}`,
      type: 'TRANSFORMATION',
      inputs: [
        {
          batchId,
          quantity: '50.0000',
          unit: 'KG',
          ...(options.inputInstrumentId ? { instrumentId: options.inputInstrumentId } : {}),
        },
      ],
      ...(options.lossReason ? { lossReason: options.lossReason } : {}),
      ...(options.lossQuantity ? { lossQuantity: options.lossQuantity } : {}),
      outputs: [
        {
          batchNumber: `BATH-OUT-${tag}-${suffix}`,
          commodityId,
          commodityFormId: parchmentFormId,
          quantity: options.outputQuantity,
          unit: 'KG',
        },
      ],
    };
  }

  function transform(
    batchId: string,
    tag: string,
    options: {
      outputQuantity: string;
      lossReason?: string;
      lossQuantity?: string;
      inputInstrumentId?: string;
    },
  ) {
    return request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/batch-transformations`)
      .set('authorization', `Bearer ${adminToken}`)
      .send(transformationBody(batchId, tag, options));
  }

  function supersede(transformationId: string, batchId: string, tag: string) {
    return request(app.getHttpServer())
      .post(
        `/api/v1/organizations/${cooperativeId}/batch-transformations/${transformationId}/supersede`,
      )
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        reason: 'Restated after a recount',
        replacement: transformationBody(batchId, tag, {
          outputQuantity: '9.0000',
          lossReason: 'PULP_REMOVAL',
        }),
      });
  }

  async function getBatch(batchId: string): Promise<BatchResponse> {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${cooperativeId}/batches/${batchId}`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);
    return response.body.data as BatchResponse;
  }

  async function sealedCherryBatch() {
    counter += 1;
    const tag = `H${counter}`;
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

    const batch = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/batches`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ batchNumber: `BATH-${tag}-${suffix}`, commodityId, commodityFormId: cherryFormId })
      .expect(201);
    const batchId = batch.body.data.id as string;

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/batches/${batchId}/contributions`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ deliveryId: delivery.body.data.id as string, quantity: '50.0000', unit: 'KG' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/batches/${batchId}/seal`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(201);

    return { batchId, tag };
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
