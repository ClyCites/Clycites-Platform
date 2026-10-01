// Anchor coverage is asserted against the running database because the failure it guards against is
// silence: an event class that produces no anchor leaves no error, no log and no failing unit test.
import 'reflect-metadata';

import { randomUUID } from 'node:crypto';

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createDatabaseClient } from '@clycites/database';
import { hashPayload } from '@clycites/hedera';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { ELIGIBLE_ANCHOR_EVENT_TYPES } from '../src/anchoring/anchor-eligibility.service.js';

const cooperativeId = '00000000-0000-4000-8000-000000000201';
const database = createDatabaseClient();

/**
 * Outbox event types that are deliberately not anchored. Anything absent from both this list and
 * ELIGIBLE_ANCHOR_EVENT_TYPES is an event nobody decided about, which is how BATCH_SPLIT went
 * unanchored without being noticed.
 */
const NOT_ANCHORED_EVENT_TYPES = new Set<string>([
  // Tenancy, devices and reference data. None of these is a claim about physical produce.
  'ORGANIZATION_CREATED',
  'DEVICE_REGISTERED',
  'DEVICE_REVOKED',
  'COLLECTION_POINT_CREATED',
  'COLLECTION_SESSION_OPENED',
  'COLLECTION_SESSION_CLOSED',
  'EXCHANGE_RATE_RECORDED',
  'DEDUCTION_POLICY_CREATED',
  'QUALITY_CONFIGURATION_REPLACED',
  'PILOT_DECISION_APPROVED',
  // Farmer identity and land. Deliberately never anchored, because the ledger is public forever.
  'FARMER_REGISTERED',
  'FARMER_UPDATED',
  'FARM_REGISTERED',
  'FARMER_CONSENT_GRANTED',
  'FARMER_CONSENT_WITHDRAWN',
  'FARMER_QR_ISSUED',
  'FARMER_QR_REPLACED',
  'FARMER_QR_REVOKED',
  // Delivery states before acceptance. Only acceptance is a claim about what was received.
  'DELIVERY_RECORDED',
  'DELIVERY_SUBMITTED',
  'DELIVERY_REJECTED',
  'DELIVERY_CONFIRMATION_DECLINED',
  'DELIVERY_MEASUREMENT_SUPERSEDED',
  'DELIVERY_CORRECTION_REQUESTED',
  'DELIVERY_CORRECTION_REJECTED',
  'DELIVERY_RECEIPT_REPRINTED',
  // Quality and custody steps that announce intent; the confirming step is anchored instead.
  'LOT_QUALITY_INSPECTED',
  'LOT_RESERVED',
  'LOT_TRACEABILITY_PUBLISHED',
  'CUSTODY_TRANSFER_CREATED',
  'CUSTODY_TRANSFER_DISPATCHED',
  'BUYER_INSPECTION_COMPLETED',
  // Commercial negotiation before a binding commitment exists.
  'MARKETPLACE_LISTING_PAUSED',
  'MARKETPLACE_LISTING_CLOSED',
  'MARKETPLACE_LISTING_CREATED',
  'OFFER_SUBMITTED',
  'OFFER_REJECTED',
  'OFFER_WITHDRAWN',
  'SALES_CONTRACT_CREATED',
  'SALES_CONTRACT_CANCELLED',
  'SALES_CONTRACT_SELLER_APPROVED',
  'CONTRACT_AMENDMENT_PROPOSED',
  'CONTRACT_AMENDMENT_WITHDRAWN',
  'CONTRACT_AMENDMENT_REJECTED',
  'SALES_ORDER_CREATED',
  'SALES_ORDER_CANCELLED',
  'ORDER_READY_FOR_DISPATCH',
  // Financial workflow either side of the approved figure, which is the anchored one.
  'SETTLEMENT_RUN_CREATED',
  'SETTLEMENT_CALCULATED',
  'SALE_PROCEEDS_RECORDED',
  'SALE_PROCEEDS_VERIFIED',
  'FARMER_ADVANCE_ISSUED',
  // Access control over the public share link, not a traceability claim.
  'TRACEABILITY_SHARE_CREATED',
  'TRACEABILITY_SHARE_REVOKED',
  // Written by this spec to build a supersession pair; anchors are append-only and are not removed.
  'ANCHOR_COVERAGE_FIXTURE',
]);

