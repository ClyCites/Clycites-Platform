import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Job, Worker } from 'bullmq';
import { z } from 'zod';

import type { WorkerEnvironment } from './environment.js';
import { PAYMENT_SUBMISSION_QUEUE_NAME, PAYMENT_SUBMIT_JOB } from './payment.constants.js';
import { WorkerDatabaseService } from './worker-database.service.js';

const paymentSubmissionJobSchema = z
  .object({ paymentInstructionId: z.uuid(), expectedVersion: z.number().int().positive() })
  .strict();

@Injectable()
export class PaymentSubmissionWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private worker?: Worker;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<WorkerEnvironment, true>,
    @Inject(WorkerDatabaseService) private readonly database: WorkerDatabaseService,
  ) {}

  onApplicationBootstrap(): void {
    this.worker = new Worker(PAYMENT_SUBMISSION_QUEUE_NAME, (job) => this.process(job), {
      connection: this.connection(),
      concurrency: 5,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  async process(job: Pick<Job, 'name' | 'data' | 'id'>): Promise<{ status: string }> {
    if (job.name !== PAYMENT_SUBMIT_JOB) throw new Error('Unsupported payment submission job');
    const payload = paymentSubmissionJobSchema.parse(job.data);
    return this.database.client.$transaction(async (transaction) => {
      const claimed = await transaction.paymentInstruction.updateMany({
        where: {
          id: payload.paymentInstructionId,
          version: payload.expectedVersion,
          status: 'QUEUED',
          provider: { in: ['manual', 'mock'] },
        },
        data: { status: 'PROCESSING' },
      });
      if (claimed.count !== 1) return { status: 'NOT_CLAIMED' };

      const instruction = await transaction.paymentInstruction.findUniqueOrThrow({
        where: { id: payload.paymentInstructionId },
        include: { attempts: { select: { attemptNumber: true } } },
      });
      const attemptNumber =
        instruction.attempts.reduce(
          (maximum, attempt) => Math.max(maximum, attempt.attemptNumber),
          0,
        ) + 1;
      const submittedAt = new Date();
      const attempt = await transaction.paymentAttempt.create({
        data: {
          paymentInstructionId: instruction.id,
          attemptNumber,
          provider: instruction.provider,
          status: instruction.provider === 'manual' ? 'PENDING' : 'SUBMITTED',
          providerRequestReference: `${instruction.provider}-${instruction.idempotencyKey}`,
          submittedAt,
          metadata: { jobId: job.id ?? null, mode: instruction.provider },
        },
      });
      await transaction.paymentInstruction.update({
        where: { id: instruction.id },
        data: { status: 'SUBMITTED', submittedAt, version: { increment: 1 } },
      });
      await transaction.farmerSettlement.update({
        where: { id: instruction.farmerSettlementId },
        data: { paymentStatus: 'PROCESSING' },
      });
      await transaction.auditEvent.create({
        data: {
          organizationId: instruction.organizationId,
          actorType: 'SYSTEM',
          action: 'PAYMENT_INSTRUCTION_SUBMITTED',
          entityType: 'PaymentInstruction',
          entityId: instruction.id,
          requestId: `payment-worker:${job.id ?? instruction.id}`,
          metadata: {
            paymentAttemptId: attempt.id,
            provider: instruction.provider,
            status: 'SUBMITTED',
          },
        },
      });
      return { status: 'SUBMITTED' };
    });
  }

  private connection() {
    const password = this.config.get('REDIS_PASSWORD', { infer: true });
    return {
      host: this.config.getOrThrow('REDIS_HOST', { infer: true }),
      port: this.config.getOrThrow('REDIS_PORT', { infer: true }),
      ...(password ? { password } : {}),
    };
  }
}
