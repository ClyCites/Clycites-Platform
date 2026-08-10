import { createDatabaseClient } from '../src/index.js';

/**
 * Explicit, opt-in measurement of the attribution read path and of the lock ordering
 * that concurrent transformations rely on. Never part of `db:seed`.
 *
 * It synthesises 100k DERIVED FarmerBatchContribution rows on top of whatever
 * deliveries already exist, measures the lot-to-farmers query with and without the
 * index added by the transformation attribution migration, then runs two concurrent
 * sessions over overlapping input batches to show that sorted lock acquisition
 * serialises rather than deadlocks.
 *
 * Everything it creates is tagged and removed at the end.
 */

const database = createDatabaseClient();

const organizationId = '00000000-0000-4000-8000-000000000201';
const commodityId = '00000000-0000-4000-8000-000000000801';
const commodityFormId = '00000000-0000-4000-8000-000000000811';
const userId = '00000000-0000-4000-8000-000000000102';
const TAG = 'ATTRSCALE';
const TARGET_CONTRIBUTIONS = 100_000;
// Many batches, few contributions each. A lot draws from a handful of batches, so the
// slice it needs must be a small fraction of the table or the comparison is rigged.
const BATCHES = 2_000;

type Row = { 'QUERY PLAN': string };

const explain = async (label: string, sql: string): Promise<void> => {
  const rows = await database.$queryRawUnsafe<Row[]>(`EXPLAIN (ANALYZE, BUFFERS) ${sql}`);
  console.log(`\n### ${label}\n`);
  console.log('```');
  for (const row of rows) console.log(row['QUERY PLAN']);
  console.log('```');
};

const explainWithoutIndex = async (label: string, sql: string): Promise<void> => {
  await database
    .$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(
        'DROP INDEX IF EXISTS "FarmerBatchContribution_batchId_reversedAt_idx"',
      );
      await transaction.$executeRawUnsafe(
        'DROP INDEX IF EXISTS "FarmerBatchContribution_live_attribution_idx"',
      );
      const rows = await transaction.$queryRawUnsafe<Row[]>(`EXPLAIN (ANALYZE, BUFFERS) ${sql}`);
      console.log(`\n### ${label}\n`);
      console.log('```');
      for (const row of rows) console.log(row['QUERY PLAN']);
      console.log('```');
      throw new Error('ROLLBACK_MEASUREMENT');
    })
    .catch((error: unknown) => {
      if (!(error instanceof Error) || error.message !== 'ROLLBACK_MEASUREMENT') throw error;
    });
};

const cleanup = async (): Promise<void> => {
  await database.$executeRawUnsafe(`
    DELETE FROM "CooperativeLotContribution"
    WHERE "lotId" IN (SELECT id FROM "CooperativeLot" WHERE "lotNumber" LIKE '${TAG}-%');
  `);
  await database.$executeRawUnsafe(`DELETE FROM "CooperativeLot" WHERE "lotNumber" LIKE '${TAG}-%';`);
  await database.$executeRawUnsafe(`
    DELETE FROM "FarmerBatchContribution"
    WHERE "batchId" IN (SELECT id FROM "ProduceBatch" WHERE "batchNumber" LIKE '${TAG}-%');
  `);
  await database.$executeRawUnsafe(`DELETE FROM "ProduceBatch" WHERE "batchNumber" LIKE '${TAG}-%';`);
  await database.$executeRawUnsafe(
    `DELETE FROM "BatchTransformation" WHERE "transformationNumber" LIKE '${TAG}-%';`,
  );
};

await cleanup();

const deliveryCount = await database.delivery.count();
if (deliveryCount < 500)
  throw new Error(
    `Only ${deliveryCount} deliveries present. Run db:volume-fixture first so the fixture is realistic.`,
  );

console.log(`# Attribution scale and lock measurements\n`);
console.log(`Deliveries available: ${deliveryCount}`);

