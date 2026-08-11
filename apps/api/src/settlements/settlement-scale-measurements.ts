import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import type { AuthenticatedPrincipal } from '@clycites/auth';
import type { Queue } from 'bullmq';

import { AnchorEligibilityService } from '../anchoring/anchor-eligibility.service.js';
import { AuditService } from '../audit/audit.service.js';
import { DomainEventService } from '../audit/domain-event.service.js';
import type { ApiEnvironment } from '../config/environment.js';
import { DatabaseService } from '../database/database.service.js';
import { PaymentEncryptionService } from './payment-encryption.service.js';
import { SettlementsService } from './settlements.service.js';

/**
 * Explicit, opt-in measurement of the settlement calculation path at cooperative scale.
 * Never part of `db:seed` and never imported by the application.
 *
 * It builds a complete composed commerce path - N farmer deliveries, one aggregation
 * batch, one transformation to parchment, one lot, listing, offer, reservation,
 * contract, order, buyer acceptance and verified sale proceeds - writing directly
 * through Prisma rather than over HTTP, then calls SettlementsService.calculateSettlementRun
 * while counting every SQL statement Prisma issues and timing the call.
 *
 * Statement counting uses Prisma query events (PRISMA_QUERY_LOG=1), not pg_stat_statements,
 * so the count is exactly what this call issued and nothing else.
 *
 * Everything it creates is tagged WP14-% and removed at the end.
 */

const TAG = 'WP14';
const organizationId = '00000000-0000-4000-8000-000000000201';
const buyerOrganizationId = '00000000-0000-4000-8000-000000000202';
const commodityId = '00000000-0000-4000-8000-000000000801';
const cherryFormId = '00000000-0000-4000-8000-000000000811';
const parchmentFormId = '00000000-0000-4000-8000-000000000813';
const adminUserId = '00000000-0000-4000-8000-000000000102';
const agentUserId = '00000000-0000-4000-8000-000000000103';
const financeUserId = '00000000-0000-4000-8000-000000000104';
const buyerUserId = '00000000-0000-4000-8000-000000000105';
const collectionPointId = '00000000-0000-4000-8000-000000000301';
const collectionSessionId = '00000000-0000-4000-8000-000000000902';

const CHERRY_PER_FARMER = 10;
const PARCHMENT_RATIO = 0.2;
const UNIT_PRICE_MINOR = 1_200_000n;

const farmerCounts = (process.env.FARMERS ?? '50,200,800')
  .split(',')
  .map((value) => Number.parseInt(value.trim(), 10))
  .filter((value) => Number.isInteger(value) && value > 0);
if (farmerCounts.length === 0) throw new Error('FARMERS must be a comma separated list of counts');

interface QueryEvent {
  readonly query: string;
  readonly params: string;
  readonly duration: number;
}
interface QueryEmitter {
  $on: (event: 'query', listener: (payload: QueryEvent) => void) => void;
}

// The client only emits query events when this is set before it is constructed, because
// the event payload carries statement text.
process.env.PRISMA_QUERY_LOG = '1';
const database = new DatabaseService();
const client = database.client;
const config = new ConfigService<ApiEnvironment, true>(process.env);
const settlements = new SettlementsService(
  database,
  new AuditService(database),
  new DomainEventService(new AnchorEligibilityService(config), config),
  new PaymentEncryptionService(config),
  {} as Queue,
);

const principal: AuthenticatedPrincipal = {
  subjectId: financeUserId,
  sessionId: randomUUID(),
  memberships: new Map(),
};

let recording = false;
let captured: QueryEvent[] = [];
(client as unknown as QueryEmitter).$on('query', (event) => {
  if (recording) captured.push(event);
});

const quantity = (value: number): string => value.toFixed(4);