describe.sequential('Anchor coverage', () => {
  let app: INestApplication;
  const supersededId = randomUUID();
  const supersedingId = randomUUID();
  const supersededTransactionId = `0.0.4242@1770000000.${Date.now()}`;
  const supersedingTransactionId = `0.0.4242@1770000100.${Date.now()}`;
  // Anchors are append-only and topic sequence numbers are unique per topic, so a fixed pair would
  // collide with the rows left behind by an earlier run of this spec.
  const supersededSequence = BigInt(Date.now());
  const supersedingSequence = supersededSequence + 1n;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    // Anchors and traceability events are append-only in the database, so the supersession pair
    // written below stays. It is a MOCK anchor on a synthetic entity and this spec runs last.
    await app.close();
    await database.$disconnect();
  });

  it('has decided, for every event the platform emits, whether it is anchored', async () => {
    const emitted = await database.outboxEvent.groupBy({ by: ['eventType'] });
    const undecided = emitted
      .map((row) => row.eventType)
      .filter(
        (eventType) =>
          !ELIGIBLE_ANCHOR_EVENT_TYPES.has(eventType) && !NOT_ANCHORED_EVENT_TYPES.has(eventType),
      );
    expect(undecided, 'event types classified neither as anchored nor as deliberately unanchored')
      .toEqual([]);
  });

  it('anchors every eligible event type it emits, rather than dropping a whole class', async () => {
    // Seed fixtures are planted straight into the outbox and never pass through the domain event
    // service, so they are not evidence about the anchoring path. They exist so the outbox
    // processor has work to do; see the `outboxEvents` block in prisma/seed.ts.
    const seedPlantedOutboxIds = [
      '00000000-0000-4000-8000-000000000e01',
      '00000000-0000-4000-8000-000000000e02',
      '00000000-0000-4000-8000-000000000e03',
    ];
    const emitted = await database.outboxEvent.groupBy({
      by: ['eventType'],
      where: {
        eventType: { in: [...ELIGIBLE_ANCHOR_EVENT_TYPES] },
        id: { notIn: seedPlantedOutboxIds },
      },
      _count: true,
    });
    const dropped: string[] = [];
    for (const row of emitted) {
      const anchored = await database.traceabilityEvent.count({
        where: { outboxEvent: { eventType: row.eventType } },
      });
      if (anchored === 0) dropped.push(`${row.eventType} (${row._count} emitted, 0 anchored)`);
    }
    // A dropped class still records its outbox event — that was the signature of both
    // transformation defects — so excluding seed fixtures does not weaken this assertion.
    expect(emitted.length).toBeGreaterThan(5);
    expect(dropped, 'eligible event types that produced no traceability event at all').toEqual([]);
  });

  it('never stores an anchor payload containing farmer identity or location', async () => {
    const farmers = await database.farmer.findMany({
      include: { farms: { include: { plots: true } } },
    });
    const forbidden = new Set<string>();
    for (const farmer of farmers) {
      for (const value of [
        farmer.farmerNumber,
        farmer.firstName,
        farmer.middleName,
        farmer.lastName,
        farmer.preferredName,
        farmer.primaryPhone,
        farmer.alternativePhone,
        farmer.email,
        farmer.village,
        farmer.parish,
        farmer.dateOfBirth?.toISOString().slice(0, 10),
      ])
        if (value && value.length > 3) forbidden.add(value);
      for (const farm of farmer.farms)
        for (const plot of farm.plots)
          for (const value of [plot.centroidLatitude, plot.centroidLongitude])
            if (value) forbidden.add(value.toString());
    }
    expect(forbidden.size, 'deny-list must be built from real seeded values').toBeGreaterThan(5);

    const events = await database.traceabilityEvent.findMany({
      select: { id: true, eventType: true, canonicalPayload: true },
    });
    expect(events.length, 'nothing is proven by scanning zero payloads').toBeGreaterThan(0);
    const leaks: string[] = [];
    for (const event of events) {
      const bytes = JSON.stringify(event.canonicalPayload);
      for (const value of forbidden)
        if (bytes.includes(value)) leaks.push(`${event.eventType} leaked ${value}`);
    }
    expect(leaks).toEqual([]);
  });

  it('lets an outside verifier follow a withdrawn message to its replacement', async () => {
    const outbox = await database.outboxEvent.create({
      data: {
        aggregateType: 'BatchTransformation',
        aggregateId: supersededId,
        eventType: 'ANCHOR_COVERAGE_FIXTURE',
        schemaVersion: '1.0',
        payload: {},
      },
    });
    const replacementOutbox = await database.outboxEvent.create({
      data: {
        aggregateType: 'BatchTransformation',
        aggregateId: supersededId,
        eventType: 'ANCHOR_COVERAGE_FIXTURE',
        schemaVersion: '1.0',
        payload: {},
      },
    });
    const original = await database.traceabilityEvent.create({
      data: {
        organizationId: cooperativeId,
        outboxEventId: outbox.id,
        entityType: 'TRANSFORMATION',
        entityId: supersededId,
        eventType: 'TRANSFORMATION_COMPLETED',
        schemaVersion: '1.0',
        canonicalPayload: { marker: 'original' },
        canonicalPayloadHash: hashPayload({ marker: 'original' }),
        chainPosition: 1,
        occurredAt: new Date(),
      },
    });
    const replacement = await database.traceabilityEvent.create({
      data: {
        organizationId: cooperativeId,
        outboxEventId: replacementOutbox.id,
        entityType: 'TRANSFORMATION',
        entityId: supersededId,
        eventType: 'TRANSFORMATION_SUPERSEDED',
        schemaVersion: '1.0',
        canonicalPayload: { marker: 'replacement' },
        canonicalPayloadHash: hashPayload({ marker: 'replacement' }),
        previousEventHash: original.canonicalPayloadHash,
        chainPosition: 2,
        occurredAt: new Date(),
      },
    });
    const anchorBase = {
      organizationId: cooperativeId,
      entityType: 'TRANSFORMATION',
      entityId: supersededId,
      schemaVersion: '1.0',
      privacyReferenceVersion: 'v1',
      provider: 'MOCK' as const,
      network: 'LOCAL' as const,
      topicId: '0.0.424242',
      consensusTimestamp: '1770000000.000000001',
      submittedAt: new Date(),
      confirmedAt: new Date(),
    };
    await database.hederaAnchor.create({
      data: {
        ...anchorBase,
        id: supersededId,
        anchorEventId: outbox.id,
        traceabilityEventId: original.id,
        eventType: 'TRANSFORMATION_COMPLETED',
        canonicalPayloadHash: original.canonicalPayloadHash,
        status: 'SUPERSEDED',
        submissionTransactionId: supersededTransactionId,
        topicSequenceNumber: supersededSequence,
      },
    });
    await database.hederaAnchor.create({
      data: {
        ...anchorBase,
        id: supersedingId,
        anchorEventId: replacementOutbox.id,
        traceabilityEventId: replacement.id,
        eventType: 'TRANSFORMATION_SUPERSEDED',
        canonicalPayloadHash: replacement.canonicalPayloadHash,
        status: 'CONFIRMED',
        submissionTransactionId: supersedingTransactionId,
        topicSequenceNumber: supersedingSequence,
        supersedesAnchorId: supersededId,
      },
    });

    const withdrawn = await request(app.getHttpServer())
      .get(`/api/v1/public/verify/anchors/${encodeURIComponent(supersededTransactionId)}`)
      .expect(200);
    expect(withdrawn.body.data.status).toBe('SUPERSEDED');
    expect(withdrawn.body.data.supersededBy.transactionReference).toBe(supersedingTransactionId);
    expect(withdrawn.body.data.supersededBy.payloadHash).toBe(replacement.canonicalPayloadHash);

    const current = await request(app.getHttpServer())
      .get(`/api/v1/public/verify/anchors/${encodeURIComponent(supersedingTransactionId)}`)
      .expect(200);
    expect(current.body.data.status).toBe('CURRENT');
    expect(current.body.data.supersedes.transactionReference).toBe(supersededTransactionId);
    expect(current.body.data.supersededBy).toBeNull();

    // The endpoint is unauthenticated, so it must expose nothing beyond ledger coordinates.
    const serialized = JSON.stringify(withdrawn.body.data) + JSON.stringify(current.body.data);
    for (const identifier of [cooperativeId, supersededId, supersedingId, original.id])
      expect(serialized).not.toContain(identifier);
  });

  it('reports an unpublished transaction reference as unknown rather than inventing a status', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/public/verify/anchors/${encodeURIComponent('0.0.9999@1@0.0')}`)
      .expect(404);
  });
});
