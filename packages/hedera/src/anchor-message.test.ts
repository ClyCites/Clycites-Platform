import { describe, expect, it } from 'vitest';

import {
  type AnchorMessageSource,
  buildAnchorMessage,
  canonicalJson,
  createPrivacyReference,
} from './index.js';

const KEY = { secret: 'anchor-message-test-reference-secret-0001', version: 'v1' };

const source = (overrides: Partial<AnchorMessageSource> = {}): AnchorMessageSource => ({
  schemaVersion: '1.0',
  anchorEventId: '00000000-0000-4000-8000-000000000001',
  eventType: 'DELIVERY_ACCEPTED',
  organizationId: '00000000-0000-4000-8000-000000000201',
  entityType: 'DELIVERY',
  entityId: '00000000-0000-4000-8000-000000000301',
  canonicalPayloadHash: `sha256:${'a'.repeat(64)}`,
  previousEventHash: null,
  occurredAt: new Date('2026-02-01T08:00:00.000Z'),
  supersedesAnchor: null,
  ...overrides,
});

const superseded = {
  id: '00000000-0000-4000-8000-000000000002',
  canonicalPayloadHash: `sha256:${'b'.repeat(64)}`,
  submissionTransactionId: '0.0.1234@1770000000.000000001',
};

describe('buildAnchorMessage', () => {
  it('is the only construction, so every worker that rebuilds a message produces identical bytes', () => {
    // Submission publishes these bytes; confirmation and reconciliation rebuild them and report a
    // MISMATCH on any difference. A divergent second copy of this construction would therefore be
    // indistinguishable from ledger tampering. Calling the same function from every site is what
    // makes that impossible, so this test asserts the property the shared function guarantees.
    const input = source({ supersedesAnchor: superseded });
    const submitted = buildAnchorMessage(input, KEY);
    const rebuilt = buildAnchorMessage({ ...input, occurredAt: new Date(input.occurredAt) }, KEY);
    expect(canonicalJson(rebuilt)).toBe(canonicalJson(submitted));
  });

  it('publishes no raw identifier, only keyed references', () => {
    const input = source({ supersedesAnchor: superseded });
    const bytes = canonicalJson(buildAnchorMessage(input, KEY));
    for (const identifier of [
      input.organizationId,
      input.entityId,
      superseded.id,
    ]) {
      expect(bytes).not.toContain(identifier);
    }
  });

  it('lets an outside verifier resolve what a superseding anchor withdraws', () => {
    // The keyed reference is unresolvable without the platform secret. A public verifier must still
    // be able to find the withdrawn message on the topic, so the correction carries that message's
    // own payload hash and transaction id, both of which are public.
    const message = buildAnchorMessage(source({ supersedesAnchor: superseded }), KEY);
    expect(message.supersedesPayloadHash).toBe(superseded.canonicalPayloadHash);
    expect(message.supersedesTransactionId).toBe(superseded.submissionTransactionId);
    expect(message.supersedesAnchorRef).toBe(
      createPrivacyReference(KEY.secret, KEY.version, 'ANCHOR', superseded.id),
    );
  });

  it('claims no supersession when there is none', () => {
    const message = buildAnchorMessage(source(), KEY);
    expect(message.supersedesAnchorRef).toBeNull();
    expect(message.supersedesPayloadHash).toBeNull();
    expect(message.supersedesTransactionId).toBeNull();
  });

  it('still resolves a supersession whose original submission was never recorded', () => {
    const message = buildAnchorMessage(
      source({ supersedesAnchor: { ...superseded, submissionTransactionId: null } }),
      KEY,
    );
    expect(message.supersedesTransactionId).toBeNull();
    expect(message.supersedesPayloadHash).toBe(superseded.canonicalPayloadHash);
  });

  it('rejects a source that would produce an invalid message rather than publishing it', () => {
    expect(() => buildAnchorMessage(source({ canonicalPayloadHash: 'not-a-hash' }), KEY)).toThrow();
  });

  it('fits a correction inside the single-chunk budget', () => {
    const bytes = Buffer.byteLength(
      canonicalJson(
        buildAnchorMessage(
          source({
            supersedesAnchor: superseded,
            previousEventHash: `sha256:${'c'.repeat(64)}`,
            eventType: 'TRACEABILITY_RECORD_SUPERSEDED',
          }),
          KEY,
        ),
      ),
      'utf8',
    );
    expect(bytes).toBeLessThanOrEqual(1024);
  });
});
