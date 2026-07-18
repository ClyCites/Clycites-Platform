import { Injectable, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createLogger } from '@clycites/observability';
import { type Job, Worker } from 'bullmq';
import type { Logger } from 'pino';

import type { WorkerEnvironment } from './environment.js';

const QUEUE_NAME = 'platform-events';
const FOUNDATION_CHECK_JOB = 'system.foundation-check';

@Injectable()
export class PlatformEventsWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private worker?: Worker;
  private readonly logger: Logger;

  constructor(private readonly config: ConfigService<WorkerEnvironment, true>) {
    this.logger = createLogger(
      { application: 'clycites-worker', environment: config.get('NODE_ENV', { infer: true }) },
      config.get('LOG_LEVEL', { infer: true }),
    );
  }

  onApplicationBootstrap(): void {
    const password = this.config.get('REDIS_PASSWORD', { infer: true });
    this.worker = new Worker(QUEUE_NAME, (job) => this.process(job), {
      connection: {
        host: this.config.getOrThrow('REDIS_HOST', { infer: true }),
        port: this.config.getOrThrow('REDIS_PORT', { infer: true }),
        ...(password ? { password } : {}),
      },
      concurrency: 5,
    });
    this.worker.on('completed', (job) => {
      this.logger.info({ jobId: job.id, jobName: job.name, queue: QUEUE_NAME }, 'Job completed');
    });
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        { jobId: job?.id, jobName: job?.name, queue: QUEUE_NAME, error },
        'Job failed',
      );
    });
    this.worker.on('error', (error) =>
      this.logger.error({ error, queue: QUEUE_NAME }, 'Worker error'),
    );
    this.logger.info({ queue: QUEUE_NAME }, 'Platform events worker started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    this.logger.info({ queue: QUEUE_NAME }, 'Platform events worker stopped');
  }

  private process(job: Job): Promise<{ checkedAt: string }> {
    this.logger.info(
      { jobId: job.id, jobName: job.name, queue: QUEUE_NAME, attempt: job.attemptsMade + 1 },
      'Processing job',
    );
    if (job.name !== FOUNDATION_CHECK_JOB) throw new Error(`Unsupported job type: ${job.name}`);
    return Promise.resolve({ checkedAt: new Date().toISOString() });
  }
}