const cleanup = async (): Promise<void> => {
  const runs = `SELECT id FROM "SettlementRun" WHERE "settlementNumber" LIKE '${TAG}-%'`;
  const farmerSettlements = `SELECT id FROM "FarmerSettlement" WHERE "settlementRunId" IN (${runs})`;
  const orders = `SELECT id FROM "SalesOrder" WHERE "orderNumber" LIKE '${TAG}-%'`;
  const transformations = `SELECT id FROM "BatchTransformation" WHERE "transformationNumber" LIKE '${TAG}-%'`;
  const statements = [
    `DELETE FROM "SettlementAllocation" WHERE "settlementRunId" IN (${runs})`,
    `DELETE FROM "FarmerAdvanceRecovery" WHERE "settlementDeductionId" IN (SELECT id FROM "SettlementDeduction" WHERE "farmerSettlementId" IN (${farmerSettlements}))`,
    `DELETE FROM "SettlementDeduction" WHERE "farmerSettlementId" IN (${farmerSettlements})`,
    `DELETE FROM "SettlementException" WHERE "settlementRunId" IN (${runs})`,
    `DELETE FROM "FarmerStatement" WHERE "farmerSettlementId" IN (${farmerSettlements})`,
    `DELETE FROM "PaymentInstruction" WHERE "farmerSettlementId" IN (${farmerSettlements})`,
    `DELETE FROM "FarmerSettlement" WHERE "settlementRunId" IN (${runs})`,
    `DELETE FROM "SettlementRunOrder" WHERE "settlementRunId" IN (${runs})`,
    `DELETE FROM "SettlementRunStatusEvent" WHERE "settlementRunId" IN (${runs})`,
    `DELETE FROM "SettlementRun" WHERE "settlementNumber" LIKE '${TAG}-%'`,
    `DELETE FROM "SaleProceedsRecord" WHERE "proceedsNumber" LIKE '${TAG}-%'`,
    `DELETE FROM "BuyerAcceptance" WHERE "orderId" IN (${orders})`,
    `DELETE FROM "OrderStatusEvent" WHERE "orderId" IN (${orders})`,
    `DELETE FROM "SalesOrder" WHERE "orderNumber" LIKE '${TAG}-%'`,
    `DELETE FROM "SalesContract" WHERE "contractNumber" LIKE '${TAG}-%'`,
    `DELETE FROM "LotReservation" WHERE "reservationNumber" LIKE '${TAG}-%'`,
    `DELETE FROM "Offer" WHERE "offerNumber" LIKE '${TAG}-%'`,
    `DELETE FROM "MarketplaceListing" WHERE "listingNumber" LIKE '${TAG}-%'`,
    `DELETE FROM "CooperativeLotContribution" WHERE "lotId" IN (SELECT id FROM "CooperativeLot" WHERE "lotNumber" LIKE '${TAG}-%')`,
    `DELETE FROM "CooperativeLot" WHERE "lotNumber" LIKE '${TAG}-%'`,
    `DELETE FROM "FarmerBatchContribution" WHERE "batchId" IN (SELECT id FROM "ProduceBatch" WHERE "batchNumber" LIKE '${TAG}-%')`,
    `DELETE FROM "BatchTransformationInput" WHERE "transformationId" IN (${transformations})`,
    `DELETE FROM "BatchTransformationOutput" WHERE "transformationId" IN (${transformations})`,
    `DELETE FROM "BatchTransformation" WHERE "transformationNumber" LIKE '${TAG}-%'`,
    `DELETE FROM "ProduceBatch" WHERE "batchNumber" LIKE '${TAG}-%'`,
    `DELETE FROM "Delivery" WHERE "deliveryNumber" LIKE '${TAG}-%'`,
    `DELETE FROM "FarmerOrganizationMembership" WHERE "membershipNumber" LIKE '${TAG}-%'`,
    `DELETE FROM "Farmer" WHERE "farmerNumber" LIKE '${TAG}-%'`,
  ];
  // Several of these tables are append-only in production; the guard triggers are suspended
  // here because this harness runs only against a disposable measurement database.
  await client.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
  for (const statement of statements) await client.$executeRawUnsafe(statement);
  await client.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
};

interface Fixture {
  readonly settlementRunId: string;
  readonly lotId: string;
  readonly parchmentBatchId: string;
  readonly farmerCount: number;
}

