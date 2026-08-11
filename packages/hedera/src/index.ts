import { createHash, createHmac } from 'node:crypto';

import { type AnchorMessage, anchorMessageSchema } from '@clycites/contracts';

export * from './providers.js';
export * from './config.js';
export * from './sdk-provider.js';

type JsonPrimitive = boolean | null | number | string;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

const normalize = (value: unknown): JsonValue => {
  if (value === undefined) throw new TypeError('Canonical JSON does not support undefined values');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.normalize('NFC');
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new TypeError('Canonical JSON does not support non-finite numbers');
    return value;
  }
  if (typeof value === 'bigint') return value.toString(10);
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime()))
      throw new TypeError('Canonical JSON does not support invalid dates');
    return value.toISOString();
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalize((value as Record<string, unknown>)[key])]),
    );
  }
  throw new TypeError(`Canonical JSON does not support values of type ${typeof value}`);
};

export const canonicalJson = (value: unknown): string => JSON.stringify(normalize(value));

export const hashPayload = (value: unknown): string =>
  `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;

export const createPrivacyReference = (
  secret: string,
  secretVersion: string,
  entityType: string,
  entityId: string,
): string => {
  if (Buffer.byteLength(secret, 'utf8') < 32)
    throw new TypeError('Hedera reference secret must be at least 32 bytes');
  const digest = createHmac('sha256', secret)
    .update(`${entityType.normalize('NFC')}:${entityId.normalize('NFC')}`, 'utf8')
    .digest('hex');
  return `hmac-sha256:${secretVersion}:${digest}`;
};

/** The anchor being withdrawn by a superseding anchor. */
export interface SupersededAnchorSource {
  id: string;
  canonicalPayloadHash: string;
  submissionTransactionId: string | null;
}

/** The stored anchor row, in the shape the message is derived from. */
export interface AnchorMessageSource {
  schemaVersion: string;
  anchorEventId: string;
  eventType: string;
  organizationId: string;
  entityType: string;
  entityId: string;
  canonicalPayloadHash: string;
  previousEventHash: string | null;
  occurredAt: Date;
  supersedesAnchor?: SupersededAnchorSource | null;
}

export interface PrivacyReferenceKey {
  secret: string;
  version: string;
}

/**
 * The single definition of what ClyCites publishes to a consensus topic.
 *
 * Submission and reconciliation must agree on this byte for byte: reconciliation re-derives the
 * message it expects and compares it with what the mirror node returns, so any divergence between
 * two copies of this construction would be reported as tampering. It is therefore built in exactly
 * one place.
 */
export function buildAnchorMessage(
  source: AnchorMessageSource,
  key: PrivacyReferenceKey,
): AnchorMessage {
  const reference = (entityType: string, entityId: string) =>
    createPrivacyReference(key.secret, key.version, entityType, entityId);
  const superseded = source.supersedesAnchor ?? null;
  return anchorMessageSchema.parse({
    schemaVersion: source.schemaVersion,
    anchorEventId: source.anchorEventId,
    eventType: source.eventType,
    organizationRef: reference('ORGANIZATION', source.organizationId),
    entityType: source.entityType,
    entityRef: reference(source.entityType, source.entityId),
    payloadHash: source.canonicalPayloadHash,
    previousEventHash: source.previousEventHash,
    occurredAt: source.occurredAt.toISOString(),
    supersedesAnchorRef: superseded ? reference('ANCHOR', superseded.id) : null,
    // Public handles for the withdrawn message. Without these an outside verifier holding the
    // superseding message has no way to identify what it replaces, because the reference above is
    // keyed with a secret only ClyCites holds.
    supersedesPayloadHash: superseded?.canonicalPayloadHash ?? null,
    supersedesTransactionId: superseded?.submissionTransactionId ?? null,
  });
}
