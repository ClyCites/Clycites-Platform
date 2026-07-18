import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@clycites/database';

import { AnchorEligibilityService } from '../anchoring/anchor-eligibility.service.js';
import type { ApiEnvironment } from '../config/environment.js';

export interface DomainEventInput {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload?: Prisma.InputJsonObject;
}

@Injectable()
export class DomainEventService {
  constructor(
    @Inject(AnchorEligibilityService) private readonly eligibility: AnchorEligibilityService,
    @Inject(ConfigService) private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  async create(input: DomainEventInput, transaction: Prisma.TransactionClient) {
    const outboxEvent = await transaction.outboxEvent.create({
      data: {
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        eventType: input.eventType,
        schemaVersion: '1.0',
        payload: input.payload ?? {},
      },
    });
    const organizationId = input.payload?.organizationId;
    if (typeof organizationId !== 'string') return outboxEvent;
    const prepared = await this.eligibility.prepare(
      {
        eventId: outboxEvent.id,
        aggregateId: input.aggregateId,
        eventType: input.eventType,
        organizationId,
        payload: input.payload ?? {},
      },
      transaction,
    );
    if (!prepared) return outboxEvent;

    const chainKey = `${organizationId}:${prepared.entityType}:${prepared.entityId}`;
    await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${chainKey}, 0)) IS NULL AS "locked"`;
    const previous = await transaction.traceabilityEvent.findFirst({
      where: { organizationId, entityType: prepared.entityType, entityId: prepared.entityId },
      orderBy: { chainPosition: 'desc' },
      include: { anchor: { select: { id: true } } },
    });
    const traceabilityEvent = await transaction.traceabilityEvent.create({
      data: {
        organizationId,
        outboxEventId: outboxEvent.id,
        entityType: prepared.entityType,
        entityId: prepared.entityId,
        eventType: prepared.eventType,
        schemaVersion: '1.0',
        canonicalPayload: prepared.canonicalPayload,
        canonicalPayloadHash: prepared.canonicalPayloadHash,
        previousEventHash: previous?.canonicalPayloadHash ?? null,
        chainPosition: (previous?.chainPosition ?? 0) + 1,
        occurredAt: outboxEvent.createdAt,
      },
    });
    const provider = this.config.getOrThrow('HEDERA_PROVIDER', { infer: true });
    const network = this.config.getOrThrow('HEDERA_NETWORK', { infer: true });
    const supersedesAnchorId =
      prepared.supersedesAnchorId ??
      (['DELIVERY_CORRECTED', 'TRACEABILITY_RECORD_SUPERSEDED'].includes(prepared.eventType)
        ? (previous?.anchor?.id ?? null)
        : null);
    await transaction.hederaAnchor.create({
      data: {
        anchorEventId: outboxEvent.id,
        traceabilityEventId: traceabilityEvent.id,
        organizationId,
        entityType: prepared.entityType,
        entityId: prepared.entityId,
        eventType: prepared.eventType,
        schemaVersion: '1.0',
        canonicalPayloadHash: prepared.canonicalPayloadHash,
        previousEventHash: previous?.canonicalPayloadHash ?? null,
        privacyReferenceVersion: this.config.getOrThrow('HEDERA_REFERENCE_SECRET_VERSION', {
          infer: true,
        }),
        provider: provider === 'mock' ? 'MOCK' : 'SDK',
        network:
          network === 'local'
            ? 'LOCAL'
            : network === 'testnet'
              ? 'TESTNET'
              : network === 'previewnet'
                ? 'PREVIEWNET'
                : 'MAINNET',
        ...(supersedesAnchorId ? { supersedesAnchorId } : {}),
      },
    });
    return outboxEvent;
  }
}