const buildFixture = async (farmerCount: number): Promise<Fixture> => {
  const scope = `${TAG}-${farmerCount}`;
  const cherryTotal = farmerCount * CHERRY_PER_FARMER;
  const parchmentTotal = cherryTotal * PARCHMENT_RATIO;

  const farmers = Array.from({ length: farmerCount }, (_, index) => ({
    id: randomUUID(),
    index,
  }));
  await client.farmer.createMany({
    data: farmers.map(({ id, index }) => ({
      id,
      farmerNumber: `${scope}-F${String(index).padStart(5, '0')}`,
      firstName: 'Scale',
      lastName: `Farmer${index}`,
      district: 'Kisoro',
      status: 'ACTIVE' as const,
      registeredByUserId: adminUserId,
    })),
  });
  const memberships = farmers.map(({ id, index }) => ({
    id: randomUUID(),
    farmerId: id,
    index,
  }));
  await client.farmerOrganizationMembership.createMany({
    data: memberships.map(({ id, farmerId, index }) => ({
      id,
      farmerId,
      organizationId,
      membershipNumber: `${scope}-M${String(index).padStart(5, '0')}`,
      status: 'ACTIVE' as const,
      joinedAt: new Date(),
    })),
  });
  const deliveries = memberships.map((membership) => ({
    id: randomUUID(),
    farmerId: membership.farmerId,
    membershipId: membership.id,
    index: membership.index,
  }));
  await client.delivery.createMany({
    data: deliveries.map((delivery) => ({
      id: delivery.id,
      publicId: `dlv1_${delivery.id.replaceAll('-', '')}`,
      deliveryNumber: `${scope}-D${String(delivery.index).padStart(5, '0')}`,
      organizationId,
      collectionPointId,
      collectionSessionId,
      farmerId: delivery.farmerId,
      farmerOrganizationMembershipId: delivery.membershipId,
      commodityId,
      commodityFormId: cherryFormId,
      status: 'ACCEPTED' as const,
      source: 'ONLINE' as const,
      clientCreatedAt: new Date(),
      acceptedAt: new Date(),
      acceptedByUserId: agentUserId,
      createdByUserId: agentUserId,
    })),
  });

  const cherryBatchId = randomUUID();
  const parchmentBatchId = randomUUID();
  await client.produceBatch.createMany({
    data: [
      {
        id: cherryBatchId,
        publicId: `pb1_${cherryBatchId.replaceAll('-', '')}`,
        batchNumber: `${scope}-BATCH-CHERRY`,
        organizationId,
        commodityId,
        commodityFormId: cherryFormId,
        operationType: 'AGGREGATION' as const,
        status: 'CONSUMED' as const,
        initialQuantity: quantity(cherryTotal),
        sealedAt: new Date(),
        createdByUserId: adminUserId,
      },
      {
        id: parchmentBatchId,
        publicId: `pb1_${parchmentBatchId.replaceAll('-', '')}`,
        batchNumber: `${scope}-BATCH-PARCHMENT`,
        organizationId,
        commodityId,
        commodityFormId: parchmentFormId,
        operationType: 'TRANSFORMATION' as const,
        status: 'SEALED' as const,
        initialQuantity: quantity(parchmentTotal),
        sealedAt: new Date(),
        createdByUserId: adminUserId,
      },
    ],
  });
  await client.farmerBatchContribution.createMany({
    data: deliveries.map((delivery) => ({
      batchId: cherryBatchId,
      deliveryId: delivery.id,
      quantity: quantity(CHERRY_PER_FARMER),
      origin: 'DIRECT' as const,
    })),
  });

  const transformationId = randomUUID();
  await client.batchTransformation.create({
    data: {
      id: transformationId,
      organizationId,
      transformationNumber: `${scope}-TR`,
      type: 'TRANSFORMATION',
      status: 'COMPLETED',
      lossQuantity: quantity(cherryTotal - parchmentTotal),
      lossReason: 'PULP_REMOVAL',
      completedByUserId: adminUserId,
      completedAt: new Date(),
      inputs: {
        create: [{ batchId: cherryBatchId, quantity: quantity(cherryTotal), unit: 'KG' }],
      },
      outputs: {
        create: [{ batchId: parchmentBatchId, quantity: quantity(parchmentTotal), unit: 'KG' }],
      },
    },
  });
  // The transformation service also writes DERIVED attribution onto the output batch.
  // Settlement filters those out, but leaving them out would understate the row volume
  // the whole-organization batch read has to walk past.
  await client.farmerBatchContribution.createMany({
    data: deliveries.map((delivery) => ({
      batchId: parchmentBatchId,
      deliveryId: delivery.id,
      quantity: quantity(CHERRY_PER_FARMER * PARCHMENT_RATIO),
      origin: 'DERIVED' as const,
      transformationId,
    })),
  });

  const lotId = randomUUID();
  await client.cooperativeLot.create({
    data: {
      id: lotId,
      publicId: `lot1_${lotId.replaceAll('-', '')}`,
      lotNumber: `${scope}-LOT`,
      organizationId,
      commodityId,
      commodityFormId: parchmentFormId,
      status: 'APPROVED',
      quantity: quantity(parchmentTotal),
      createdByUserId: adminUserId,
      contributions: {
        create: [{ batchId: parchmentBatchId, quantity: quantity(parchmentTotal), unit: 'KG' }],
      },
    },
  });

  const totalAmountMinor = BigInt(Math.round(parchmentTotal)) * UNIT_PRICE_MINOR;
  const listingId = randomUUID();
  await client.marketplaceListing.create({
    data: {
      id: listingId,
      publicId: `lst1_${listingId.replaceAll('-', '')}`,
      listingNumber: `${scope}-LST`,
      sellerOrganizationId: organizationId,
      lotId,
      status: 'FULLY_RESERVED',
      title: 'Scale measurement parchment',
      listedQuantity: quantity(parchmentTotal),
      availableQuantity: quantity(0),
      currency: 'UGX',
      pricingMethod: 'NEGOTIABLE',
      allowPartialQuantity: false,
      visibility: 'PUBLIC_BUYERS',
      publishedAt: new Date(),
      createdByUserId: adminUserId,
    },
  });
  const offerId = randomUUID();
  await client.offer.create({
    data: {
      id: offerId,
      publicId: `ofr1_${offerId.replaceAll('-', '')}`,
      offerNumber: `${scope}-OFR`,
      listingId,
      sellerOrganizationId: organizationId,
      buyerOrganizationId,
      status: 'ACCEPTED',
      quantity: quantity(parchmentTotal),
      unitPriceMinor: UNIT_PRICE_MINOR,
      currency: 'UGX',
      totalAmountMinor,
      deliveryTerm: 'Buyer pickup at cooperative store',
      validUntil: new Date(Date.now() + 86_400_000),
      submittedByUserId: buyerUserId,
      respondedByUserId: adminUserId,
      respondedAt: new Date(),
    },
  });
  const reservationId = randomUUID();
  await client.lotReservation.create({
    data: {
      id: reservationId,
      reservationNumber: `${scope}-RSV`,
      lotId,
      listingId,
      offerId,
      sellerOrganizationId: organizationId,
      buyerOrganizationId,
      quantity: quantity(parchmentTotal),
      status: 'CONSUMED',
      expiresAt: new Date(Date.now() + 86_400_000),
      consumedAt: new Date(),
    },
  });
  const contractId = randomUUID();
  await client.salesContract.create({
    data: {
      id: contractId,
      publicId: `sct1_${contractId.replaceAll('-', '')}`,
      contractNumber: `${scope}-CTR`,
      listingId,
      offerId,
      reservationId,
      sellerOrganizationId: organizationId,
      buyerOrganizationId,
      lotId,
      status: 'FULFILLED',
      quantity: quantity(parchmentTotal),
      unitPriceMinor: UNIT_PRICE_MINOR,
      currency: 'UGX',
      totalAmountMinor,
      deliveryTerm: 'Buyer pickup at cooperative store',
      paymentTerms: 'Net 7 days from acceptance',
      qualityTerms: {},
      sellerApprovedByUserId: adminUserId,
      sellerApprovedAt: new Date(),
      buyerApprovedByUserId: buyerUserId,
      buyerApprovedAt: new Date(),
      activatedAt: new Date(),
    },
  });
  const orderId = randomUUID();
  await client.salesOrder.create({
    data: {
      id: orderId,
      publicId: `ord1_${orderId.replaceAll('-', '')}`,
      orderNumber: `${scope}-ORD`,
      contractId,
      reservationId,
      sellerOrganizationId: organizationId,
      buyerOrganizationId,
      lotId,
      status: 'COMPLETED',
      quantity: quantity(parchmentTotal),
      unitPriceMinor: UNIT_PRICE_MINOR,
      currency: 'UGX',
      totalAmountMinor,
      fulfillmentMethod: 'Cooperative delivery to buyer store',
      completedAt: new Date(),
    },
  });
  await client.buyerAcceptance.create({
    data: {
      orderId,
      decision: 'ACCEPTED',
      acceptedQuantity: quantity(parchmentTotal),
      rejectedQuantity: quantity(0),
      unit: 'KG',
      decidedByUserId: buyerUserId,
      decidedAt: new Date(),
    },
  });
  const proceedsId = randomUUID();
  await client.saleProceedsRecord.create({
    data: {
      id: proceedsId,
      publicId: `prc1_${proceedsId.replaceAll('-', '')}`,
      proceedsNumber: `${scope}-PRC`,
      organizationId,
      orderId,
      contractId,
      buyerOrganizationId,
      status: 'VERIFIED',
      currency: 'UGX',
      expectedAmountMinor: totalAmountMinor,
      recordedAmountMinor: totalAmountMinor,
      source: 'BANK_STATEMENT',
      externalReference: `${scope}-TXN`,
      recordedByUserId: financeUserId,
      verifiedByUserId: adminUserId,
      verifiedAt: new Date(),
    },
  });

  const run = (await settlements.createSettlementRun(
    organizationId,
    {
      settlementNumber: `${scope}-RUN`,
      currency: 'UGX',
      saleProceedsRecordIds: [proceedsId],
    },
    principal,
    randomUUID(),
  )) as { id: string };

  await client.$executeRawUnsafe('ANALYZE "FarmerBatchContribution"');
  await client.$executeRawUnsafe('ANALYZE "Delivery"');
  await client.$executeRawUnsafe('ANALYZE "ProduceBatch"');
  await client.$executeRawUnsafe('ANALYZE "CooperativeLotContribution"');
  await client.$executeRawUnsafe('ANALYZE "FarmerSettlement"');
  await client.$executeRawUnsafe('ANALYZE "SettlementAllocation"');

  return { settlementRunId: run.id, lotId, parchmentBatchId, farmerCount };
};

