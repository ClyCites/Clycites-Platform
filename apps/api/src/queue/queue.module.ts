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
import { StructuredLoggerService } from '../observability/structured-logger.service.js';
import {
  FOUNDATION_CHECK_JOB,
  PLATFORM_EVENTS_QUEUE,
  PLATFORM_EVENTS_QUEUE_NAME,
  REDIS_CLIENT,
} from './queue.constants.js';

class QueueLifecycle implements OnApplicationBootstrap, OnModuleDestroy {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(PLATFORM_EVENTS_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService<ApiEnvironment, true>,
    private readonly logger: StructuredLoggerService,
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
    QueueLifecycle,
  ],
  exports: [REDIS_CLIENT, PLATFORM_EVENTS_QUEUE],
})
export class QueueModule {}
