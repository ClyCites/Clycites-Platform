import { createDatabaseClient } from '@clycites/database';

const database = createDatabaseClient();
try {
  const [counts, latestConfirmation, checkpoint] = await Promise.all([
    database.hederaAnchor.groupBy({ by: ['status'], _count: true }),
    database.hederaAnchor.findFirst({
      where: { status: 'CONFIRMED' },
      orderBy: { confirmedAt: 'desc' },
      select: { confirmedAt: true, topicId: true, topicSequenceNumber: true },
    }),
    database.hederaTopicCheckpoint.findFirst({ orderBy: { checkedAt: 'desc' } }),
  ]);
  console.log(
    JSON.stringify(
      {
        provider: process.env.HEDERA_PROVIDER ?? 'mock',
        network: process.env.HEDERA_NETWORK ?? 'local',
        topicId: process.env.HEDERA_TOPIC_ID ?? checkpoint?.topicId ?? null,
        submissionEnabled: process.env.HEDERA_SUBMISSION_ENABLED === 'true',
        confirmationEnabled: process.env.HEDERA_CONFIRMATION_ENABLED === 'true',
        counts: Object.fromEntries(counts.map((item) => [item.status, item._count])),
        latestConfirmation: latestConfirmation
          ? {
              ...latestConfirmation,
              topicSequenceNumber: latestConfirmation.topicSequenceNumber?.toString() ?? null,
            }
          : null,
        checkpoint: checkpoint
          ? { ...checkpoint, lastSequenceNumber: checkpoint.lastSequenceNumber.toString() }
          : null,
      },
      null,
      2,
    ),
  );
} finally {
  await database.$disconnect();
}
