import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { anchorMessageSchema } from '@clycites/contracts';
import { createPrivacyReference, hashPayload, MessageAnchorVerifier } from '@clycites/hedera';
import { type Job, Worker } from 'bullmq';
import { z } from 'zod';

import type { WorkerEnvironment } from './environment.js';
import { HEDERA_CONFIRMATION_QUEUE, HEDERA_CONFIRM_JOB } from './hedera.constants.js';
import { HederaProviderService } from './hedera-provider.service.js';
import { WorkerDatabaseService } from './worker-database.service.js';

const confirmationJobSchema = z
  .object({ anchorId: z.uuid(), expectedAnchorEventId: z.uuid() })
  .strict();

@Injectable()
export class HederaConfirmationWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private worker?: Worker;
  private readonly verifier = new MessageAnchorVerifier();

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<WorkerEnvironment, true>,
    @Inject(WorkerDatabaseService) private readonly database: WorkerDatabaseService,
    @Inject(HederaProviderService) private readonly providers: HederaProviderService,
  ) {}

  onApplicationBootstrap(): void {
    this.worker = new Worker(HEDERA_CONFIRMATION_QUEUE, (job) => this.process(job), {
      connection: this.connection(),
      concurrency: 5,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  async process(job: Pick<Job, 'name' | 'data' | 'id'>): Promise<{ status: string }> {
    if (job.name !== HEDERA_CONFIRM_JOB) throw new Error('Unsupported Hedera confirmation job');
    const payload = confirmationJobSchema.parse(job.data);
    if (!this.config.getOrThrow('HEDERA_CONFIRMATION_ENABLED', { infer: true }))
      return { status: 'CONFIRMATION_DISABLED' };
    const claimed = await this.database.client.hederaAnchor.updateMany({
      where: {
        id: payload.anchorId,
        anchorEventId: payload.expectedAnchorEventId,
        status: { in: ['SUBMITTED', 'CONFIRMING'] },
      },
      data: { status: 'CONFIRMING' },
    });
    if (claimed.count !== 1) return { status: 'NOT_CLAIMED' };
    const anchor = await this.database.client.hederaAnchor.findUniqueOrThrow({
      where: { id: payload.anchorId },
      include: { traceabilityEvent: true, attempts: { where: { operation: 'CONFIRM' } } },
    });
    const attempt = await this.database.client.hederaAnchorAttempt.create({
      data: {
        anchorId: anchor.id,
        attemptNumber: anchor.attempts.length + 1,
        operation: 'CONFIRM',
        status: 'STARTED',
        provider: anchor.provider,
        network: anchor.network,
        startedAt: new Date(),
        metadata: { jobId: job.id ?? null },
      },
    });
    const expectedMessage = anchorMessageSchema.parse({
      schemaVersion: anchor.schemaVersion,
      anchorEventId: anchor.anchorEventId,
      eventType: anchor.eventType,
      organizationRef: this.reference('ORGANIZATION', anchor.organizationId),
      entityType: anchor.entityType,
      entityRef: this.reference(anchor.entityType, anchor.entityId),
      payloadHash: anchor.canonicalPayloadHash,
      previousEventHash: anchor.previousEventHash,
      occurredAt: anchor.traceabilityEvent.occurredAt.toISOString(),
    });
    const mirror = anchor.submissionTransactionId
      ? await this.providers.mirror.findByTransactionId(anchor.submissionTransactionId)
      : null;
    if (!mirror) {
      const elapsedSeconds = anchor.submittedAt
        ? (Date.now() - anchor.submittedAt.getTime()) / 1_000
        : 0;
      const timedOut =
        elapsedSeconds >=
        this.config.getOrThrow('HEDERA_CONFIRMATION_TIMEOUT_SECONDS', { infer: true });
      await this.database.client.hederaAnchorAttempt.update({
        where: { id: attempt.id },
        data: {
          status: timedOut ? 'TIMED_OUT' : 'FAILED',
          completedAt: new Date(),
          errorCode: timedOut ? 'HEDERA_CONFIRMATION_TIMEOUT' : 'HEDERA_CONFIRMATION_PENDING',
          errorCategory: 'RETRYABLE',
          errorMessage: timedOut
            ? 'Mirror confirmation timed out'
            : 'Mirror confirmation is pending',
        },
      });
      if (timedOut)
        await this.database.client.hederaAnchor.update({
          where: { id: anchor.id },
          data: {
            status: 'RETRYABLE_FAILURE',
            lastErrorCode: 'HEDERA_CONFIRMATION_TIMEOUT',
            lastErrorMessage: 'Mirror confirmation timed out',
          },
        });
      if (!timedOut) throw new Error('HEDERA_CONFIRMATION_PENDING');
      return { status: 'RETRYABLE_FAILURE' };
    }
    const verification = await this.verifier.verify({ expectedMessage, mirrorMessage: mirror });
    if (!verification.matches || mirror.topicId !== anchor.topicId) {
      await this.database.client.$transaction([
        this.database.client.hederaAnchor.update({
          where: { id: anchor.id },
          data: {
            status: 'MISMATCH',
            lastErrorCode: 'HEDERA_MESSAGE_MISMATCH',
            lastErrorMessage: 'Mirror message does not match the expected anchor',
          },
        }),
        this.database.client.hederaAnchorAttempt.update({
          where: { id: attempt.id },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            errorCode: 'HEDERA_MESSAGE_MISMATCH',
            errorCategory: 'MISMATCH',
            errorMessage: 'Mirror message does not match the expected anchor',
          },
        }),
      ]);
      return { status: 'MISMATCH' };
    }
    const confirmedAt = new Date();
    await this.database.client.$transaction(async (transaction) => {
      await transaction.hederaAnchor.update({
        where: { id: anchor.id },
        data: {
          status: 'CONFIRMED',
          topicSequenceNumber: BigInt(mirror.sequenceNumber),
          consensusTimestamp: mirror.consensusTimestamp,
          runningHash: mirror.runningHash,
          runningHashVersion:
            mirror.runningHashVersion === null ? null : BigInt(mirror.runningHashVersion),
          confirmedAt,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });
      await transaction.hederaAnchorAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'SUCCEEDED',
          completedAt: confirmedAt,
          transactionId: mirror.transactionId,
        },
      });
      await transaction.anchorVerification.create({
        data: {
          anchorId: anchor.id,
          verificationType: 'AUTOMATIC',
          status: 'VERIFIED',
          calculatedPayloadHash: hashPayload(anchor.traceabilityEvent.canonicalPayload),
          expectedPayloadHash: anchor.canonicalPayloadHash,
          mirrorPayloadHash: mirror.message.payloadHash,
          chainStatus: 'VALID',
          verifiedAt: confirmedAt,
          details: { sequenceNumber: mirror.sequenceNumber },
        },
      });
      if (anchor.supersedesAnchorId)
        await transaction.hederaAnchor.update({
          where: { id: anchor.supersedesAnchorId },
          data: { status: 'SUPERSEDED' },
        });
    });
    return { status: 'CONFIRMED' };
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
