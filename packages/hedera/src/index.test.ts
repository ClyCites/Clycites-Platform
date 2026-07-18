import { describe, expect, it } from 'vitest';

import { canonicalJson, createPrivacyReference, hashPayload } from './index.js';

describe('canonical Hedera payload hashing', () => {
  it('serializes deterministically regardless of object key order', () => {
    expect(canonicalJson({ farm: { district: 'Mbale', id: 7 }, weight: 60 })).toBe(
      canonicalJson({ weight: 60, farm: { id: 7, district: 'Mbale' } }),
    );
  });

  it('produces identical hashes for identical payloads', () => {
    const payload = { event: 'DELIVERY_ACCEPTED', weight: 60 };
    expect(hashPayload(payload)).toBe(hashPayload(payload));
  });

  it('produces different hashes for different payloads', () => {
    expect(hashPayload({ weight: 60 })).not.toBe(hashPayload({ weight: 61 }));
  });

  it('does not change hashes when object keys are reordered', () => {
    expect(hashPayload({ a: 1, b: 2 })).toBe(hashPayload({ b: 2, a: 1 }));
  });

  it('preserves array order', () => {
    expect(hashPayload({ lots: ['a', 'b'] })).not.toBe(hashPayload({ lots: ['b', 'a'] }));
  });

  it('normalizes Unicode strings and UTC timestamps', () => {
    expect(
      canonicalJson({ name: 'Cafe\u0301', occurredAt: new Date('2026-07-19T12:30:00+03:00') }),
    ).toBe('{"name":"Café","occurredAt":"2026-07-19T09:30:00.000Z"}');
  });

  it('serializes BigInt values as decimal strings and preserves null', () => {
    expect(canonicalJson({ sequenceNumber: 9_007_199_254_740_993n, optional: null })).toBe(
      '{"optional":null,"sequenceNumber":"9007199254740993"}',
    );
  });

  it('rejects undefined values instead of silently dropping them', () => {
    expect(() => canonicalJson({ payloadHash: undefined })).toThrow(/undefined/);
  });

  it('rejects non-finite numbers', () => {
    expect(() => canonicalJson({ quantity: Number.POSITIVE_INFINITY })).toThrow(/non-finite/);
  });

  it('returns consistently prefixed lowercase SHA-256 hashes', () => {
    expect(hashPayload({ schemaVersion: '1.0' })).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});

describe('privacy-safe Hedera references', () => {
  const secret = 'phase-four-reference-secret-at-least-32-characters';
  const internalId = '00000000-0000-4000-8000-000000001031';

  it('is deterministic and includes the secret version', () => {
    expect(createPrivacyReference(secret, 'v1', 'LOT', internalId)).toBe(
      createPrivacyReference(secret, 'v1', 'LOT', internalId),
    );
    expect(createPrivacyReference(secret, 'v1', 'LOT', internalId)).toMatch(
      /^hmac-sha256:v1:[a-f0-9]{64}$/,
    );
  });

  it('separates entity types and does not expose internal identifiers', () => {
    const lotReference = createPrivacyReference(secret, 'v1', 'LOT', internalId);
    expect(lotReference).not.toBe(createPrivacyReference(secret, 'v1', 'DELIVERY', internalId));
    expect(lotReference).not.toContain(internalId);
  });
});
