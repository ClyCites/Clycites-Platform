import { createHash, createHmac } from 'node:crypto';

import { z } from 'zod';

export * from './providers.js';
export * from './config.js';
export * from './sdk-provider.js';

export const HEDERA_EVENT_TYPES = {
  DELIVERY_ACCEPTED: 'DELIVERY_ACCEPTED',
  QUALITY_GRADED: 'QUALITY_GRADED',
  BATCH_SPLIT: 'BATCH_SPLIT',
  BATCH_MERGED: 'BATCH_MERGED',
  CUSTODY_TRANSFERRED: 'CUSTODY_TRANSFERRED',
  LOT_CREATED: 'LOT_CREATED',
  BUYER_ACCEPTED: 'BUYER_ACCEPTED',
  SETTLEMENT_CALCULATED: 'SETTLEMENT_CALCULATED',
  PAYMENT_CONFIRMED: 'PAYMENT_CONFIRMED',
  RECORD_CORRECTED: 'RECORD_CORRECTED',
} as const;

export const hederaConfigSchema = z
  .object({
    network: z.enum(['mock', 'testnet', 'previewnet', 'mainnet']).default('mock'),
    operatorId: z.string().optional(),
    operatorKey: z.string().optional(),
    topicId: z.string().optional(),
  })
  .superRefine((config, context) => {
    if (
      config.network !== 'mock' &&
      (!config.operatorId || !config.operatorKey || !config.topicId)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Operator ID, operator key, and topic ID are required outside mock mode',
      });
    }
  });

export const anchorEventSchema = z.object({
  schemaVersion: z.string().min(1),
  eventId: z.uuid(),
  eventType: z.enum(HEDERA_EVENT_TYPES),
  organizationId: z.uuid(),
  entityType: z.string().min(1),
  entityId: z.uuid(),
  payloadHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  previousEventHash: z
    .string()
    .regex(/^sha256:[a-f0-9]{64}$/)
    .optional(),
  occurredAt: z.iso.datetime(),
});

export type AnchorEvent = z.infer<typeof anchorEventSchema>;
export type HederaConfig = z.infer<typeof hederaConfigSchema>;

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