interface Measurement {
  readonly farmerCount: number;
  readonly statements: number;
  readonly wallClockMs: number;
  readonly events: QueryEvent[];
  readonly status: string;
}

const measure = async (fixture: Fixture): Promise<Measurement> => {
  captured = [];
  recording = true;
  const started = process.hrtime.bigint();
  const result = (await settlements.calculateSettlementRun(
    organizationId,
    fixture.settlementRunId,
    { version: 1 },
    principal,
    randomUUID(),
  )) as { status: string };
  const wallClockMs = Number(process.hrtime.bigint() - started) / 1e6;
  recording = false;
  return {
    farmerCount: fixture.farmerCount,
    statements: captured.length,
    wallClockMs,
    events: [...captured],
    status: result.status,
  };
};

/** Prisma reports parameters separately; EXPLAIN needs them inline. */
const inline = (query: string, params: string): string => {
  let values: unknown[];
  try {
    values = JSON.parse(params) as unknown[];
  } catch {
    return query;
  }
  let sql = query;
  for (let index = values.length; index >= 1; index -= 1) {
    const value = values[index - 1];
    const text =
      typeof value === 'string' ? value : JSON.stringify(value) ?? '';
    const literal =
      value === null || value === undefined
        ? 'NULL'
        : typeof value === 'number' || typeof value === 'boolean'
          ? String(value)
          : `'${text.replaceAll("'", "''")}'`;
    sql = sql.replaceAll(`$${index}`, literal);
  }
  return sql;
};

