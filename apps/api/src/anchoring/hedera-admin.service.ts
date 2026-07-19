import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hederaSystemStatusSchema, reconciliationCommandSchema } from '@clycites/contracts';
import { Queue } from 'bullmq';

import { AuditService } from '../audit/audit.service.js';
import type { ApiEnvironment } from '../config/environment.js';
import { DatabaseService } from '../database/database.service.js';
import { HEDERA_RECONCILIATION_QUEUE_TOKEN } from './anchoring.constants.js';

@Injectable()
export class HederaAdminService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ConfigService) private readonly config: ConfigService<ApiEnvironment, true>,
    @Inject(HEDERA_RECONCILIATION_QUEUE_TOKEN) private readonly reconciliationQueue: Queue,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async status() {
    const [submission, confirmation] = await Promise.all([
      this.database.client.hederaAnchor.findFirst({
        where: { submittedAt: { not: null } },
        orderBy: { submittedAt: 'desc' },
        select: { submittedAt: true },
      }),
      this.database.client.hederaAnchor.findFirst({
        where: { confirmedAt: { not: null } },
        orderBy: { confirmedAt: 'desc' },
        select: { confirmedAt: true },
      }),
    ]);
    const provider = this.config.getOrThrow('HEDERA_PROVIDER', { infer: true });
    const network = this.config.getOrThrow('HEDERA_NETWORK', { infer: true });
    const submissionEnabled = this.config.getOrThrow('HEDERA_SUBMISSION_ENABLED', { infer: true });
    const confirmationEnabled = this.config.getOrThrow('HEDERA_CONFIRMATION_ENABLED', {
      infer: true,
    });
    const configured =
      provider === 'mock' ||
      Boolean(
        this.config.get('HEDERA_OPERATOR_ID', { infer: true }) &&
          this.config.get('HEDERA_TOPIC_ID', { infer: true }),
      );
    return hederaSystemStatusSchema.parse({
      provider: provider === 'mock' ? 'MOCK' : 'SDK',
      network: network === 'local' ? 'LOCAL' : network.toUpperCase(),
      configured,
      submissionEnabled,
      confirmationEnabled,
      topicId: this.config.get('HEDERA_TOPIC_ID', { infer: true }) ?? null,
      operatorAccountId: this.config.get('HEDERA_OPERATOR_ID', { infer: true }) ?? null,
      mirrorNodeReachable: null,
      lastSuccessfulSubmission: submission?.submittedAt?.toISOString() ?? null,
      lastSuccessfulConfirmation: confirmation?.confirmedAt?.toISOString() ?? null,
      degradedReasonCode: !configured
        ? 'HEDERA_NOT_CONFIGURED'
        : !submissionEnabled
          ? 'HEDERA_SUBMISSION_DISABLED'
          : !confirmationEnabled
            ? 'HEDERA_CONFIRMATION_DISABLED'
            : null,
    });
  }

  failures() {
    return this.database.client.hederaAnchor.findMany({
      where: { status: { in: ['RETRYABLE_FAILURE', 'PERMANENT_FAILURE', 'MISMATCH'] } },
      select: {
        id: true,
        organizationId: true,
        entityType: true,
        entityId: true,
        eventType: true,
        status: true,
        lastErrorCode: true,
        lastErrorMessage: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  }

  async topics() {
    const checkpoints = await this.database.client.hederaTopicCheckpoint.findMany({
      select: {
        provider: true,
        network: true,
        topicId: true,
        lastSequenceNumber: true,
        lastConsensusTimestamp: true,
        checkedAt: true,
      },
      orderBy: { checkedAt: 'desc' },
      take: 100,
    });
    return checkpoints.map((checkpoint) => ({
      ...checkpoint,
      lastSequenceNumber: checkpoint.lastSequenceNumber.toString(),
    }));
  }

  async reconciliation() {
    const jobs = await this.reconciliationQueue.getJobs(
      ['waiting', 'active', 'delayed', 'completed', 'failed'],
      0,
      99,
      true,
    );
    return jobs.map((job) => {
      const payload = reconciliationCommandSchema.safeParse(job.data);
      return {
        id: job.id,
        state: job.finishedOn ? (job.failedReason ? 'FAILED' : 'COMPLETED') : 'QUEUED',
        limit: payload.success ? payload.data.limit : null,
        queuedAt: new Date(job.timestamp).toISOString(),
        finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
        failedReason: job.failedReason || null,
      };
    });
  }

  async reconcile(limit: number, actorUserId: string, requestId: string) {
    const job = await this.reconciliationQueue.add(
      'hedera.anchor.reconcile',
      { limit },
      { jobId: `hedera-reconcile-admin-${Date.now()}` },
    );
    await this.audit.create({
      actorUserId,
      action: 'HEDERA_PLATFORM_RECONCILIATION_QUEUED',
      entityType: 'HEDERA_TOPIC',
      entityId: this.config.getOrThrow('HEDERA_TOPIC_ID', { infer: true }),
      requestId,
      metadata: { limit, jobId: job.id ?? null },
    });
    return { queued: true, jobId: job.id };
  }
}
