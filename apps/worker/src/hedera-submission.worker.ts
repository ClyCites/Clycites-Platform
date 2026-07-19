import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { anchorMessageSchema } from '@clycites/contracts';
import { createPrivacyReference, HederaProviderError, hashPayload } from '@clycites/hedera';
import { Queue, type Job, Worker } from 'bullmq';
import { z } from 'zod';

import type { WorkerEnvironment } from './environment.js';
import {
  HEDERA_CONFIRMATION_QUEUE,
  HEDERA_CONFIRM_JOB,
  HEDERA_SUBMISSION_QUEUE,
  HEDERA_SUBMIT_JOB,
} from './hedera.constants.js';
import { HederaProviderService } from './hedera-provider.service.js';
import { WorkerDatabaseService } from './worker-database.service.js';

const submissionJobSchema = z
  .object({ anchorId: z.uuid(), expectedAnchorEventId: z.uuid() })
  .strict();

@Injectable()
export class HederaSubmissionWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private worker?: Worker;
  private readonly confirmationQueue: Queue;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<WorkerEnvironment, true>,
    @Inject(WorkerDatabaseService) private readonly database: WorkerDatabaseService,
    @Inject(HederaProviderService) private readonly providers: HederaProviderService,
  ) {
    this.confirmationQueue = new Queue(HEDERA_CONFIRMATION_QUEUE, {
      connection: this.connection(),
      defaultJobOptions: {
        attempts: 12,
        backoff: { type: 'exponential', delay: 1_000, jitter: 0.2 },
        removeOnComplete: 500,
      },
    });
  }

  onApplicationBootstrap(): void {
    this.worker = new Worker(HEDERA_SUBMISSION_QUEUE, (job) => this.process(job), {
      connection: this.connection(),
      concurrency: 5,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.confirmationQueue.close();
  }

  async process(job: Pick<Job, 'name' | 'data' | 'id'>): Promise<{ status: string }> {
    if (job.name !== HEDERA_SUBMIT_JOB) throw new Error('Unsupported Hedera submission job');
    const payload = submissionJobSchema.parse(job.data);
    if (!this.config.getOrThrow('HEDERA_SUBMISSION_ENABLED', { infer: true }))
      return { status: 'SUBMISSION_DISABLED' };

    const claimed = await this.database.client.hederaAnchor.updateMany({
      where: {
        id: payload.anchorId,
        anchorEventId: payload.expectedAnchorEventId,
        status: { in: ['QUEUED', 'RETRYABLE_FAILURE'] },
      },
      data: { status: 'SUBMITTING', lastErrorCode: null, lastErrorMessage: null },
    });
    if (claimed.count !== 1) return { status: 'NOT_CLAIMED' };

    const anchor = await this.database.client.hederaAnchor.findUniqueOrThrow({
      where: { id: payload.anchorId },
      include: { traceabilityEvent: true, attempts: { where: { operation: 'SUBMIT' } } },
    });
    const attemptNumber = anchor.attempts.length + 1;
    const attempt = await this.database.client.hederaAnchorAttempt.create({
      data: {
        anchorId: anchor.id,
        attemptNumber,
        operation: 'SUBMIT',
        status: 'STARTED',
        provider: anchor.provider,
        network: anchor.network,
        startedAt: new Date(),
        metadata: { jobId: job.id ?? null },
      },
    });
    const calculatedHash = hashPayload(anchor.traceabilityEvent.canonicalPayload);
    if (calculatedHash !== anchor.canonicalPayloadHash) {
      await this.database.client.$transaction([
        this.database.client.hederaAnchor.update({
          where: { id: anchor.id },
          data: {
            status: 'MISMATCH',
            lastErrorCode: 'ANCHOR_PAYLOAD_MISMATCH',
            lastErrorMessage: 'Stored canonical payload hash mismatch',
          },
        }),
        this.database.client.hederaAnchorAttempt.update({
          where: { id: attempt.id },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            errorCode: 'ANCHOR_PAYLOAD_MISMATCH',
            errorCategory: 'MISMATCH',
            errorMessage: 'Stored canonical payload hash mismatch',
          },
        }),
      ]);
      return { status: 'MISMATCH' };
    }

    const message = anchorMessageSchema.parse({
      schemaVersion: anchor.schemaVersion,
      anchorEventId: anchor.anchorEventId,
      eventType: anchor.eventType,
      organizationRef: this.reference('ORGANIZATION', anchor.organizationId),
      entityType: anchor.entityType,
      entityRef: this.reference(anchor.entityType, anchor.entityId),
      payloadHash: anchor.canonicalPayloadHash,
      previousEventHash: anchor.previousEventHash,
      occurredAt: anchor.traceabilityEvent.occurredAt.toISOString(),
      supersedesAnchorRef: anchor.supersedesAnchorId
        ? this.reference('ANCHOR', anchor.supersedesAnchorId)
        : null,
    });
    try {
      const result = await this.providers.anchor.submit(message, {
        topicId: this.config.getOrThrow('HEDERA_TOPIC_ID', { infer: true }),
        maxMessageBytes: 1024,
        maxTransactionFeeUsd: this.config.getOrThrow('HEDERA_MAX_TRANSACTION_FEE_USD', {
          infer: true,
        }),
      });
      await this.database.client.$transaction([
        this.database.client.hederaAnchor.update({
          where: { id: anchor.id },
          data: {
            status: 'SUBMITTED',
            topicId: result.topicId,
            submissionTransactionId: result.transactionId,
            submissionTransactionHash: result.transactionHash,
            submittedAt: new Date(result.submittedAt),
          },
        }),
        this.database.client.hederaAnchorAttempt.update({
          where: { id: attempt.id },
          data: {
            status: 'SUCCEEDED',
            completedAt: new Date(),
            transactionId: result.transactionId,
          },
        }),
      ]);
      await this.confirmationQueue.add(
        HEDERA_CONFIRM_JOB,
        { anchorId: anchor.id, expectedAnchorEventId: anchor.anchorEventId },
        { jobId: `hedera-confirm-${anchor.id}` },
      );
      return { status: 'SUBMITTED' };
    } catch (error) {
      const providerError =
        error instanceof HederaProviderError
          ? error
          : new HederaProviderError(
              'HEDERA_SUBMISSION_RETRYABLE',
              'RETRYABLE',
              'Hedera submission failed',
            );
      const attemptStatus = providerError.category === 'UNKNOWN_OUTCOME' ? 'UNKNOWN' : 'FAILED';
      const anchorStatus =
        providerError.category === 'RETRYABLE' ? 'RETRYABLE_FAILURE' : 'PERMANENT_FAILURE';
      await this.database.client.$transaction([
        this.database.client.hederaAnchor.update({
          where: { id: anchor.id },
          data: {
            status: anchorStatus,
            lastErrorCode: providerError.code,
            lastErrorMessage: providerError.message,
          },
        }),
        this.database.client.hederaAnchorAttempt.update({
          where: { id: attempt.id },
          data: {
            status: attemptStatus,
            completedAt: new Date(),
            errorCode: providerError.code,
            errorCategory: providerError.category,
            errorMessage: providerError.message,
          },
        }),
      ]);
      if (providerError.category === 'RETRYABLE') throw providerError;
      return { status: anchorStatus };
    }
  }

  private reference(entityType: string, entityId: string): string {
    return createPrivacyReference(
      this.config.getOrThrow('HEDERA_REFERENCE_SECRET', { infer: true }),
      this.config.getOrThrow('HEDERA_REFERENCE_SECRET_VERSION', { infer: true }),
      entityType,
      entityId,
    );
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
