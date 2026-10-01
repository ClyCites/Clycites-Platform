import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { buildAnchorMessage, MessageAnchorVerifier } from '@clycites/hedera';
import { createLogger } from '@clycites/observability';
import { Queue, type Job, Worker } from 'bullmq';
import type { Logger } from 'pino';
import { z } from 'zod';

import type { WorkerEnvironment } from './environment.js';
import {
  HEDERA_CONFIRMATION_QUEUE,
  HEDERA_CONFIRM_JOB,
  HEDERA_RECONCILIATION_QUEUE,
  HEDERA_RECONCILE_JOB,
} from './hedera.constants.js';
import { HederaProviderService } from './hedera-provider.service.js';
import { WorkerDatabaseService } from './worker-database.service.js';

const reconciliationJobSchema = z
  .object({ limit: z.number().int().positive().max(500).default(100) })
  .strict();

@Injectable()
export class HederaReconciliationWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private worker?: Worker;
  private timer?: NodeJS.Timeout;
  private readonly reconciliationQueue: Queue;
  private readonly confirmationQueue: Queue;
  private readonly logger: Logger;
  private readonly verifier = new MessageAnchorVerifier();

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<WorkerEnvironment, true>,
    @Inject(WorkerDatabaseService) private readonly database: WorkerDatabaseService,
    @Inject(HederaProviderService) private readonly providers: HederaProviderService,
  ) {
    const connection = this.connection();
    this.reconciliationQueue = new Queue(HEDERA_RECONCILIATION_QUEUE, { connection });
    this.confirmationQueue = new Queue(HEDERA_CONFIRMATION_QUEUE, { connection });
    this.logger = createLogger(
      {
        application: 'clycites-worker',
        environment: config.getOrThrow('NODE_ENV', { infer: true }),
      },
      config.getOrThrow('LOG_LEVEL', { infer: true }),
    );
  }

  onApplicationBootstrap(): void {
    this.worker = new Worker(HEDERA_RECONCILIATION_QUEUE, (job) => this.process(job), {
      connection: this.connection(),
      concurrency: 1,
    });
    this.timer = setInterval(() => void this.enqueueScheduled(), 60_000);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.worker?.close();
    await this.reconciliationQueue.close();
    await this.confirmationQueue.close();
  }

  async enqueueScheduled(): Promise<void> {
    if (!this.config.getOrThrow('HEDERA_CONFIRMATION_ENABLED', { infer: true })) return;
    await this.reconciliationQueue.add(
      HEDERA_RECONCILE_JOB,
      { limit: 100 },
      { jobId: `hedera-reconcile-${Math.floor(Date.now() / 60_000)}` },
    );
  }

  async process(
    job: Pick<Job, 'name' | 'data' | 'id'>,
  ): Promise<{ checked: number; matched: number; unknown: number }> {
    if (job.name !== HEDERA_RECONCILE_JOB) throw new Error('Unsupported Hedera reconciliation job');
    const { limit } = reconciliationJobSchema.parse(job.data);
    const topicId = this.config.getOrThrow('HEDERA_TOPIC_ID', { infer: true });
    const provider =
      this.config.getOrThrow('HEDERA_PROVIDER', { infer: true }) === 'mock' ? 'MOCK' : 'SDK';
    const networkValue = this.config.getOrThrow('HEDERA_NETWORK', { infer: true });
    const network =
      networkValue === 'local'
        ? 'LOCAL'
        : networkValue === 'testnet'
          ? 'TESTNET'
          : networkValue === 'previewnet'
            ? 'PREVIEWNET'
            : 'MAINNET';

    const lock = await this.database.client.$queryRaw<
      { locked: boolean }[]
    >`SELECT pg_try_advisory_lock(hashtextextended(${'hedera-reconciliation'}, 0)) AS "locked"`;
    if (!lock[0]?.locked) throw new Error('RECONCILIATION_ALREADY_RUNNING');
    try {
      const checkpoint = await this.database.client.hederaTopicCheckpoint.findUnique({
        where: { provider_network_topicId: { provider, network, topicId } },
      });
      const page = await this.providers.mirror.listMessages({
        topicId,
        ...(checkpoint ? { afterSequenceNumber: checkpoint.lastSequenceNumber.toString() } : {}),
        limit,
      });
      let matched = 0;
      let unknown = 0;
      for (const message of page.messages) {
        const anchor = await this.database.client.hederaAnchor.findUnique({
          where: { anchorEventId: message.message.anchorEventId },
          include: { traceabilityEvent: true, supersedesAnchor: true },
        });
        if (!anchor) {
          unknown += 1;
          this.logger.warn(
            { topicId, sequenceNumber: message.sequenceNumber, provider, network },
            'Unknown platform-like Hedera message',
          );
          continue;
        }
        const expectedMessage = buildAnchorMessage(
          { ...anchor, occurredAt: anchor.traceabilityEvent.occurredAt },
          this.referenceKey(),
        );
        const verification = await this.verifier.verify({
          expectedMessage,
          mirrorMessage: message,
        });
        if (
          !verification.matches ||
          message.provider !== anchor.provider ||
          message.network !== anchor.network ||
          (anchor.topicId && anchor.topicId !== message.topicId) ||
          (anchor.submissionTransactionId &&
            message.transactionId !== anchor.submissionTransactionId)
        ) {
          await this.database.client.hederaAnchor.update({
            where: { id: anchor.id },
            data: {
              status: 'MISMATCH',
              lastErrorCode: 'HEDERA_MESSAGE_MISMATCH',
              lastErrorMessage: 'Reconciliation found a mismatching message',
            },
          });
          continue;
        }
        const unknownOutcome =
          anchor.status === 'PERMANENT_FAILURE' &&
          anchor.lastErrorCode === 'HEDERA_SUBMISSION_OUTCOME_UNKNOWN';
        if (
          ['SUBMITTING', 'SUBMITTED', 'CONFIRMING', 'RETRYABLE_FAILURE'].includes(anchor.status) ||
          unknownOutcome
        ) {
          await this.database.client.hederaAnchor.update({
            where: { id: anchor.id },
            data: {
              status: 'SUBMITTED',
              topicId: message.topicId,
              submissionTransactionId: message.transactionId ?? anchor.submissionTransactionId,
              topicSequenceNumber: BigInt(message.sequenceNumber),
              consensusTimestamp: message.consensusTimestamp,
              submittedAt: anchor.submittedAt ?? new Date(),
            },
          });
          await this.confirmationQueue.add(
            HEDERA_CONFIRM_JOB,
            { anchorId: anchor.id, expectedAnchorEventId: anchor.anchorEventId },
            { jobId: `hedera-confirm-${anchor.id}` },
          );
          matched += 1;
        }
      }
      const last = page.messages.at(-1);
      if (last) {
        await this.database.client.hederaTopicCheckpoint.upsert({
          where: { provider_network_topicId: { provider, network, topicId } },
          create: {
            provider,
            network,
            topicId,
            lastSequenceNumber: BigInt(last.sequenceNumber),
            lastConsensusTimestamp: last.consensusTimestamp,
            lastRunningHash: last.runningHash,
            checkedAt: new Date(),
          },
          update: {
            lastSequenceNumber: BigInt(last.sequenceNumber),
            lastConsensusTimestamp: last.consensusTimestamp,
            lastRunningHash: last.runningHash,
            checkedAt: new Date(),
          },
        });
      }
      return { checked: page.messages.length, matched, unknown };
    } finally {
      await this.database.client
        .$queryRaw`SELECT pg_advisory_unlock(hashtextextended(${'hedera-reconciliation'}, 0)) IS TRUE AS "unlocked"`;
    }
  }

  private referenceKey() {
    return {
      secret: this.config.getOrThrow('HEDERA_REFERENCE_SECRET', { infer: true }),
      version: this.config.getOrThrow('HEDERA_REFERENCE_SECRET_VERSION', { infer: true }),
    };
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
