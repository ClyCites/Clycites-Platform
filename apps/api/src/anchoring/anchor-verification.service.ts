import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedPrincipal } from '@clycites/auth';
import type {
  AnchorListQuery,
  PublicAnchorPointer,
  PublicAnchorStatus,
  PublicLedgerVerificationSummary,
} from '@clycites/contracts';
import {
  anchorDetailSchema,
  entityVerificationSummarySchema,
  organizationVerificationDashboardSchema,
  publicAnchorPointerSchema,
  publicAnchorStatusSchema,
  publicLedgerVerificationSummarySchema,
  verificationResultSchema,
} from '@clycites/contracts';
import { Prisma } from '@clycites/database';
import { hashPayload } from '@clycites/hedera';
import { Queue } from 'bullmq';

import { AuditService } from '../audit/audit.service.js';
import type { ApiEnvironment } from '../config/environment.js';
import { DatabaseService } from '../database/database.service.js';
import { AnchorEligibilityService } from './anchor-eligibility.service.js';
import {
  HEDERA_RECONCILIATION_QUEUE_TOKEN,
  HEDERA_SUBMISSION_QUEUE_TOKEN,
} from './anchoring.constants.js';

@Injectable()
export class AnchorVerificationService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AnchorEligibilityService) private readonly eligibility: AnchorEligibilityService,
    @Inject(ConfigService) private readonly config: ConfigService<ApiEnvironment, true>,
    @Inject(HEDERA_SUBMISSION_QUEUE_TOKEN) private readonly submissionQueue: Queue,
    @Inject(HEDERA_RECONCILIATION_QUEUE_TOKEN) private readonly reconciliationQueue: Queue,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async dashboard(organizationId: string) {
    const [counts, lastConfirmed, checkpoint] = await Promise.all([
      this.database.client.hederaAnchor.groupBy({
        by: ['status'],
        where: { organizationId },
        _count: true,
      }),
      this.database.client.hederaAnchor.findFirst({
        where: { organizationId, status: 'CONFIRMED' },
        orderBy: { confirmedAt: 'desc' },
        select: { confirmedAt: true },
      }),
      this.database.client.hederaTopicCheckpoint.findFirst({ orderBy: { checkedAt: 'desc' } }),
    ]);
    const count = (status: string) => counts.find((item) => item.status === status)?._count ?? 0;
    return organizationVerificationDashboardSchema.parse({
      confirmedCount: count('CONFIRMED'),
      pendingCount: count('PENDING') + count('QUEUED') + count('CONFIRMING'),
      submittedCount: count('SUBMITTED'),
      retryableFailureCount: count('RETRYABLE_FAILURE'),
      permanentFailureCount: count('PERMANENT_FAILURE'),
      mismatchCount: count('MISMATCH'),
      supersededCount: count('SUPERSEDED'),
      lastSuccessfulConfirmation: lastConfirmed?.confirmedAt?.toISOString() ?? null,
      lastReconciliation: checkpoint?.checkedAt.toISOString() ?? null,
      provider: this.provider(),
      network: this.network(),
      submissionEnabled: this.config.getOrThrow('HEDERA_SUBMISSION_ENABLED', { infer: true }),
      confirmationEnabled: this.config.getOrThrow('HEDERA_CONFIRMATION_ENABLED', { infer: true }),
    });
  }

  async list(organizationId: string, query: AnchorListQuery) {
    const searchedUuid = query.search ? this.uuidSearch(query.search) : undefined;
    const searchFilters: Prisma.HederaAnchorWhereInput[] = query.search
      ? [
          ...(searchedUuid ? [{ anchorEventId: searchedUuid }, { entityId: searchedUuid }] : []),
          { submissionTransactionId: { contains: query.search, mode: 'insensitive' } },
        ]
      : [];
    const where: Prisma.HederaAnchorWhereInput = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.eventType ? { eventType: query.eventType } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.search ? { OR: searchFilters } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [items, totalItems] = await Promise.all([
      this.database.client.hederaAnchor.findMany({
        where,
        include: {
          verifications: { orderBy: { verifiedAt: 'desc' }, take: 1 },
          supersededByAnchor: { select: { id: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.database.client.hederaAnchor.count({ where }),
    ]);
    return {
      items: items.map((anchor) => this.serialize(anchor)),
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    };
  }

  async get(organizationId: string, anchorId: string) {
    const anchor = await this.database.client.hederaAnchor.findFirst({
      where: { id: anchorId, organizationId },
      include: {
        verifications: { orderBy: { verifiedAt: 'desc' }, take: 1 },
        supersededByAnchor: { select: { id: true } },
      },
    });
    if (!anchor) throw new NotFoundException('Anchor not found');
    return this.serialize(anchor);
  }

  async attempts(organizationId: string, anchorId: string) {
    await this.assertAnchor(organizationId, anchorId);
    return this.database.client.hederaAnchorAttempt.findMany({
      where: { anchorId },
      orderBy: [{ operation: 'asc' }, { attemptNumber: 'asc' }],
    });
  }

  async verify(
    organizationId: string,
    anchorId: string,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.database.client.$transaction(async (transaction) => {
      const anchor = await transaction.hederaAnchor.findFirst({
        where: { id: anchorId, organizationId },
        include: {
          traceabilityEvent: { include: { outboxEvent: true } },
          verifications: { orderBy: { verifiedAt: 'desc' }, take: 1 },
        },
      });
      if (!anchor) throw new NotFoundException('Anchor not found');
      const payload = await this.eligibility.rebuildCanonicalPayload(
        anchor.eventType as Parameters<AnchorEligibilityService['rebuildCanonicalPayload']>[0],
        {
          eventId: anchor.anchorEventId,
          aggregateId: anchor.entityId,
          eventType: anchor.traceabilityEvent.outboxEvent.eventType,
          organizationId,
          payload: anchor.traceabilityEvent.outboxEvent.payload as Prisma.InputJsonObject,
        },
        transaction,
      );
      const calculatedPayloadHash = payload ? hashPayload(payload) : `sha256:${'0'.repeat(64)}`;
      const previous =
        anchor.traceabilityEvent.chainPosition > 1
          ? await transaction.traceabilityEvent.findFirst({
              where: {
                organizationId,
                entityType: anchor.entityType,
                entityId: anchor.entityId,
                chainPosition: anchor.traceabilityEvent.chainPosition - 1,
              },
            })
          : null;
      const chainStatus =
        anchor.traceabilityEvent.chainPosition === 1
          ? anchor.previousEventHash === null
            ? 'VALID'
            : 'BROKEN'
          : previous?.canonicalPayloadHash === anchor.previousEventHash
            ? 'VALID'
            : 'BROKEN';
      const payloadMatches = calculatedPayloadHash === anchor.canonicalPayloadHash;
      const mirrorPayloadHash = anchor.verifications[0]?.mirrorPayloadHash ?? null;
      const ledgerMatches =
        anchor.status === 'CONFIRMED' && mirrorPayloadHash === anchor.canonicalPayloadHash;
      const status =
        anchor.status === 'SUPERSEDED'
          ? 'SUPERSEDED'
          : !payloadMatches || !ledgerMatches || chainStatus === 'BROKEN'
            ? 'MISMATCH'
            : anchor.status === 'CONFIRMED'
              ? 'VERIFIED'
              : anchor.status === 'SUBMITTED' || anchor.status === 'CONFIRMING'
                ? 'NOT_CONFIRMED'
                : 'PENDING';
      const overallStatus =
        chainStatus === 'BROKEN'
          ? 'CHAIN_BROKEN'
          : status === 'MISMATCH'
            ? 'MISMATCH'
            : status === 'VERIFIED'
              ? 'VERIFIED'
              : status === 'SUPERSEDED'
                ? 'SUPERSEDED'
                : anchor.status === 'SUBMITTED' || anchor.status === 'CONFIRMING'
                  ? 'ANCHOR_SUBMITTED'
                  : 'ANCHOR_PENDING';
      const verifiedAt = new Date();
      await transaction.anchorVerification.create({
        data: {
          anchorId,
          verificationType: 'MANUAL_PRIVATE',
          status,
          calculatedPayloadHash,
          expectedPayloadHash: anchor.canonicalPayloadHash,
          mirrorPayloadHash,
          chainStatus,
          verifiedAt,
          requestedByUserId: principal.subjectId,
          requestId,
          details: { payloadMatches, ledgerMatches },
        },
      });
      return verificationResultSchema.parse({
        anchorId,
        status,
        overallStatus,
        calculatedPayloadHash,
        expectedPayloadHash: anchor.canonicalPayloadHash,
        mirrorPayloadHash,
        chainStatus,
        verifiedAt: verifiedAt.toISOString(),
      });
    });
  }

  async retry(
    organizationId: string,
    anchorId: string,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ): Promise<{ queued: true }> {
    const result = await this.database.client.hederaAnchor.updateMany({
      where: { id: anchorId, organizationId, status: 'RETRYABLE_FAILURE' },
      data: { status: 'QUEUED', lastErrorCode: null, lastErrorMessage: null },
    });
    if (result.count !== 1)
      throw new ConflictException({
        code: 'ANCHOR_RETRY_NOT_ALLOWED',
        message: 'Only retryable failed anchors may be retried',
      });
    const anchor = await this.database.client.hederaAnchor.findUniqueOrThrow({
      where: { id: anchorId },
    });
    try {
      await this.submissionQueue.add(
        'hedera.anchor.submit',
        { anchorId, expectedAnchorEventId: anchor.anchorEventId },
        { jobId: `hedera-retry-${anchorId}-${Date.now()}` },
      );
    } catch (error) {
      await this.database.client.hederaAnchor.updateMany({
        where: { id: anchorId, organizationId, status: 'QUEUED' },
        data: {
          status: 'RETRYABLE_FAILURE',
          lastErrorCode: 'QUEUE_HANDOFF_FAILED',
          lastErrorMessage: 'Retry queue handoff failed',
        },
      });
      throw error;
    }
    await this.audit.create({
      organizationId,
      actorUserId: principal.subjectId,
      action: 'HEDERA_ANCHOR_RETRY_QUEUED',
      entityType: 'HEDERA_ANCHOR',
      entityId: anchorId,
      requestId,
    });
    return { queued: true };
  }

  async reconcile(
    organizationId: string,
    anchorId: string,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ): Promise<{ queued: true }> {
    await this.assertAnchor(organizationId, anchorId);
    await this.reconciliationQueue.add(
      'hedera.anchor.reconcile',
      { limit: 100 },
      { jobId: `hedera-reconcile-manual-${anchorId}-${Date.now()}` },
    );
    await this.audit.create({
      organizationId,
      actorUserId: principal.subjectId,
      action: 'HEDERA_ANCHOR_RECONCILIATION_QUEUED',
      entityType: 'HEDERA_ANCHOR',
      entityId: anchorId,
      requestId,
    });
    return { queued: true };
  }

  async entity(organizationId: string, entityType: 'DELIVERY' | 'BATCH' | 'LOT', entityId: string) {
    const ids =
      entityType === 'LOT'
        ? await this.lotLineageIds(organizationId, entityId)
        : [{ entityType, entityId }];
    const anchors = await this.database.client.hederaAnchor.findMany({
      where: {
        organizationId,
        OR: ids.map((item) => ({ entityType: item.entityType, entityId: item.entityId })),
      },
      include: { verifications: { orderBy: { verifiedAt: 'desc' }, take: 1 } },
    });
    const confirmed = anchors.filter((anchor) => anchor.status === 'CONFIRMED').length;
    const pending = anchors.filter((anchor) =>
      ['PENDING', 'QUEUED', 'SUBMITTED', 'CONFIRMING'].includes(anchor.status),
    ).length;
    const mismatches = anchors.filter(
      (anchor) => anchor.status === 'MISMATCH' || anchor.verifications[0]?.status === 'MISMATCH',
    ).length;
    const superseded = anchors.filter((anchor) => anchor.status === 'SUPERSEDED').length;
    const broken = anchors.some((anchor) => anchor.verifications[0]?.chainStatus === 'BROKEN');
    const status = broken
      ? 'CHAIN_BROKEN'
      : mismatches
        ? 'MISMATCH'
        : anchors.length === 0
          ? 'NOT_ANCHORED'
          : confirmed === anchors.length
            ? 'VERIFIED'
            : confirmed > 0
              ? 'PARTIALLY_VERIFIED'
              : pending
                ? 'ANCHOR_PENDING'
                : 'FAILED';
    return entityVerificationSummarySchema.parse({
      entityType,
      entityId,
      status,
      eligibleEventCount: anchors.length,
      confirmedAnchorCount: confirmed,
      pendingAnchorCount: pending,
      mismatchCount: mismatches,
      supersededAnchorCount: superseded,
      chainStatus: broken ? 'BROKEN' : anchors.length ? 'VALID' : 'UNKNOWN',
      lastVerifiedAt:
        anchors
          .flatMap((anchor) => anchor.verifications)
          .sort((left, right) => right.verifiedAt.getTime() - left.verifiedAt.getTime())[0]
          ?.verifiedAt.toISOString() ?? null,
    });
  }

  async publicLot(publicId: string): Promise<PublicLedgerVerificationSummary> {
    const publication = await this.database.client.traceabilityPublication.findFirst({
      where: { publicId, status: 'PUBLISHED' },
      select: { organizationId: true, lotId: true },
    });
    if (!publication) throw new NotFoundException('Published traceability record not found');
    const summary = await this.entity(publication.organizationId, 'LOT', publication.lotId);
    const latest = await this.database.client.hederaAnchor.findFirst({
      where: {
        organizationId: publication.organizationId,
        entityType: 'LOT',
        entityId: publication.lotId,
        status: { in: ['CONFIRMED', 'SUPERSEDED'] },
      },
      orderBy: { confirmedAt: 'desc' },
      include: {
        verifications: { orderBy: { verifiedAt: 'desc' }, take: 1 },
        supersededByAnchor: true,
      },
    });
    const explanation =
      summary.status === 'VERIFIED'
        ? 'The displayed ClyCites record matches a hash submitted to Hedera Consensus Service and confirmed at the shown consensus time.'
        : summary.status === 'PARTIALLY_VERIFIED'
          ? 'Some traceability events are confirmed on Hedera, while others remain pending or are not eligible for anchoring.'
          : summary.status === 'MISMATCH' || summary.status === 'CHAIN_BROKEN'
            ? 'ClyCites detected a mismatch between the current record and its stored verification hash. Treat this record as unverified while it is investigated.'
            : 'This record is saved in ClyCites, but Hedera confirmation is still pending.';
    return publicLedgerVerificationSummarySchema.parse({
      status: summary.status,
      provider: latest?.provider ?? null,
      network: latest?.network ?? null,
      topicId: latest?.topicId ?? null,
      topicSequenceNumber: latest?.topicSequenceNumber?.toString() ?? null,
      consensusTimestamp: latest?.consensusTimestamp ?? null,
      transactionReference: latest?.submissionTransactionId ?? null,
      payloadHash: latest?.canonicalPayloadHash ?? null,
      mirrorNodeUrl: this.publicMirrorUrl(latest?.topicId, latest?.topicSequenceNumber?.toString()),
      eligibleLineageEventCount: summary.eligibleEventCount,
      confirmedLineageAnchorCount: summary.confirmedAnchorCount,
      pendingAnchorCount: summary.pendingAnchorCount,
      mismatchCount: summary.mismatchCount,
      correctionStatus: latest?.status === 'SUPERSEDED' ? 'SUPERSEDED' : 'CURRENT',
      supersededBy: this.pointer(latest?.supersededByAnchor ?? null),
      lastVerifiedAt: latest?.verifications[0]?.verifiedAt.toISOString() ?? null,
      explanation,
      limitation:
        'Hedera verification does not independently prove that the original physical weight, quality measurement, custody claim or source identity was accurate.',
    });
  }

  /**
   * Answers the one question an outside verifier can ask having found a ClyCites message on the
   * topic: is what I am looking at still the current record, and if not, where is its replacement?
   * Served unauthenticated, so it may only echo coordinates that are already public on the ledger.
   */
  async publicAnchorByTransaction(transactionReference: string): Promise<PublicAnchorStatus> {
    const anchor = await this.database.client.hederaAnchor.findFirst({
      where: {
        submissionTransactionId: transactionReference,
        status: { in: ['SUBMITTED', 'CONFIRMING', 'CONFIRMED', 'SUPERSEDED'] },
      },
      include: { supersedesAnchor: true, supersededByAnchor: true },
    });
    if (!anchor) throw new NotFoundException('No ClyCites anchor was published under that reference');
    const status =
      anchor.status === 'SUPERSEDED'
        ? ('SUPERSEDED' as const)
        : anchor.status === 'CONFIRMED'
          ? ('CURRENT' as const)
          : ('NOT_CONFIRMED' as const);
    return publicAnchorStatusSchema.parse({
      status,
      provider: anchor.provider,
      network: anchor.network,
      topicId: anchor.topicId,
      topicSequenceNumber: anchor.topicSequenceNumber?.toString() ?? null,
      consensusTimestamp: anchor.consensusTimestamp,
      transactionReference: anchor.submissionTransactionId,
      payloadHash: anchor.canonicalPayloadHash,
      mirrorNodeUrl: this.publicMirrorUrl(anchor.topicId, anchor.topicSequenceNumber?.toString()),
      supersedes: this.pointer(anchor.supersedesAnchor),
      supersededBy: this.pointer(anchor.supersededByAnchor),
      explanation:
        status === 'SUPERSEDED'
          ? 'This message was withdrawn by a later correction. The ledger keeps both; the replacement below carries the record ClyCites now considers correct.'
          : status === 'CURRENT'
            ? 'This message reached Hedera consensus and has not been superseded by a correction.'
            : 'This message was submitted to Hedera but ClyCites has not yet confirmed it against a mirror node.',
      limitation:
        'Hedera verification does not independently prove that the original physical weight, quality measurement, custody claim or source identity was accurate.',
    });
  }

  private pointer(
    anchor: {
      canonicalPayloadHash: string;
      submissionTransactionId: string | null;
      topicId: string | null;
      topicSequenceNumber: bigint | null;
      consensusTimestamp: string | null;
    } | null,
  ): PublicAnchorPointer | null {
    if (!anchor) return null;
    return publicAnchorPointerSchema.parse({
      transactionReference: anchor.submissionTransactionId,
      payloadHash: anchor.canonicalPayloadHash,
      topicId: anchor.topicId,
      topicSequenceNumber: anchor.topicSequenceNumber?.toString() ?? null,
      consensusTimestamp: anchor.consensusTimestamp,
      mirrorNodeUrl: this.publicMirrorUrl(anchor.topicId, anchor.topicSequenceNumber?.toString()),
    });
  }

  private async assertAnchor(organizationId: string, anchorId: string) {
    const anchor = await this.database.client.hederaAnchor.findFirst({
      where: { id: anchorId, organizationId },
      select: { id: true },
    });
    if (!anchor) throw new NotFoundException('Anchor not found');
    return anchor;
  }

  private async lotLineageIds(organizationId: string, lotId: string) {
    const lot = await this.database.client.cooperativeLot.findFirst({
      where: { id: lotId, organizationId },
      include: {
        contributions: {
          include: {
            batch: { include: { farmerContributions: true, transformationOutputs: true } },
          },
        },
      },
    });
    if (!lot) throw new NotFoundException('Lot not found');
    return [
      { entityType: 'LOT', entityId: lot.id },
      ...lot.contributions.flatMap((contribution) => [
        { entityType: 'BATCH', entityId: contribution.batchId },
        ...contribution.batch.farmerContributions.map((item) => ({
          entityType: 'DELIVERY',
          entityId: item.deliveryId,
        })),
        ...contribution.batch.transformationOutputs.map((item) => ({
          entityType: 'TRANSFORMATION',
          entityId: item.transformationId,
        })),
      ]),
    ];
  }

  private serialize(
    anchor: Prisma.HederaAnchorGetPayload<{
      include: { verifications: true; supersededByAnchor: { select: { id: true } } };
    }>,
  ) {
    const { verifications, supersededByAnchor, ...record } = anchor;
    const verification = verifications[0];
    return anchorDetailSchema.parse({
      ...record,
      topicSequenceNumber: anchor.topicSequenceNumber?.toString() ?? null,
      runningHashVersion: anchor.runningHashVersion?.toString() ?? null,
      submittedAt: anchor.submittedAt?.toISOString() ?? null,
      confirmedAt: anchor.confirmedAt?.toISOString() ?? null,
      createdAt: anchor.createdAt.toISOString(),
      updatedAt: anchor.updatedAt.toISOString(),
      calculatedPayloadHash: verification?.calculatedPayloadHash ?? null,
      mirrorPayloadHash: verification?.mirrorPayloadHash ?? null,
      chainStatus: verification?.chainStatus ?? 'UNKNOWN',
      supersededByAnchorId: supersededByAnchor?.id ?? null,
    });
  }

  private uuidSearch(value: string): string | undefined {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
      ? value
      : undefined;
  }

  private provider() {
    return this.config.getOrThrow('HEDERA_PROVIDER', { infer: true }) === 'mock'
      ? ('MOCK' as const)
      : ('SDK' as const);
  }
  private network() {
    const value = this.config.getOrThrow('HEDERA_NETWORK', { infer: true });
    return value === 'local'
      ? ('LOCAL' as const)
      : value === 'testnet'
        ? ('TESTNET' as const)
        : value === 'previewnet'
          ? ('PREVIEWNET' as const)
          : ('MAINNET' as const);
  }
  private publicMirrorUrl(topicId?: string | null, sequence?: string | null): string | null {
    const base = this.config.get('HEDERA_MIRROR_NODE_URL', { infer: true });
    if (!base || !topicId || !sequence) return null;
    const url = new URL(
      `/api/v1/topics/${encodeURIComponent(topicId)}/messages/${encodeURIComponent(sequence)}`,
      base,
    );
    return url.protocol === 'https:' ? url.toString() : null;
  }
}
