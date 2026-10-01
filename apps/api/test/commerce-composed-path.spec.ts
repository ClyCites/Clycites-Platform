// A transformation output batch once reached settlement with zero farmer attribution because no test walked the whole composed path.
import 'reflect-metadata';

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createDatabaseClient } from '@clycites/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';

const cooperativeId = '00000000-0000-4000-8000-000000000201';
const buyerId = '00000000-0000-4000-8000-000000000202';
const commodityId = '00000000-0000-4000-8000-000000000801';
const cherryFormId = '00000000-0000-4000-8000-000000000811';
const parchmentFormId = '00000000-0000-4000-8000-000000000813';
const cherryQualityDefinitionId = '00000000-0000-4000-8000-000000000823';
const parchmentQualityDefinitionId = '00000000-0000-4000-8000-00000000fa01';
const secondFinanceOfficerId = '00000000-0000-4000-8000-00000000fa02';
const secondFinanceOfficerEmail = 'composed.finance@clycites.local';
const financeOfficerId = '00000000-0000-4000-8000-000000000104';
const deviceId = '00000000-0000-4000-8000-000000000901';
const collectionSessionId = '00000000-0000-4000-8000-000000000902';
const collectionPointId = '00000000-0000-4000-8000-000000000301';
const password = process.env.SEED_STAFF_PASSWORD ?? 'ClyCites-local-2026!';
const database = createDatabaseClient();

const deliveries = [
  { farmerId: '00000000-0000-4000-8000-000000000401', quantity: '30.0000' },
  { farmerId: '00000000-0000-4000-8000-000000000402', quantity: '15.0000' },
  { farmerId: '00000000-0000-4000-8000-000000000403', quantity: '5.0000' },
] as const;

const cherryTotal = '50.0000';
const parchmentQuantity = '10.0000';
const unitPriceMinor = '1200000';
const expectedTotalMinor = 12_000_000n;

type FarmerSettlementResponse = {
  farmerId: string;
  grossEntitlementMinor: string;
  deductionsTotalMinor: string;
  adjustmentsTotalMinor: string;
  netEntitlementMinor: string;
};

type SettlementRunResponse = {
  status: string;
  grossAllocatedMinor: string;
  roundingResidualMinor: string;
  farmerSettlements: FarmerSettlementResponse[];
};

