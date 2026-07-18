import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

import type { WorkerEnvironment } from './environment.js';
import { HEDERA_SUBMISSION_QUEUE, HEDERA_SUBMIT_JOB } from './hedera.constants.js';
import { WorkerDatabaseService } from './worker-database.service.js';

@Injectable()
export class OutboxDispatcherService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly queue: Queue;
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<WorkerEnvironment, true>,
    @Inject(WorkerDatabaseService) private readonly database: WorkerDatabaseService,
  ) {
    const password = config.get('REDIS_PASSWORD', { infer: true });
    this.queue = new Queue(HEDERA_SUBMISSION_QUEUE, {
      connection: {
        host: config.getOrThrow('REDIS_HOST', { infer: true }),
        port: config.getOrThrow('REDIS_PORT', { infer: true }),
        ...(password ? { password } : {}),
      },
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1_000, jitter: 0.25 },
        removeOnComplete: 500,
      },
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.dispatch();
    this.timer = setInterval(() => void this.dispatch(), 2_000);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.queue.close();
  }

  async dispatch(): Promise<number> {
    if (!this.config.getOrThrow('HEDERA_SUBMISSION_ENABLED', { infer: true })) return 0;
    const events = await this.database.client.outboxEvent.findMany({
      where: { status: 'PENDING', traceabilityEvent: { anchor: { status: 'PENDING' } } },
      select: {
        id: true,
        traceabilityEvent: { select: { anchor: { select: { id: true, anchorEventId: true } } } },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    let dispatched = 0;
    for (const event of events) {
      const anchor = event.traceabilityEvent?.anchor;
      if (!anchor) continue;
      const claimed = await this.database.client.outboxEvent.updateMany({
        where: { id: event.id, status: 'PENDING' },
        data: { status: 'PROCESSING', attemptCount: { increment: 1 } },
      });
      if (claimed.count !== 1) continue;
      try {
        await this.queue.add(
          HEDERA_SUBMIT_JOB,
          { anchorId: anchor.id, expectedAnchorEventId: anchor.anchorEventId },
          { jobId: `hedera-submit-${anchor.id}` },
        );
        await this.database.client.$transaction([
          this.database.client.hederaAnchor.update({
            where: { id: anchor.id },
            data: { status: 'QUEUED' },
          }),
          this.database.client.outboxEvent.update({
            where: { id: event.id },
            data: { status: 'PROCESSED', processedAt: new Date(), lastError: null },
          }),
        ]);
        dispatched += 1;
      } catch {
        await this.database.client.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: 'PENDING',
            nextAttemptAt: new Date(Date.now() + 5_000),
            lastError: 'QUEUE_HANDOFF_FAILED',
          },
        });
      }
    }
    return dispatched;
  }
}
