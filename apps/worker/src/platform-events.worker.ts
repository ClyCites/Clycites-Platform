import { Injectable, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createLogger } from '@clycites/observability';
import { type Job, Worker } from 'bullmq';
import type { Logger } from 'pino';

import type { WorkerEnvironment } from './environment.js';

const QUEUE_NAME = 'platform-events';
const FOUNDATION_CHECK_JOB = 'system.foundation-check';
const CREDENTIAL_DELIVERY_JOB = 'credential.delivery';
const PHASE_TWO_EVENT_JOBS = new Set([
  'QUALITY_CONFIGURATION_REPLACED',
  'DEVICE_REGISTERED',
  'DEVICE_REVOKED',
  'COLLECTION_SESSION_OPENED',
  'COLLECTION_SESSION_CLOSED',
  'DELIVERY_RECORDED',
  'DELIVERY_SUBMITTED',
  'DELIVERY_ACCEPTED',
  'DELIVERY_REJECTED',
  'DELIVERY_CORRECTION_REQUESTED',
  'DELIVERY_CORRECTION_APPROVED',
  'DELIVERY_CORRECTION_REJECTED',
  'DELIVERY_RECEIPT_REPRINTED',
]);

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

  private process(job: Job): Promise<{ processedAt: string; eventType: string }> {
    this.logger.info(
      { jobId: job.id, jobName: job.name, queue: QUEUE_NAME, attempt: job.attemptsMade + 1 },
      'Processing job',
    );
    if (
      job.name !== FOUNDATION_CHECK_JOB &&
      job.name !== CREDENTIAL_DELIVERY_JOB &&
      !PHASE_TWO_EVENT_JOBS.has(job.name)
    ) {
      throw new Error(`Unsupported job type: ${job.name}`);
    }
    if (job.name === CREDENTIAL_DELIVERY_JOB) {
      this.logger.info(
        {
          jobId: job.id,
          jobName: job.name,
        },
        'Credential delivery would occur; no mail transport is configured',
      );
    }
    return Promise.resolve({ processedAt: new Date().toISOString(), eventType: job.name });
  }
}