describe.sequential('Composed commerce path farmer attribution', () => {
  let app: INestApplication;
  let adminToken: string;
  let agentToken: string;
  let buyerToken: string;
  let financeToken: string;
  let verifierToken: string;
  const suffix = Date.now().toString();

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    await database.qualityAttributeDefinition.upsert({
      where: { id: parchmentQualityDefinitionId },
      update: { status: 'ACTIVE' },
      create: {
        id: parchmentQualityDefinitionId,
        commodityFormId: parchmentFormId,
        organizationId: cooperativeId,
        code: 'PARCHMENT_MOISTURE_PERCENT',
        name: 'Parchment moisture',
        dataType: 'DECIMAL',
        unit: '%',
        required: false,
        minimumValue: '8.000000',
        maximumValue: '14.000000',
        displayOrder: 10,
        status: 'ACTIVE',
      },
    });

    // Verification forbids self-approval, and the cooperative seeds only one finance officer.
    const seededFinanceOfficer = await database.user.findUniqueOrThrow({
      where: { id: financeOfficerId },
      select: { passwordHash: true },
    });
    await database.user.upsert({
      where: { id: secondFinanceOfficerId },
      update: { status: 'ACTIVE', passwordHash: seededFinanceOfficer.passwordHash },
      create: {
        id: secondFinanceOfficerId,
        email: secondFinanceOfficerEmail,
        firstName: 'Joan',
        lastName: 'Akello',
        status: 'ACTIVE',
        passwordHash: seededFinanceOfficer.passwordHash,
        emailVerifiedAt: new Date(),
      },
    });
    await database.organizationMembership.upsert({
      where: {
        organizationId_userId: {
          organizationId: cooperativeId,
          userId: secondFinanceOfficerId,
        },
      },
      update: { role: 'FINANCE_OFFICER', status: 'ACTIVE' },
      create: {
        organizationId: cooperativeId,
        userId: secondFinanceOfficerId,
        role: 'FINANCE_OFFICER',
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });

    adminToken = await login('cooperative.admin@clycites.local');
    agentToken = await login('collection.agent@clycites.local');
    buyerToken = await login('buyer@clycites.local');
    financeToken = await login('finance.officer@clycites.local');
    verifierToken = await login(secondFinanceOfficerEmail);
  });

  afterAll(async () => {
    if (app) await app.close();
    await database.$disconnect();
  });

  it('attributes settlement money to every contributing farmer in delivered proportion', async () => {
    const deliveryIds: string[] = [];
    for (const delivery of deliveries) {
      deliveryIds.push(await recordDelivery(delivery.farmerId, delivery.quantity));
    }

    const batch = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/batches`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ batchNumber: `BAT-CMP-${suffix}`, commodityId, commodityFormId: cherryFormId })
      .expect(201);
    const batchId = batch.body.data.id as string;

    for (const [index, delivery] of deliveries.entries()) {
      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${cooperativeId}/batches/${batchId}/contributions`)
        .set('authorization', `Bearer ${adminToken}`)
        .send({ deliveryId: deliveryIds[index], quantity: delivery.quantity, unit: 'KG' })
        .expect(201);
    }
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/batches/${batchId}/seal`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(201);

    const transformation = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/batch-transformations`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        transformationNumber: `TRC-${suffix}`,
        type: 'TRANSFORMATION',
        inputs: [{ batchId, quantity: cherryTotal, unit: 'KG' }],
        lossReason: 'PULP_REMOVAL',
        outputs: [
          {
            batchNumber: `BAT-CMP-OUT-${suffix}`,
            commodityId,
            commodityFormId: parchmentFormId,
            quantity: parchmentQuantity,
            unit: 'KG',
          },
        ],
      })
      .expect(201);
    const parchmentBatchId = transformation.body.data.outputs[0].batchId as string;

    const lot = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/lots`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        lotNumber: `LOT-CMP-${suffix}`,
        commodityId,
        commodityFormId: parchmentFormId,
        contributions: [{ batchId: parchmentBatchId, quantity: parchmentQuantity }],
      })
      .expect(201);
    const lotId = lot.body.data.id as string;

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/lots/${lotId}/inspections`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        status: 'PASSED',
        inspectedAt: new Date().toISOString(),
        measurements: [
          {
            qualityAttributeDefinitionId: parchmentQualityDefinitionId,
            dataType: 'DECIMAL',
            value: '11.5000',
          },
        ],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/lots/${lotId}/approve`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(201);

    const listing = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/marketplace/listings`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        lotId,
        listingNumber: `LST-CMP-${suffix}`,
        title: 'Composed path parchment',
        listedQuantity: parchmentQuantity,
        currency: 'UGX',
        pricingMethod: 'NEGOTIABLE',
        allowPartialQuantity: false,
        visibility: 'PUBLIC_BUYERS',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .expect(201);
    const listingId = listing.body.data.id as string;
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/marketplace/listings/${listingId}/publish`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ version: 1 })
      .expect(201);

    const offer = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${buyerId}/marketplace/listings/${listingId}/offers`)
      .set('authorization', `Bearer ${buyerToken}`)
      .send({
        quantity: parchmentQuantity,
        unitPriceMinor,
        currency: 'UGX',
        deliveryTerm: 'Buyer pickup at cooperative store',
        validUntil: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .expect(201);
    const offerId = offer.body.data.id as string;
    expect(offer.body.data.totalAmountMinor).toBe(expectedTotalMinor.toString());

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/marketplace/offers/${offerId}/accept`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ version: 1 })
      .expect(201);

    const contract = await database.salesContract.findFirstOrThrow({
      where: { listingId, offerId },
    });
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/commerce/contracts/${contract.id}/approve`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ version: contract.version })
      .expect(201);
    const buyerApproved = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${buyerId}/commerce/contracts/${contract.id}/approve`)
      .set('authorization', `Bearer ${buyerToken}`)
      .send({ version: contract.version + 1 })
      .expect(201);
    expect(buyerApproved.body.data.status).toBe('ACTIVE');

    const order = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/commerce/contracts/${contract.id}/orders`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ fulfillmentMethod: 'Cooperative delivery to buyer store' })
      .expect(201);
    const orderId = order.body.data.id as string;

    const transfer = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/lots/${lotId}/custody-transfers`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        transferNumber: `CT-CMP-${suffix}`,
        toOrganizationId: buyerId,
        quantity: parchmentQuantity,
        unit: 'KG',
      })
      .expect(201);
    const transferId = transfer.body.data.id as string;

    const attached = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/commerce/orders/${orderId}/custody-transfer`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ custodyTransferId: transferId, version: order.body.data.version as number })
      .expect(201);
    expect(attached.body.data.status).toBe('READY_FOR_DISPATCH');

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/custody-transfers/${transferId}/dispatch`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(201);
    const dispatched = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/commerce/orders/${orderId}/sync-custody`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(201);
    expect(dispatched.body.data.status).toBe('IN_TRANSIT');

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${buyerId}/custody-transfers/${transferId}/receive`)
      .set('authorization', `Bearer ${buyerToken}`)
      .send({ accepted: true })
      .expect(201);
    const received = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${buyerId}/commerce/orders/${orderId}/sync-custody`)
      .set('authorization', `Bearer ${buyerToken}`)
      .expect(201);
    expect(received.body.data.status).toBe('PENDING_BUYER_INSPECTION');

    const inspection = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${buyerId}/commerce/orders/${orderId}/inspections`)
      .set('authorization', `Bearer ${buyerToken}`)
      .send({
        inspectionNumber: `BIN-CMP-${suffix}`,
        sampledAt: new Date().toISOString(),
        status: 'COMPLETED',
        measurements: [],
      })
      .expect(201);

    const acceptance = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${buyerId}/commerce/orders/${orderId}/acceptance`)
      .set('authorization', `Bearer ${buyerToken}`)
      .send({
        decision: 'ACCEPTED',
        acceptedQuantity: parchmentQuantity,
        rejectedQuantity: '0.0000',
        buyerInspectionId: inspection.body.data.id as string,
      })
      .expect(201);
    expect(acceptance.body.data.decision).toBe('ACCEPTED');

    const completed = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/commerce/orders/${orderId}/complete`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(201);
    expect(completed.body.data.status).toBe('COMPLETED');

    const proceeds = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/finance/sale-proceeds`)
      .set('authorization', `Bearer ${financeToken}`)
      .send({
        orderId,
        proceedsNumber: `PRC-CMP-${suffix}`,
        currency: 'UGX',
        expectedAmountMinor: expectedTotalMinor.toString(),
        recordedAmountMinor: expectedTotalMinor.toString(),
        source: 'BANK_STATEMENT',
        externalReference: `TXN-CMP-${suffix}`,
      })
      .expect(201);
    const proceedsId = proceeds.body.data.id as string;

    // The recorder cannot verify their own proceeds, so a second finance officer signs off.
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/finance/sale-proceeds/${proceedsId}/verify`)
      .set('authorization', `Bearer ${financeToken}`)
      .send({ version: 1 })
      .expect(409);
    const verified = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/finance/sale-proceeds/${proceedsId}/verify`)
      .set('authorization', `Bearer ${verifierToken}`)
      .send({ version: 1 })
      .expect(201);
    expect(verified.body.data.status).toBe('VERIFIED');

    const run = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/finance/settlements`)
      .set('authorization', `Bearer ${financeToken}`)
      .send({
        settlementNumber: `STL-CMP-${suffix}`,
        currency: 'UGX',
        saleProceedsRecordIds: [proceedsId],
      })
      .expect(201);
    const runId = run.body.data.id as string;
    expect(run.body.data.sourceTotalMinor).toBe(expectedTotalMinor.toString());

    const calculated = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/finance/settlements/${runId}/calculate`)
      .set('authorization', `Bearer ${financeToken}`)
      .send({ version: 1 });
    expect(calculated.status, JSON.stringify(calculated.body)).toBe(201);
    expect(['CALCULATED', 'EXCEPTIONS_PENDING']).toContain(calculated.body.data.status as string);

    const settlement = (
      await request(app.getHttpServer())
        .get(`/api/v1/organizations/${cooperativeId}/finance/settlements/${runId}`)
        .set('authorization', `Bearer ${financeToken}`)
        .expect(200)
    ).body.data as SettlementRunResponse;

    // 1. Every delivering farmer is present.
    const settlementByFarmer = new Map(
      settlement.farmerSettlements.map((entry) => [entry.farmerId, entry]),
    );
    for (const delivery of deliveries) {
      expect(
        settlementByFarmer.has(delivery.farmerId),
        `farmer ${delivery.farmerId} is missing from the settlement`,
      ).toBe(true);
    }
    expect(settlement.farmerSettlements).toHaveLength(deliveries.length);

    // 2. Gross entitlement is proportional to delivered cherry weight, in exact integers.
    const grossAllocatedMinor = BigInt(settlement.grossAllocatedMinor);
    const totalWeightUnits = toUnits(cherryTotal);
    for (const delivery of deliveries) {
      const farmerSettlement = settlementByFarmer.get(delivery.farmerId);
      expect(farmerSettlement).toBeDefined();
      if (!farmerSettlement) continue;
      const gross = BigInt(farmerSettlement.grossEntitlementMinor);
      expect(
        gross * totalWeightUnits,
        `farmer ${delivery.farmerId} gross ${gross} is not ${delivery.quantity}/${cherryTotal} of ${grossAllocatedMinor}`,
      ).toBe(grossAllocatedMinor * toUnits(delivery.quantity));
    }

    // 3. No money is created or lost across the run.
    const grossSum = settlement.farmerSettlements.reduce(
      (total, entry) => total + BigInt(entry.grossEntitlementMinor),
      0n,
    );
    expect(grossSum + BigInt(settlement.roundingResidualMinor)).toBe(grossAllocatedMinor);
    expect(grossAllocatedMinor).toBe(expectedTotalMinor);

    // 4. Net entitlement is exactly gross less deductions plus adjustments.
    for (const entry of settlement.farmerSettlements) {
      expect(BigInt(entry.netEntitlementMinor)).toBe(
        BigInt(entry.grossEntitlementMinor) -
          BigInt(entry.deductionsTotalMinor) +
          BigInt(entry.adjustmentsTotalMinor),
      );
    }
  });

  async function recordDelivery(farmerId: string, quantity: string): Promise<string> {
    const clientCreatedAt = new Date().toISOString();
    const response = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/deliveries`)
      .set('authorization', `Bearer ${agentToken}`)
      .set('idempotency-key', crypto.randomUUID())
      .send({
        clientEntityId: crypto.randomUUID(),
        deviceId,
        collectionSessionId,
        collectionPointId,
        farmerId,
        commodityId,
        commodityFormId: cherryFormId,
        clientCreatedAt,
        weight: { mode: 'DIRECT_NET', netQuantity: quantity, unit: 'KG', captureMethod: 'MANUAL' },
        pricing: {
          unitPriceMinor: '3000',
          currency: 'UGX',
          adjustmentAmountMinor: '0',
          priceSource: 'COLLECTION_POINT',
        },
        qualityMeasurements: [
          {
            qualityAttributeDefinitionId: cherryQualityDefinitionId,
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
    return response.body.data.id as string;
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