interface PlanRow {
  readonly 'QUERY PLAN': string;
}

const explainRead = async (label: string, sql: string): Promise<void> => {
  const rows = await client.$queryRawUnsafe<PlanRow[]>(`EXPLAIN (ANALYZE, BUFFERS) ${sql}`);
  console.log(`\n#### ${label}\n`);
  console.log('```');
  console.log(sql.trim());
  console.log('--');
  for (const row of rows) console.log(row['QUERY PLAN']);
  console.log('```');
};

/**
 * A write plan can only be measured by executing the write, and the rows it inserts
 * already exist by the time the measurement runs. The delete and the insert both happen
 * inside a transaction that is always rolled back.
 */
const explainWrite = async (
  label: string,
  settlementRunId: string,
  sql: string,
): Promise<void> => {
  await client
    .$transaction(
      async (transaction) => {
        await transaction.$executeRawUnsafe(`SET LOCAL session_replication_role = 'replica'`);
        await transaction.$executeRawUnsafe(
          `DELETE FROM "SettlementAllocation" WHERE "settlementRunId" = '${settlementRunId}'`,
        );
        await transaction.$executeRawUnsafe(
          `DELETE FROM "SettlementDeduction" WHERE "farmerSettlementId" IN (SELECT id FROM "FarmerSettlement" WHERE "settlementRunId" = '${settlementRunId}')`,
        );
        await transaction.$executeRawUnsafe(
          `DELETE FROM "FarmerSettlement" WHERE "settlementRunId" = '${settlementRunId}'`,
        );
        const rows = await transaction.$queryRawUnsafe<PlanRow[]>(
          `EXPLAIN (ANALYZE, BUFFERS) ${sql}`,
        );
        console.log(`\n#### ${label}\n`);
        console.log('```');
        console.log(sql.trim().slice(0, 600));
        console.log('--');
        for (const row of rows) console.log(row['QUERY PLAN']);
        console.log('```');
        throw new Error('ROLLBACK_MEASUREMENT');
      },
      { timeout: 120_000 },
    )
    .catch((error: unknown) => {
      if (!(error instanceof Error) || error.message !== 'ROLLBACK_MEASUREMENT') throw error;
    });
};