await database.$executeRawUnsafe(`
  INSERT INTO "ProduceBatch" ("id","publicId","batchNumber","organizationId","commodityId","commodityFormId","operationType","status","initialQuantity","quantityUnit","sealedAt","createdByUserId","createdAt","updatedAt")
  SELECT gen_random_uuid(), 'pb1_${TAG.toLowerCase()}' || n, '${TAG}-' || n, '${organizationId}', '${commodityId}', '${commodityFormId}', 'TRANSFORMATION', 'SEALED', 1000, 'KG', now(), '${userId}', now(), now()
  FROM generate_series(1, ${BATCHES}) AS n;
`);

// DERIVED contributions must point at the transformation that produced them.
const transformation = await database.$queryRawUnsafe<{ id: string }[]>(`
  INSERT INTO "BatchTransformation" ("id","transformationNumber","organizationId","type","status","completedByUserId","completedAt","createdAt","updatedAt")
  VALUES (gen_random_uuid(), '${TAG}-TR', '${organizationId}', 'TRANSFORMATION', 'COMPLETED', '${userId}', now(), now(), now())
  RETURNING id;
`);
const transformationId = transformation[0]!.id;

// Spread the contributions across the synthetic batches, cycling through real deliveries.
await database.$executeRawUnsafe(`
  INSERT INTO "FarmerBatchContribution" ("id","batchId","deliveryId","quantity","unit","origin","transformationId","createdAt")
  SELECT gen_random_uuid(), b.id, d.id, 0.5000, 'KG', 'DERIVED', '${transformationId}', now()
  FROM (
    SELECT id, row_number() OVER (ORDER BY "batchNumber") - 1 AS idx
    FROM "ProduceBatch" WHERE "batchNumber" LIKE '${TAG}-%'
  ) b
  CROSS JOIN LATERAL (
    SELECT id FROM "Delivery" ORDER BY id OFFSET (b.idx * ${Math.floor(TARGET_CONTRIBUTIONS / BATCHES)}) % ${deliveryCount} LIMIT ${Math.floor(TARGET_CONTRIBUTIONS / BATCHES)}
  ) d
  ON CONFLICT DO NOTHING;
`);

// Bulk raw inserts leave the planner with stale statistics, which would make any plan
// comparison meaningless.
await database.$executeRawUnsafe('ANALYZE "FarmerBatchContribution"');

const counts = await database.$queryRawUnsafe<{ origin: string; count: bigint }[]>(
  'SELECT "origin", count(*) AS count FROM "FarmerBatchContribution" GROUP BY "origin" ORDER BY "origin"',
);
console.log('\n## Row counts\n');
for (const row of counts) console.log(`- FarmerBatchContribution ${row.origin}: ${row.count}`);

const sampleBatch = await database.$queryRawUnsafe<{ id: string; n: bigint }[]>(`
  SELECT c."batchId" AS id, count(*) AS n
  FROM "FarmerBatchContribution" c
  JOIN "ProduceBatch" b ON b.id = c."batchId"
  WHERE b."batchNumber" LIKE '${TAG}-%'
  GROUP BY c."batchId" ORDER BY n DESC LIMIT 1;
`);
const batchId = sampleBatch[0]?.id;
if (!batchId) throw new Error('Synthetic fixture produced no contributions');
console.log(`\nHeaviest synthetic batch holds ${sampleBatch[0]?.n} contributions.`);

const lot = await database.$queryRawUnsafe<{ id: string }[]>(`
  INSERT INTO "CooperativeLot" ("id","publicId","lotNumber","organizationId","commodityId","commodityFormId","status","quantity","quantityUnit","createdByUserId","createdAt","updatedAt")
  VALUES (gen_random_uuid(), 'lot1_${TAG.toLowerCase()}', '${TAG}-LOT', '${organizationId}', '${commodityId}', '${commodityFormId}', 'DRAFT', 1000, 'KG', '${userId}', now(), now())
  RETURNING id;
`);
const lotId = lot[0]!.id;
await database.$executeRawUnsafe(`
  INSERT INTO "CooperativeLotContribution" ("id","lotId","batchId","quantity","unit","createdAt")
  SELECT gen_random_uuid(), '${lotId}', id, 5.0000, 'KG', now()
  FROM "ProduceBatch" WHERE "batchNumber" LIKE '${TAG}-%' LIMIT 20;
`);

