// The gate for WP15 section 2: nothing that identifies a person or locates a plot may reach a
// canonical payload or a Hedera message, and no field may be added to either without a reviewable
// golden diff.
//
// Two facts shape these assertions:
//   1. The canonical payload is never submitted to Hedera. Only `payloadHash` is. The payload is
//      still audited here because it is the artefact a verifier would have to be given in order to
//      re-derive that hash, and because it is stored in full in `TraceabilityEvent`.
//   2. Assertions run against the serialised bytes, not the object shape. A widened Prisma
//      `include` or a stray spread smuggles fields past any shallow key check, so the fixtures in
//      anchor-payload.fixtures.ts deliberately return rows far wider than the builders read.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ConfigService } from '@nestjs/config';
import { anchorEventTypeSchema, anchorMessageSchema } from '@clycites/contracts';
import { buildAnchorMessage, canonicalJson, createPrivacyReference } from '@clycites/hedera';
import { describe, expect, it } from 'vitest';

import { AnchorEligibilityService } from './anchor-eligibility.service.js';
import {
  createFixtureTransaction,
  ENTITY_IDS,
  EVENT_ID,
  ORGANIZATION_ID,
  SENSITIVE_VALUES,
} from './anchor-payload.fixtures.js';

const goldenPath = fileURLToPath(new URL('./anchor-payload.golden.json', import.meta.url));
const referenceSecret = 'anchor-golden-fixture-reference-secret-000001';
const referenceSecretVersion = 'v1';
const occurredAt = new Date('2026-02-14T10:00:00.000Z');

const service = new AnchorEligibilityService(
  new ConfigService({
    HEDERA_REFERENCE_SECRET: referenceSecret,
    HEDERA_REFERENCE_SECRET_VERSION: referenceSecretVersion,
  }),
);

interface Case {
  /** The outbox event type that reaches AnchorEligibilityService.prepare. */
  sourceEventType: string;
  aggregateId: string;
  payload?: Record<string, unknown>;
}

/**
 * One case per member of anchorEventTypeSchema. The coverage test below fails if this table and the
 * contract enum ever disagree, so a new anchor event type cannot be added without a golden entry.
 */
