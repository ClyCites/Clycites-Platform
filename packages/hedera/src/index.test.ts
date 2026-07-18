import { describe, expect, it } from 'vitest';

import { canonicalJson, hashPayload } from './index.js';

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
});
