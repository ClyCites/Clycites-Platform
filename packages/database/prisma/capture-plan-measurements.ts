import { createDatabaseClient } from '../src/index.js';

/**
 * Captures EXPLAIN ANALYZE evidence for the hottest capture-layer read paths.
 * Run against a database loaded with `db:volume-fixture` (>=100k deliveries).
 */

const database = createDatabaseClient();
const organizationId = '00000000-0000-4000-8000-000000000201';

type Row = { 'QUERY PLAN': string };

const explain = async (label: string, sql: string): Promise<void> => {
  const rows = await database.$queryRawUnsafe<Row[]>(`EXPLAIN (ANALYZE, BUFFERS) ${sql}`);
  console.log(`\n### ${label}\n`);
  console.log('```');
  for (const row of rows) console.log(row['QUERY PLAN']);
  console.log('```');
};

const withoutKeysetIndex = async (label: string, sql: string): Promise<void> => {
  await database.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe(
      'DROP INDEX IF EXISTS "Delivery_organizationId_serverReceivedAt_id_idx"',
    );
    const rows = await transaction.$queryRawUnsafe<Row[]>(`EXPLAIN (ANALYZE, BUFFERS) ${sql}`);
    console.log(`\n### ${label}\n`);
    console.log('```');
    for (const row of rows) console.log(row['QUERY PLAN']);
    console.log('```');
    throw new Error('ROLLBACK_MEASUREMENT');
  }).catch((error: unknown) => {
    if (!(error instanceof Error) || error.message !== 'ROLLBACK_MEASUREMENT') throw error;
  });
};

const total = await database.delivery.count();
console.log(`Delivery rows: ${total}`);

const cursorRow = await database.delivery.findMany({
  where: { organizationId },
  orderBy: [{ serverReceivedAt: 'desc' }, { id: 'desc' }],
  skip: 50_000,
  take: 1,
  select: { id: true, serverReceivedAt: true },
});
const cursor = cursorRow[0];
if (!cursor) throw new Error('No delivery available to build a deep cursor');

const deepOffsetSql = `
  SELECT * FROM "Delivery"
  WHERE "organizationId" = '${organizationId}'
  ORDER BY "serverReceivedAt" DESC, "id" DESC
  OFFSET 50000 LIMIT 50`;

const keysetSql = `
  SELECT * FROM "Delivery"
  WHERE "organizationId" = '${organizationId}'
    AND ("serverReceivedAt" < '${cursor.serverReceivedAt.toISOString()}'
      OR ("serverReceivedAt" = '${cursor.serverReceivedAt.toISOString()}' AND "id" < '${cursor.id}'))
  ORDER BY "serverReceivedAt" DESC, "id" DESC
  LIMIT 50`;

await withoutKeysetIndex('Query 1 BEFORE - deep offset page 1001, no composite index', deepOffsetSql);
await explain('Query 1 INTERMEDIATE - OR-form cursor (not sargable)', keysetSql);

const rowValueSql = `
  SELECT * FROM "Delivery"
  WHERE "organizationId" = '${organizationId}'
    AND ("serverReceivedAt", "id") < ('${cursor.serverReceivedAt.toISOString()}'::timestamptz, '${cursor.id}'::uuid)
  ORDER BY "serverReceivedAt" DESC, "id" DESC
  LIMIT 50`;
await explain('Query 1 AFTER - row-value cursor, composite index', rowValueSql);

const countSql = `
  SELECT count(*) FROM "Delivery"
  WHERE "organizationId" = '${organizationId}'
    AND "status" = 'ACCEPTED'
    AND "serverReceivedAt" >= now() - interval '30 days'`;
await explain('Query 2 - filtered count over status and date range', countSql);

const membershipSql = `
  SELECT * FROM "FarmerOrganizationMembership"
  WHERE "organizationId" = '${organizationId}'
    AND "updatedAt" > now() - interval '7 days'
  ORDER BY "updatedAt" ASC
  LIMIT 500`;
await explain('Query 3 - snapshot membership delta', membershipSql);

await database.$disconnect();