const shape = (query: string): string =>
  query.replace(/\s+/g, ' ').replace(/\$\d+/g, '?').trim().slice(0, 160);

console.log('# Settlement scale measurements\n');
console.log(`Statement counting method: Prisma query events (PRISMA_QUERY_LOG=1).`);
console.log(`Farmer counts: ${farmerCounts.join(', ')}\n`);

await cleanup();

const measurements: Measurement[] = [];
let heaviest: { measurement: Measurement; fixture: Fixture } | undefined;
for (const farmerCount of farmerCounts) {
  const fixture = await buildFixture(farmerCount);
  const measurement = await measure(fixture);
  measurements.push(measurement);
  console.log(
    `- N=${farmerCount}: ${measurement.statements} statements, ${measurement.wallClockMs.toFixed(0)} ms, run status ${measurement.status}`,
  );
  if (!heaviest || farmerCount >= heaviest.fixture.farmerCount) heaviest = { measurement, fixture };
}

console.log('\n## Statement mix at the largest N\n');
const largest = heaviest;
if (!largest) throw new Error('No measurement was taken');
const byShape = new Map<string, { count: number; totalMs: number; event: QueryEvent }>();
for (const event of largest.measurement.events) {
  const key = shape(event.query);
  const existing = byShape.get(key);
  if (existing) {
    existing.count += 1;
    existing.totalMs += event.duration;
    if (event.duration > existing.event.duration) existing.event = event;
  } else {
    byShape.set(key, { count: 1, totalMs: event.duration, event });
  }
}
const ranked = [...byShape.entries()].sort((left, right) => right[1].totalMs - left[1].totalMs);
console.log('| count | total ms | slowest ms | statement |');
console.log('| --- | --- | --- | --- |');
for (const [key, entry] of ranked.slice(0, 15)) {
  console.log(
    `| ${entry.count} | ${entry.totalMs.toFixed(1)} | ${entry.event.duration} | \`${key}\` |`,
  );
}

console.log('\n## EXPLAIN (ANALYZE, BUFFERS) of the heaviest statements\n');
const reads = ranked
  .filter(([key]) => key.startsWith('SELECT'))
  .slice(0, 3)
  .map(([, entry]) => entry.event);
for (const [index, event] of reads.entries()) {
  await explainRead(`Read ${index + 1}`, inline(event.query, event.params));
}
const writes = ranked
  .filter(([key]) => key.startsWith('INSERT'))
  .sort((left, right) => right[1].totalMs - left[1].totalMs)
  .slice(0, 2)
  .map(([, entry]) => entry.event);
for (const [index, event] of writes.entries()) {
  await explainWrite(
    `Write ${index + 1}`,
    largest.fixture.settlementRunId,
    inline(event.query, event.params),
  );
}

console.log('\n## Summary\n');
console.log('| farmers | statements | wall clock ms | statements per farmer |');
console.log('| --- | --- | --- | --- |');
for (const measurement of measurements) {
  console.log(
    `| ${measurement.farmerCount} | ${measurement.statements} | ${measurement.wallClockMs.toFixed(0)} | ${(measurement.statements / measurement.farmerCount).toFixed(2)} |`,
  );
}

await cleanup();
console.log('\nSynthetic fixture removed.');
await database.disconnect();
