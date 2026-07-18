import { createDatabaseClient } from '@clycites/database';

const anchorId = process.argv[2];
const includePayload = process.argv.includes('--include-canonical-payload');
if (!anchorId) throw new Error('Usage: pnpm cli:anchor <anchor-id> [--include-canonical-payload]');

const database = createDatabaseClient();
try {
  const anchor = await database.hederaAnchor.findUnique({
    where: { id: anchorId },
    include: {
      traceabilityEvent: {
        select: { chainPosition: true, occurredAt: true, canonicalPayload: true },
      },
      attempts: { orderBy: [{ operation: 'asc' }, { attemptNumber: 'asc' }] },
      verifications: { orderBy: { verifiedAt: 'desc' } },
      supersededByAnchor: { select: { id: true, status: true } },
    },
  });
  if (!anchor) throw new Error('Anchor not found');
  const { traceabilityEvent, ...record } = anchor;
  console.log(
    JSON.stringify(
      {
        ...record,
        topicSequenceNumber: record.topicSequenceNumber?.toString() ?? null,
        runningHashVersion: record.runningHashVersion?.toString() ?? null,
        traceabilityEvent: {
          chainPosition: traceabilityEvent.chainPosition,
          occurredAt: traceabilityEvent.occurredAt,
          canonicalPayload: includePayload ? traceabilityEvent.canonicalPayload : '[REDACTED]',
        },
      },
      null,
      2,
    ),
  );
} finally {
  await database.$disconnect();
}
