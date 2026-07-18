import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

const rawLimit = process.argv[2] ?? '100';
const limit = Number.parseInt(rawLimit, 10);
if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
  throw new Error('Usage: pnpm cli:reconcile [limit between 1 and 500]');
}

const redis = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number.parseInt(process.env.REDIS_PORT ?? '6379', 10),
  ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
  maxRetriesPerRequest: null,
});
const queue = new Queue('hedera-anchor-reconciliation', { connection: redis });
try {
  const job = await queue.add(
    'hedera.anchor.reconcile',
    { limit },
    { jobId: `hedera-reconcile-cli-${Date.now()}` },
  );
  console.log(JSON.stringify({ queued: true, jobId: job.id, limit }, null, 2));
} finally {
  await queue.close();
  await redis.quit();
}