// The shape resolveBatch walks: lot -> batches -> live contributions -> farmers.
const lotToFarmersSql = `
  SELECT d."farmerId", sum(c."quantity") AS quantity
  FROM "CooperativeLotContribution" lbc
  JOIN "FarmerBatchContribution" c ON c."batchId" = lbc."batchId" AND c."reversedAt" IS NULL
  JOIN "Delivery" d ON d.id = c."deliveryId"
  WHERE lbc."lotId" = '${lotId}'
  GROUP BY d."farmerId"`;

const singleBatchSql = `
  SELECT c."deliveryId", c."quantity"
  FROM "FarmerBatchContribution" c
  WHERE c."batchId" = '${batchId}' AND c."reversedAt" IS NULL`;

console.log('\n## Index coverage\n');
await database.$executeRawUnsafe('ANALYZE "CooperativeLotContribution"');
await explainWithoutIndex(
  'Query A BEFORE - single batch attribution without the batchId/reversedAt index',
  singleBatchSql,
);
await explain(
  'Query A AFTER - single batch attribution with the batchId/reversedAt index',
  singleBatchSql,
);
await explainWithoutIndex('Query B BEFORE - lot to farmers without the index', lotToFarmersSql);
await explain('Query B AFTER - lot to farmers with the index', lotToFarmersSql);

console.log('\n## Concurrent transformations over overlapping inputs\n');

const lockIds = await database.$queryRawUnsafe<{ id: string }[]>(`
  SELECT id FROM "ProduceBatch" WHERE "batchNumber" LIKE '${TAG}-%' ORDER BY id LIMIT 2;
`);
const [first, second] = lockIds.map((row) => row.id) as [string, string];

const lockRun = async (order: string[], holdMs: number, label: string) => {
  const started = Date.now();
  let waitedMs = 0;
  await database.$transaction(
    async (transaction) => {
      for (const id of order) {
        const at = Date.now();
        await transaction.$executeRawUnsafe(
          `SELECT id FROM "ProduceBatch" WHERE id = '${id}'::uuid FOR UPDATE`,
        );
        waitedMs += Date.now() - at;
      }
      await new Promise((resolve) => setTimeout(resolve, holdMs));
    },
    { timeout: 30_000 },
  );
  console.log(`- ${label}: total ${Date.now() - started}ms, lock acquisition ${waitedMs}ms`);
};

// Sorted order, which is what TransformationsService uses.
const sorted = [first, second].sort();
const sortedResults = await Promise.allSettled([
  lockRun(sorted, 400, 'session 1 (sorted)'),
  lockRun(sorted, 0, 'session 2 (sorted, overlapping)'),
]);
for (const result of sortedResults)
  if (result.status === 'rejected') console.log(`- SORTED FAILURE: ${String(result.reason)}`);
console.log(
  sortedResults.every((result) => result.status === 'fulfilled')
    ? '- Sorted acquisition: both sessions committed, serialised on the lock.'
    : '- Sorted acquisition: at least one session failed. See above.',
);

// Opposing order, to show what the sort is actually preventing.
const opposed = await Promise.allSettled([
  lockRun([first, second], 400, 'session 3 (ascending)'),
  lockRun([second, first], 400, 'session 4 (descending)'),
]);
const deadlocked = opposed.some(
  (result) => result.status === 'rejected' && String(result.reason).includes('deadlock'),
);
console.log(
  deadlocked
    ? '- Opposing acquisition: PostgreSQL aborted a session with a deadlock. This is the failure the sorted order in TransformationsService prevents.'
    : '- Opposing acquisition: no deadlock observed on this run. It is timing dependent; the sorted order removes the possibility rather than the likelihood.',
);

await cleanup();
console.log('\nSynthetic fixture removed.');
await database.$disconnect();
