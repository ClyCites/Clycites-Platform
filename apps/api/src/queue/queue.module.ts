import {
  Global,
  Inject,
  Module,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

import type { ApiEnvironment } from '../config/environment.js';
import {
  HEDERA_RECONCILIATION_QUEUE_NAME,
  HEDERA_RECONCILIATION_QUEUE_TOKEN,
  HEDERA_SUBMISSION_QUEUE_NAME,
  HEDERA_SUBMISSION_QUEUE_TOKEN,
} from '../anchoring/anchoring.constants.js';
import { StructuredLoggerService } from '../observability/structured-logger.service.js';
import {
  FOUNDATION_CHECK_JOB,
  PAYMENT_SUBMISSION_QUEUE,
  PAYMENT_SUBMISSION_QUEUE_NAME,
  PLATFORM_EVENTS_QUEUE,
  PLATFORM_EVENTS_QUEUE_NAME,
  REDIS_CLIENT,
} from './queue.constants.js';

class QueueLifecycle implements OnApplicationBootstrap, OnModuleDestroy {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(PLATFORM_EVENTS_QUEUE) private readonly queue: Queue,
    @Inject(HEDERA_SUBMISSION_QUEUE_TOKEN) private readonly submissionQueue: Queue,
    @Inject(HEDERA_RECONCILIATION_QUEUE_TOKEN) private readonly reconciliationQueue: Queue,
    @Inject(PAYMENT_SUBMISSION_QUEUE) private readonly paymentSubmissionQueue: Queue,
    @Inject(ConfigService) private readonly config: ConfigService<ApiEnvironment, true>,
    @Inject(StructuredLoggerService) private readonly logger: StructuredLoggerService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.redis.status === 'wait') await this.redis.connect();
    if (
      this.config.get('NODE_ENV', { infer: true }) === 'development' &&
      this.config.get('ENQUEUE_FOUNDATION_CHECK', { infer: true })
    ) {
      await this.queue.add(
        FOUNDATION_CHECK_JOB,
        { source: 'api-startup' },
        { jobId: 'foundation-check' },
      );
      this.logger.log('Enqueued safe foundation check job', QueueLifecycle.name);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    await this.submissionQueue.close();
    await this.reconciliationQueue.close();
    await this.paymentSubmissionQueue.close();
    if (this.redis.status !== 'end') await this.redis.quit();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<ApiEnvironment, true>) => {
        const password = config.get('REDIS_PASSWORD', { infer: true });
        return new Redis({
          host: config.getOrThrow('REDIS_HOST', { infer: true }),
          port: config.getOrThrow('REDIS_PORT', { infer: true }),
          ...(password ? { password } : {}),
          lazyConnect: true,
          maxRetriesPerRequest: null,
        });
      },
    },
    {
      provide: PLATFORM_EVENTS_QUEUE,
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis) =>
        new Queue(PLATFORM_EVENTS_QUEUE_NAME, {
          connection: redis,
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1_000 },
            removeOnComplete: 100,
          },
        }),
    },
    {
      provide: HEDERA_SUBMISSION_QUEUE_TOKEN,
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis) => new Queue(HEDERA_SUBMISSION_QUEUE_NAME, { connection: redis }),
    },
    {
      provide: HEDERA_RECONCILIATION_QUEUE_TOKEN,
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis) =>
        new Queue(HEDERA_RECONCILIATION_QUEUE_NAME, { connection: redis }),
    },
    {
      provide: PAYMENT_SUBMISSION_QUEUE,
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis) =>
        new Queue(PAYMENT_SUBMISSION_QUEUE_NAME, {
          connection: redis,
          defaultJobOptions: {
            attempts: 5,
            backoff: { type: 'exponential', delay: 1_000, jitter: 0.25 },
            removeOnComplete: 500,
          },
        }),
    },
    QueueLifecycle,
  ],
  exports: [
    REDIS_CLIENT,
    PLATFORM_EVENTS_QUEUE,
    HEDERA_SUBMISSION_QUEUE_TOKEN,
    HEDERA_RECONCILIATION_QUEUE_TOKEN,
    PAYMENT_SUBMISSION_QUEUE,
  ],
})
export class QueueModule {}
