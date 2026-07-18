import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hederaSystemStatusSchema } from '@clycites/contracts';
import { Queue } from 'bullmq';

import type { ApiEnvironment } from '../config/environment.js';
import { DatabaseService } from '../database/database.service.js';
import { HEDERA_RECONCILIATION_QUEUE_TOKEN } from './anchoring.constants.js';

@Injectable()
export class HederaAdminService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ConfigService) private readonly config: ConfigService<ApiEnvironment, true>,
    @Inject(HEDERA_RECONCILIATION_QUEUE_TOKEN) private readonly reconciliationQueue: Queue,
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

  async reconcile(limit: number) {
    const job = await this.reconciliationQueue.add(
      'hedera.anchor.reconcile',
      { limit },
      { jobId: `hedera-reconcile-admin-${Date.now()}` },
    );
    return { queued: true, jobId: job.id };
  }
}
