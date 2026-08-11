// Money conversion, advance recovery, database invariants and lock ordering are asserted against
// the running database because service-level assertions cannot prove what PostgreSQL itself refuses.
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
const cooperativeAdminId = '00000000-0000-4000-8000-000000000102';
const financeOfficerId = '00000000-0000-4000-8000-000000000104';
const secondFinanceOfficerId = '00000000-0000-4000-8000-00000000fa02';
const secondFinanceOfficerEmail = 'composed.finance@clycites.local';
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
const advanceFarmerId = '00000000-0000-4000-8000-000000000403';

const cherryTotal = '50.0000';
const parchmentQuantity = '10.0000';
const unitPriceMinor = '1200000';
const expectedTotalMinor = 12_000_000n;
const usdToUgxRate = '3800.00000000';
const laterUsdToUgxRate = '4100.00000000';

const shareScopes = [
  'LOT_SUMMARY',
  'QUALITY_DETAILS',
  'CUSTODY_DETAILS',
  'TRACEABILITY_LINEAGE',
  'DOCUMENTS',
] as const;

const forbiddenShareTokens = [
  'latitude',
  'longitude',
  'centroidLatitude',
  'centroidLongitude',
  'boundary',
  'primaryPhone',
  'alternativePhone',
  'dateOfBirth',
  'village',
  'nationalId',
] as const;

interface ComposedPath {
  lotId: string;
  proceedsId: string;
}

interface SettlementSnapshot {
  run: Record<string, string | null>;
  farmerSettlements: Array<Record<string, string>>;
}