const cases: Record<string, Case> = {
  DELIVERY_ACCEPTED: { sourceEventType: 'DELIVERY_ACCEPTED', aggregateId: ENTITY_IDS.DELIVERY },
  DELIVERY_CORRECTED: {
    sourceEventType: 'DELIVERY_CORRECTION_APPROVED',
    aggregateId: ENTITY_IDS.DELIVERY,
    payload: { replacementDeliveryId: ENTITY_IDS.DELIVERY },
  },
  RECEIPT_ISSUED: {
    sourceEventType: 'DELIVERY_RECEIPT_ISSUED',
    aggregateId: ENTITY_IDS.DELIVERY,
  },
  BATCH_CREATED: { sourceEventType: 'PRODUCE_BATCH_CREATED', aggregateId: ENTITY_IDS.BATCH },
  DELIVERY_ADDED_TO_BATCH: {
    // FARMER_BATCH_CONTRIBUTION_ADDED is aggregated on the batch and names the delivery in its
    // payload, so the anchor is a delivery snapshot recorded against the batch entity.
    sourceEventType: 'FARMER_BATCH_CONTRIBUTION_ADDED',
    aggregateId: ENTITY_IDS.BATCH,
    payload: { deliveryId: ENTITY_IDS.DELIVERY },
  },
  BATCH_SEALED: { sourceEventType: 'PRODUCE_BATCH_SEALED', aggregateId: ENTITY_IDS.BATCH },
  BATCH_SPLIT: {
    sourceEventType: 'BATCH_TRANSFORMATION_COMPLETED',
    aggregateId: ENTITY_IDS.TRANSFORMATION,
    payload: { type: 'SPLIT' },
  },
  BATCH_MERGED: {
    sourceEventType: 'BATCH_TRANSFORMATION_COMPLETED',
    aggregateId: ENTITY_IDS.TRANSFORMATION,
    payload: { type: 'MERGE' },
  },
  TRANSFORMATION_COMPLETED: {
    sourceEventType: 'BATCH_TRANSFORMATION_COMPLETED',
    aggregateId: ENTITY_IDS.TRANSFORMATION,
    payload: { type: 'TRANSFORMATION' },
  },
  TRANSFORMATION_SUPERSEDED: {
    sourceEventType: 'BATCH_TRANSFORMATION_SUPERSEDED',
    aggregateId: ENTITY_IDS.TRANSFORMATION,
    payload: { replacedByTransformationId: ENTITY_IDS.REPLACEMENT_TRANSFORMATION },
  },
  LOT_CREATED: { sourceEventType: 'COOPERATIVE_LOT_CREATED', aggregateId: ENTITY_IDS.LOT },
  BATCH_ADDED_TO_LOT: { sourceEventType: 'BATCH_ADDED_TO_LOT', aggregateId: ENTITY_IDS.BATCH },
  LOT_SEALED: { sourceEventType: 'COOPERATIVE_LOT_SEALED', aggregateId: ENTITY_IDS.LOT },
  LOT_QUALITY_APPROVED: {
    sourceEventType: 'COOPERATIVE_LOT_APPROVED',
    aggregateId: ENTITY_IDS.LOT,
  },
  CUSTODY_TRANSFER_CONFIRMED: {
    sourceEventType: 'CUSTODY_TRANSFER_RECEIVED',
    aggregateId: ENTITY_IDS.CUSTODY_TRANSFER,
    payload: { transferId: ENTITY_IDS.CUSTODY_TRANSFER },
  },
  TRACEABILITY_RECORD_CORRECTED: {
    sourceEventType: 'TRACEABILITY_RECORD_CORRECTED',
    aggregateId: ENTITY_IDS.RECORD,
  },
  TRACEABILITY_RECORD_SUPERSEDED: {
    sourceEventType: 'TRACEABILITY_RECORD_SUPERSEDED',
    aggregateId: ENTITY_IDS.RECORD,
  },
  MARKETPLACE_LISTING_PUBLISHED: {
    sourceEventType: 'MARKETPLACE_LISTING_PUBLISHED',
    aggregateId: ENTITY_IDS.LISTING,
  },
  OFFER_ACCEPTED: { sourceEventType: 'OFFER_ACCEPTED', aggregateId: ENTITY_IDS.OFFER },
  SALES_CONTRACT_ACTIVATED: {
    sourceEventType: 'SALES_CONTRACT_ACTIVATED',
    aggregateId: ENTITY_IDS.CONTRACT,
  },
  ORDER_DISPATCHED: { sourceEventType: 'ORDER_DISPATCHED', aggregateId: ENTITY_IDS.ORDER },
  ORDER_RECEIVED: { sourceEventType: 'ORDER_RECEIVED', aggregateId: ENTITY_IDS.ORDER },
  BUYER_ACCEPTANCE_RECORDED: {
    sourceEventType: 'BUYER_ACCEPTANCE_RECORDED',
    aggregateId: ENTITY_IDS.ACCEPTANCE,
  },
  SALES_ORDER_COMPLETED: {
    sourceEventType: 'SALES_ORDER_COMPLETED',
    aggregateId: ENTITY_IDS.ORDER,
  },
  SETTLEMENT_APPROVED: {
    sourceEventType: 'SETTLEMENT_APPROVED',
    aggregateId: ENTITY_IDS.SETTLEMENT,
  },
  FARMER_STATEMENT_ISSUED: {
    sourceEventType: 'FARMER_STATEMENT_ISSUED',
    aggregateId: ENTITY_IDS.STATEMENT,
  },
  PAYMENT_CONFIRMED: {
    sourceEventType: 'PAYMENT_CONFIRMED',
    aggregateId: ENTITY_IDS.RECONCILIATION,
  },
};

interface Captured {
  canonicalPayload: Record<string, unknown>;
  message: Record<string, unknown>;
}

async function capture(anchorEventType: string): Promise<Captured> {
  const testCase = cases[anchorEventType];
  if (!testCase) throw new Error(`No fixture case for ${anchorEventType}`);
  const prepared = await service.prepare(
    {
      eventId: EVENT_ID,
      aggregateId: testCase.aggregateId,
      eventType: testCase.sourceEventType,
      organizationId: ORGANIZATION_ID,
      payload: (testCase.payload ?? {}) as never,
    },
    createFixtureTransaction(),
  );
  if (!prepared) throw new Error(`${anchorEventType} produced no anchor`);
  if (prepared.eventType !== anchorEventType)
    throw new Error(`${anchorEventType} fixture produced ${prepared.eventType}`);
  const message = buildAnchorMessage(
    {
      schemaVersion: '1.0',
      anchorEventId: EVENT_ID,
      eventType: prepared.eventType,
      organizationId: ORGANIZATION_ID,
      entityType: prepared.entityType,
      entityId: prepared.entityId,
      canonicalPayloadHash: prepared.canonicalPayloadHash,
      previousEventHash: null,
      occurredAt,
    },
      { secret: referenceSecret, version: referenceSecretVersion },
  );
  // The API decides which entity an event is about and the worker turns that decision into the
  // published reference. If those two ever disagreed, the ledger would be labelled with one entity
  // while the platform believed it had anchored another.
  if (message.organizationRef !== prepared.organizationReference)
    throw new Error(`${anchorEventType} organization reference disagrees with the published one`);
  if (message.entityRef !== prepared.entityReference)
    throw new Error(`${anchorEventType} entity reference disagrees with the published one`);
  return {
    canonicalPayload: prepared.canonicalPayload,
    message: message as unknown as Record<string, unknown>,
  };
}