describe.sequential('Commerce hardening invariants', () => {
  let app: INestApplication;
  let adminToken: string;
  let agentToken: string;
  let buyerToken: string;
  let financeToken: string;
  let verifierToken: string;
  let ugxSettlementRunId: string;
  let ugxLotId: string;
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
        organizationId_userId: { organizationId: cooperativeId, userId: secondFinanceOfficerId },
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

    // Advances survive a previous run of this spec and would be recovered before the one under test.
    await database.farmerAdvance.updateMany({
      where: { organizationId: cooperativeId, status: 'OUTSTANDING' },
      data: {
        status: 'WRITTEN_OFF',
        writtenOffAt: new Date(),
        writtenOffByUserId: financeOfficerId,
        writeOffReason: 'Reset by commerce-hardening test fixture',
      },
    });

    // Plot geometry only exists once a plot is surveyed, and the seed surveys none.
    const farm = await database.farm.findFirstOrThrow({
      where: { farmerId: deliveries[0].farmerId },
      select: { id: true },
    });
    await database.farmPlot.upsert({
      where: { farmId_plotNumber: { farmId: farm.id, plotNumber: 'WP14-PLOT-1' } },
      update: { centroidLatitude: '0.123456', centroidLongitude: '29.654321' },
      create: {
        farmId: farm.id,
        plotNumber: 'WP14-PLOT-1',
        boundary: {
          type: 'Polygon',
          coordinates: [
            [
              [29.654321, 0.123456],
              [29.6555, 0.123456],
              [29.6555, 0.1245],
              [29.654321, 0.1245],
              [29.654321, 0.123456],
            ],
          ],
        },
        vertexCount: 5,
        centroidLatitude: '0.123456',
        centroidLongitude: '29.654321',
        computedHectares: '1.4000',
        surveyMethod: 'WALKED_GPS',
        surveyAccuracyMeters: 8,
        surveyedAt: new Date(),
        surveyedByUserId: cooperativeAdminId,
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

  it('refuses a cross-currency settlement run that carries no recorded rate, leaving no partial run', async () => {
    const path = await composedPath('USD', 'x1');
    const settlementNumber = `STL-HRD-X1-${suffix}`;

    const response = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/finance/settlements`)
      .set('authorization', `Bearer ${financeToken}`)
      .send({
        settlementNumber,
        currency: 'UGX',
        saleProceedsRecordIds: [path.proceedsId],
      });

    expect(response.status, JSON.stringify(response.body)).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(response.body.error.code).toBe('EXCHANGE_RATE_REQUIRED');

    const persisted = await database.settlementRun.findFirst({
      where: { organizationId: cooperativeId, settlementNumber },
    });
    expect(persisted).toBeNull();
  });

  it('snapshots the exchange rate it used so a later rate cannot move settled money', async () => {
    const path = await composedPath('USD', 'x2');
    const rateId = await recordRate(usdToUgxRate, new Date());

    const created = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/finance/settlements`)
      .set('authorization', `Bearer ${financeToken}`)
      .send({
        settlementNumber: `STL-HRD-X2-${suffix}`,
        currency: 'UGX',
        saleProceedsRecordIds: [path.proceedsId],
        exchangeRateId: rateId,
      });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const runId = created.body.data.id as string;

    const calculated = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/finance/settlements/${runId}/calculate`)
      .set('authorization', `Bearer ${financeToken}`)
      .send({ version: 1 });
    expect(calculated.status, JSON.stringify(calculated.body)).toBe(201);

    const before = await settlementSnapshot(runId);
    expect(before.run.exchangeRateApplied).toBe(usdToUgxRate);
    expect(before.run.exchangeRateId).toBe(rateId);
    expect(before.run.sourceCurrency).toBe('USD');
    expect(before.run.currency).toBe('UGX');
    expect(before.run.sourceTotalMinor).toBe((expectedTotalMinor * 3800n).toString());
    expect(before.farmerSettlements.length).toBe(deliveries.length);

    await recordRate(laterUsdToUgxRate, new Date(Date.now() + 3_600_000));

    const after = await settlementSnapshot(runId);
    expect(after).toEqual(before);

    const message = await rejectionOf(
      () =>
        database.$executeRaw`UPDATE "ExchangeRate" SET "rate" = ${'9999.00000000'}::decimal WHERE id = ${rateId}::uuid`,
    );
    expect(message).toContain('ExchangeRate is append-only');
    const rate = await database.exchangeRate.findUniqueOrThrow({ where: { id: rateId } });
    expect(rate.rate.toFixed(8)).toBe(usdToUgxRate);
  });

  it('never recovers more from a farmer advance than its outstanding balance', async () => {
    const issued = 9_000_000n;
    const advance = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/finance/farmer-advances`)
      .set('authorization', `Bearer ${financeToken}`)
      .send({
        farmerId: advanceFarmerId,
        reference: `ADV-HRD-${suffix}`,
        currency: 'UGX',
        issuedAmountMinor: issued.toString(),
        issuedAt: new Date().toISOString(),
      });
    expect(advance.status, JSON.stringify(advance.body)).toBe(201);
    const advanceId = advance.body.data.id as string;
    const outstandingBefore = BigInt(advance.body.data.outstandingMinor as string);
    expect(outstandingBefore).toBe(issued);

    const path = await composedPath('UGX', 'x3');
    ugxLotId = path.lotId;

    const created = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/finance/settlements`)
      .set('authorization', `Bearer ${financeToken}`)
      .send({
        settlementNumber: `STL-HRD-X3-${suffix}`,
        currency: 'UGX',
        saleProceedsRecordIds: [path.proceedsId],
      });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    ugxSettlementRunId = created.body.data.id as string;

    const calculated = await request(app.getHttpServer())
      .post(
        `/api/v1/organizations/${cooperativeId}/finance/settlements/${ugxSettlementRunId}/calculate`,
      )
      .set('authorization', `Bearer ${financeToken}`)
      .send({ version: 1 });
    expect(calculated.status, JSON.stringify(calculated.body)).toBe(201);

    const settlement = await database.farmerSettlement.findFirstOrThrow({
      where: { settlementRunId: ugxSettlementRunId, farmerId: advanceFarmerId },
    });
    const recovery = await database.farmerAdvanceRecovery.findFirstOrThrow({
      where: { farmerAdvanceId: advanceId },
      include: { settlementDeduction: true },
    });
    const settled = await database.farmerAdvance.findUniqueOrThrow({ where: { id: advanceId } });

    expect(settlement.grossEntitlementMinor).toBeLessThan(issued);
    expect(recovery.settlementDeduction.amountMinor).toBeLessThanOrEqual(outstandingBefore);
    expect(recovery.settlementDeduction.source).toBe('ADVANCE_RECOVERY');
    expect(settled.outstandingMinor).toBe(issued - recovery.settlementDeduction.amountMinor);
    expect(settled.outstandingMinor >= 0n).toBe(true);
    expect(settlement.netEntitlementMinor >= 0n).toBe(true);
    expect(settlement.carriedForwardMinor > 0n).toBe(true);

    const message = await rejectionOf(
      () =>
        database.$executeRaw`UPDATE "FarmerAdvance" SET "outstandingMinor" = -1 WHERE id = ${advanceId}::uuid`,
    );
    expect(message).toContain('FarmerAdvance_outstanding_range_check');
    const unchanged = await database.farmerAdvance.findUniqueOrThrow({ where: { id: advanceId } });
    expect(unchanged.outstandingMinor).toBe(settled.outstandingMinor);
  });

  it('enforces the settlement identity in the database, not only in the service', async () => {
    const target = await database.farmerSettlement.findFirstOrThrow({
      where: { settlementRunId: ugxSettlementRunId, carriedForwardMinor: 0n },
    });

    const identityMessage = await rejectionOf(
      () =>
        database.$executeRaw`UPDATE "FarmerSettlement" SET "netEntitlementMinor" = "netEntitlementMinor" + 1 WHERE id = ${target.id}::uuid`,
    );
    expect(identityMessage).toContain('FarmerSettlement_identity_check');
    const afterIdentity = await database.farmerSettlement.findUniqueOrThrow({
      where: { id: target.id },
    });
    expect(afterIdentity).toEqual(target);

    // Gross and deductions move together so only a non-negative rule can reject this statement.
    const negativeMessage = await rejectionOf(
      () =>
        database.$executeRaw`UPDATE "FarmerSettlement" SET "netEntitlementMinor" = -1, "grossEntitlementMinor" = 0, "deductionsTotalMinor" = 1, "adjustmentsTotalMinor" = 0 WHERE id = ${target.id}::uuid`,
    );
    // FarmerSettlement_net_non_negative_check is redundant: the older money rule is evaluated first.
    expect(negativeMessage).toContain('FarmerSettlement_money_nonnegative');
    const netRule = await database.$queryRaw<Array<{ definition: string; validated: boolean }>>`
      SELECT pg_get_constraintdef(oid) AS definition, convalidated AS validated
      FROM pg_constraint
      WHERE conname = 'FarmerSettlement_net_non_negative_check'
        AND conrelid = '"FarmerSettlement"'::regclass`;
    expect(netRule).toHaveLength(1);
    expect(netRule[0]?.validated).toBe(true);
    expect(netRule[0]?.definition).toContain('"netEntitlementMinor" >= 0');
    const afterNegative = await database.farmerSettlement.findUniqueOrThrow({
      where: { id: target.id },
    });
    expect(afterNegative).toEqual(target);
  });

  // Regression barrier: the share projection is believed safe already, so this must pass as written.
  it('exposes no farm coordinates or plot geometry through any traceability share scope', async () => {
    const farms = await database.farm.findMany({
      where: { farmerId: { in: deliveries.map((delivery) => delivery.farmerId) } },
      select: { id: true, latitude: true, longitude: true },
    });
    const plots = await database.farmPlot.findMany({
      where: { farmId: { in: farms.map((farm) => farm.id) } },
      select: { centroidLatitude: true, centroidLongitude: true },
    });
    const coordinates = [
      ...farms.flatMap((farm) => [farm.latitude, farm.longitude]),
      ...plots.flatMap((plot) => [plot.centroidLatitude, plot.centroidLongitude]),
    ].filter((value): value is NonNullable<typeof value> => value !== null);
    const coordinateStrings = [
      ...new Set(coordinates.flatMap((value) => [value.toString(), value.toFixed(6)])),
    ];
    expect(coordinateStrings.length).toBeGreaterThan(0);

    const scopeSets: Array<readonly string[]> = [
      shareScopes,
      ...shareScopes.map((scope) => [scope]),
    ];
    for (const scopes of scopeSets) {
      const share = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${cooperativeId}/commerce/traceability-shares`)
        .set('authorization', `Bearer ${adminToken}`)
        .send({
          buyerOrganizationId: buyerId,
          lotId: ugxLotId,
          scopes,
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        });
      expect(share.status, JSON.stringify(share.body)).toBe(201);
      const shareId = share.body.data.id as string;

      const trace = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${buyerId}/commerce/traceability-shares/${shareId}`)
        .set('authorization', `Bearer ${buyerToken}`);
      expect(trace.status, JSON.stringify(trace.body)).toBe(200);

      const serialized = JSON.stringify(trace.body);
      for (const token of forbiddenShareTokens) {
        expect(serialized, `${scopes.join('+')} leaked ${token}`).not.toContain(token);
      }
      for (const value of coordinateStrings) {
        expect(serialized, `${scopes.join('+')} leaked coordinate ${value}`).not.toContain(value);
      }
    }
  });

  it('serialises competing commercial operations on one lot instead of deadlocking', async () => {
    const lotId = await directLot('100.0000');
    const listing = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/marketplace/listings`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        lotId,
        listingNumber: `LST-HRD-RACE-${suffix}`,
        title: 'Lock ordering race parchment',
        listedQuantity: '100.0000',
        currency: 'UGX',
        pricingMethod: 'NEGOTIABLE',
        allowPartialQuantity: true,
        visibility: 'PUBLIC_BUYERS',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      });
    expect(listing.status, JSON.stringify(listing.body)).toBe(201);
    const listingId = listing.body.data.id as string;
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/marketplace/listings/${listingId}/publish`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ version: 1 })
      .expect(201);

    const outcomes: Array<{ orderStatus: number; cancelStatus: number }> = [];
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const contractId = await activeContract(listingId, attempt);
      const contract = await database.salesContract.findUniqueOrThrow({
        where: { id: contractId },
        select: { reservationId: true },
      });
      const reservation = await database.lotReservation.findUniqueOrThrow({
        where: { id: contract.reservationId },
        select: { id: true, version: true },
      });

      const [order, cancel] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/v1/organizations/${cooperativeId}/commerce/contracts/${contractId}/orders`)
          .set('authorization', `Bearer ${adminToken}`)
          .send({ fulfillmentMethod: 'Cooperative delivery to buyer store' }),
        request(app.getHttpServer())
          .post(
            `/api/v1/organizations/${cooperativeId}/commerce/reservations/${reservation.id}/cancel`,
          )
          .set('authorization', `Bearer ${adminToken}`)
          .send({ version: reservation.version, reason: 'Concurrent lock ordering probe' }),
      ]);

      const responses = [order, cancel];
      for (const response of responses) {
        expect(
          response.status,
          `attempt ${attempt} returned 500: ${JSON.stringify(response.body)}`,
        ).not.toBe(500);
        expect(JSON.stringify(response.body).toLowerCase()).not.toContain('deadlock');
      }
      const succeeded = responses.filter((response) => response.status < 300);
      const conflicted = responses.filter((response) => [409, 422].includes(response.status));
      expect(
        succeeded.length,
        `attempt ${attempt} outcomes ${order.status}/${cancel.status}: ${JSON.stringify(order.body)} ${JSON.stringify(cancel.body)}`,
      ).toBe(1);
      expect(conflicted.length).toBe(1);
      expect(typeof conflicted[0]?.body.error.code).toBe('string');
      outcomes.push({ orderStatus: order.status, cancelStatus: cancel.status });
    }
    expect(outcomes.length).toBe(10);
    console.log(`RACE_OUTCOMES ${JSON.stringify(outcomes)}`);
  });

  async function composedPath(currency: string, tag: string): Promise<ComposedPath> {
    const deliveryIds: string[] = [];
    for (const delivery of deliveries) {
      deliveryIds.push(await recordDelivery(delivery.farmerId, delivery.quantity));
    }

    const batch = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/batches`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        batchNumber: `BAT-HRD-${tag}-${suffix}`,
        commodityId,
        commodityFormId: cherryFormId,
      })
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
        transformationNumber: `TRH-${tag}-${suffix}`,
        type: 'TRANSFORMATION',
        inputs: [{ batchId, quantity: cherryTotal, unit: 'KG' }],
        lossReason: 'PULP_REMOVAL',
        outputs: [
          {
            batchNumber: `BAT-HRD-${tag}-OUT-${suffix}`,
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
        lotNumber: `LOT-HRD-${tag}-${suffix}`,
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
        listingNumber: `LST-HRD-${tag}-${suffix}`,
        title: 'Hardening path parchment',
        listedQuantity: parchmentQuantity,
        currency,
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
        currency,
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
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${buyerId}/commerce/contracts/${contract.id}/approve`)
      .set('authorization', `Bearer ${buyerToken}`)
      .send({ version: contract.version + 1 })
      .expect(201);

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
        transferNumber: `CT-HRD-${tag}-${suffix}`,
        toOrganizationId: buyerId,
        quantity: parchmentQuantity,
        unit: 'KG',
      })
      .expect(201);
    const transferId = transfer.body.data.id as string;

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/commerce/orders/${orderId}/custody-transfer`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ custodyTransferId: transferId, version: order.body.data.version as number })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/custody-transfers/${transferId}/dispatch`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/commerce/orders/${orderId}/sync-custody`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${buyerId}/custody-transfers/${transferId}/receive`)
      .set('authorization', `Bearer ${buyerToken}`)
      .send({ accepted: true })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${buyerId}/commerce/orders/${orderId}/sync-custody`)
      .set('authorization', `Bearer ${buyerToken}`)
      .expect(201);

    const inspection = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${buyerId}/commerce/orders/${orderId}/inspections`)
      .set('authorization', `Bearer ${buyerToken}`)
      .send({
        inspectionNumber: `BIN-HRD-${tag}-${suffix}`,
        sampledAt: new Date().toISOString(),
        status: 'COMPLETED',
        measurements: [],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${buyerId}/commerce/orders/${orderId}/acceptance`)
      .set('authorization', `Bearer ${buyerToken}`)
      .send({
        decision: 'ACCEPTED',
        acceptedQuantity: parchmentQuantity,
        rejectedQuantity: '0.0000',
        buyerInspectionId: inspection.body.data.id as string,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/commerce/orders/${orderId}/complete`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(201);

    const proceeds = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/finance/sale-proceeds`)
      .set('authorization', `Bearer ${financeToken}`)
      .send({
        orderId,
        proceedsNumber: `PRC-HRD-${tag}-${suffix}`,
        currency,
        expectedAmountMinor: expectedTotalMinor.toString(),
        recordedAmountMinor: expectedTotalMinor.toString(),
        source: 'BANK_STATEMENT',
        externalReference: `TXN-HRD-${tag}-${suffix}`,
      })
      .expect(201);
    const proceedsId = proceeds.body.data.id as string;

    const verified = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/finance/sale-proceeds/${proceedsId}/verify`)
      .set('authorization', `Bearer ${verifierToken}`)
      .send({ version: 1 })
      .expect(201);
    expect(verified.body.data.status).toBe('VERIFIED');

    return { lotId, proceedsId };
  }

  async function activeContract(listingId: string, attempt: number): Promise<string> {
    const offer = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${buyerId}/marketplace/listings/${listingId}/offers`)
      .set('authorization', `Bearer ${buyerToken}`)
      .send({
        quantity: '5.0000',
        unitPriceMinor: '1000',
        currency: 'UGX',
        deliveryTerm: `Race probe ${attempt}`,
        validUntil: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .expect(201);
    const offerId = offer.body.data.id as string;
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
    const activated = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${buyerId}/commerce/contracts/${contract.id}/approve`)
      .set('authorization', `Bearer ${buyerToken}`)
      .send({ version: contract.version + 1 })
      .expect(201);
    expect(activated.body.data.status).toBe('ACTIVE');
    return contract.id;
  }

  async function directLot(quantity: string): Promise<string> {
    const lotId = crypto.randomUUID();
    await database.cooperativeLot.create({
      data: {
        id: lotId,
        publicId: `lot1_hrd_${lotId.replaceAll('-', '')}`,
        lotNumber: `LOT-HRD-RACE-${suffix}`,
        organizationId: cooperativeId,
        commodityId,
        commodityFormId: parchmentFormId,
        status: 'APPROVED',
        quantity,
        createdByUserId: cooperativeAdminId,
      },
    });
    await database.qualityInspection.create({
      data: {
        organizationId: cooperativeId,
        lotId,
        status: 'PASSED',
        inspectorUserId: cooperativeAdminId,
        inspectedAt: new Date(),
      },
    });
    return lotId;
  }

  async function recordRate(rate: string, effectiveAt: Date): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/finance/exchange-rates`)
      .set('authorization', `Bearer ${financeToken}`)
      .send({
        baseCurrency: 'USD',
        quoteCurrency: 'UGX',
        rate,
        source: 'CENTRAL_BANK',
        sourceReference: `BOU-${suffix}-${rate}`,
        effectiveAt: effectiveAt.toISOString(),
      });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return response.body.data.id as string;
  }

  async function settlementSnapshot(runId: string): Promise<SettlementSnapshot> {
    const run = await database.settlementRun.findUniqueOrThrow({ where: { id: runId } });
    const farmerSettlements = await database.farmerSettlement.findMany({
      where: { settlementRunId: runId },
      orderBy: { farmerId: 'asc' },
    });
    return {
      run: {
        currency: run.currency,
        sourceCurrency: run.sourceCurrency,
        exchangeRateId: run.exchangeRateId,
        exchangeRateApplied: run.exchangeRateApplied?.toFixed(8) ?? null,
        sourceTotalMinor: run.sourceTotalMinor.toString(),
        grossAllocatedMinor: run.grossAllocatedMinor.toString(),
        deductionsTotalMinor: run.deductionsTotalMinor.toString(),
        adjustmentsTotalMinor: run.adjustmentsTotalMinor.toString(),
        netSettlementTotalMinor: run.netSettlementTotalMinor.toString(),
        roundingResidualMinor: run.roundingResidualMinor.toString(),
      },
      farmerSettlements: farmerSettlements.map((settlement) => ({
        farmerId: settlement.farmerId,
        currency: settlement.currency,
        grossEntitlementMinor: settlement.grossEntitlementMinor.toString(),
        deductionsTotalMinor: settlement.deductionsTotalMinor.toString(),
        adjustmentsTotalMinor: settlement.adjustmentsTotalMinor.toString(),
        carriedForwardMinor: settlement.carriedForwardMinor.toString(),
        netEntitlementMinor: settlement.netEntitlementMinor.toString(),
      })),
    };
  }

  async function rejectionOf(statement: () => Promise<unknown>): Promise<string> {
    try {
      await statement();
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    throw new Error('The database accepted a statement that must have been rejected');
  }

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

  async function login(email: string) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: email, password })
      .expect(201);
    return response.body.data.accessToken as string;
  }
});