async function captureAll(): Promise<Record<string, Captured>> {
  const captured: Record<string, Captured> = {};
  for (const anchorEventType of anchorEventTypeSchema.options) {
    captured[anchorEventType] = await capture(anchorEventType);
  }
  return captured;
}

describe('anchor payload privacy', () => {
  it('covers every anchor event type in the contract enum', () => {
    expect(Object.keys(cases).sort()).toEqual([...anchorEventTypeSchema.options].sort());
  });

  it('produces an anchor for every anchor event type', async () => {
    const captured = await captureAll();
    expect(Object.keys(captured)).toHaveLength(anchorEventTypeSchema.options.length);
  });

  it('leaks none of the contaminating values into a canonical payload or a message', async () => {
    const captured = await captureAll();
    const leaks: string[] = [];
    for (const [anchorEventType, { canonicalPayload, message }] of Object.entries(captured)) {
      const payloadBytes = canonicalJson(canonicalPayload);
      const messageBytes = canonicalJson(message);
      for (const [label, value] of Object.entries(SENSITIVE_VALUES)) {
        if (payloadBytes.includes(value)) leaks.push(`${anchorEventType}.canonicalPayload.${label}`);
        if (messageBytes.includes(value)) leaks.push(`${anchorEventType}.message.${label}`);
      }
    }
    expect(leaks).toEqual([]);
  });

  it('would detect a leak, because the contaminating values reach the builders', async () => {
    // Guards the test above against becoming vacuous: if the fixtures ever stopped carrying the
    // sensitive values, the deny-list would pass for the wrong reason.
    const transaction = createFixtureTransaction();
    const row = await (
      transaction as unknown as {
        delivery: { findUnique: (arguments_: { where: { id: string } }) => Promise<unknown> };
      }
    ).delivery.findUnique({ where: { id: ENTITY_IDS.DELIVERY } });
    const bytes = JSON.stringify(row);
    for (const value of Object.values(SENSITIVE_VALUES)) {
      expect(bytes).toContain(value);
    }
  });

  it('identifies a farmer only through a keyed privacy reference', async () => {
    const { canonicalPayload } = await capture('DELIVERY_ACCEPTED');
    expect(canonicalPayload.farmerReferenceHash).toBe(
      createPrivacyReference(
        referenceSecret,
        referenceSecretVersion,
        'FARMER',
        '00000000-0000-4000-8000-0000000a0002',
      ),
    );
  });

  it('matches the committed golden payloads', async () => {
    const captured = await captureAll();
    if (process.env.UPDATE_ANCHOR_GOLDEN === '1') {
      writeFileSync(goldenPath, `${JSON.stringify(captured, null, 2)}\n`);
    }
    const golden = JSON.parse(readFileSync(goldenPath, 'utf8')) as Record<string, Captured>;
    expect(captured).toEqual(golden);
  });
});

describe('anchor message contract', () => {
  it('rejects an unknown key and reports it as unrecognised', () => {
    const result = anchorMessageSchema.safeParse({
      schemaVersion: '1.0',
      anchorEventId: EVENT_ID,
      eventType: 'DELIVERY_ACCEPTED',
      organizationRef: createPrivacyReference(
        referenceSecret,
        referenceSecretVersion,
        'ORGANIZATION',
        ORGANIZATION_ID,
      ),
      entityType: 'DELIVERY',
      entityRef: createPrivacyReference(
        referenceSecret,
        referenceSecretVersion,
        'DELIVERY',
        ENTITY_IDS.DELIVERY,
      ),
      payloadHash: `sha256:${'a'.repeat(64)}`,
      previousEventHash: null,
      occurredAt: occurredAt.toISOString(),
      farmerFullName: SENSITIVE_VALUES.farmerFullName,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.code)).toContain('unrecognized_keys');
  });

  it('keeps every message within the single-chunk submission budget', async () => {
    const captured = await captureAll();
    for (const [anchorEventType, { message }] of Object.entries(captured)) {
      const bytes = Buffer.byteLength(canonicalJson(message), 'utf8');
      expect(bytes, `${anchorEventType} message size`).toBeLessThanOrEqual(1024);
    }
  });
});
