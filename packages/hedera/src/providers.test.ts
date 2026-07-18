import type { AnchorMessage } from '@clycites/contracts';
import { describe, expect, it } from 'vitest';

import {
  HederaProviderError,
  MessageAnchorVerifier,
  MockHederaAnchorProvider,
  MockHederaLedger,
  MockMirrorProvider,
} from './providers.js';

const message: AnchorMessage = {
  schemaVersion: '1.0',
  anchorEventId: '00000000-0000-4000-8000-000000000001',
  eventType: 'LOT_CREATED',
  organizationRef: `hmac-sha256:v1:${'a'.repeat(64)}`,
  entityType: 'LOT',
  entityRef: `hmac-sha256:v1:${'b'.repeat(64)}`,
  payloadHash: `sha256:${'c'.repeat(64)}`,
  previousEventHash: null,
  occurredAt: '2026-07-19T00:00:00.000Z',
};

const options = { topicId: '0.0.424242', maxMessageBytes: 1024, maxTransactionFeeUsd: 1 };

describe('mock Hedera providers', () => {
  it('submits deterministically and confirms through the mirror boundary', async () => {
    const ledger = new MockHederaLedger();
    const anchorProvider = new MockHederaAnchorProvider(ledger);
    const mirrorProvider = new MockMirrorProvider(ledger);

    const submission = await anchorProvider.submit(message, options);
    const confirmation = await mirrorProvider.findByTransactionId(submission.transactionId);

    expect(submission.network).toBe('LOCAL');
    expect(confirmation?.sequenceNumber).toBe('1');
    expect(confirmation?.message).toEqual(message);
  });

  it('increments sequence numbers and supports bounded incremental pages', async () => {
    const ledger = new MockHederaLedger();
    const provider = new MockHederaAnchorProvider(ledger);
    const mirror = new MockMirrorProvider(ledger);
    await provider.submit(message, options);
    await provider.submit(
      { ...message, anchorEventId: '00000000-0000-4000-8000-000000000002' },
      options,
    );

    const page = await mirror.listMessages({
      topicId: options.topicId,
      afterSequenceNumber: '1',
      limit: 1,
    });
    expect(page.messages.map(({ sequenceNumber }) => sequenceNumber)).toEqual(['2']);
  });

  it('models delayed confirmation without claiming verification', async () => {
    const ledger = new MockHederaLedger();
    const provider = new MockHederaAnchorProvider(ledger, { confirmationDelayLookups: 1 });
    const mirror = new MockMirrorProvider(ledger);
    const submission = await provider.submit(message, options);

    expect(await mirror.findByTransactionId(submission.transactionId)).toBeNull();
    expect(await mirror.findByTransactionId(submission.transactionId)).not.toBeNull();
  });

  it('stores uncertain submissions so reconciliation can discover them', async () => {
    const ledger = new MockHederaLedger();
    const provider = new MockHederaAnchorProvider(ledger, { failure: 'UNKNOWN_OUTCOME' });
    const mirror = new MockMirrorProvider(ledger);

    await expect(provider.submit(message, options)).rejects.toMatchObject({
      code: 'HEDERA_SUBMISSION_OUTCOME_UNKNOWN',
      category: 'UNKNOWN_OUTCOME',
    });
    expect(
      (await mirror.listMessages({ topicId: options.topicId, limit: 10 })).messages,
    ).toHaveLength(1);
  });

  it('enforces message-size limits before submission', async () => {
    const provider = new MockHederaAnchorProvider(new MockHederaLedger());
    await expect(
      provider.submit(message, { ...options, maxMessageBytes: 10 }),
    ).rejects.toBeInstanceOf(HederaProviderError);
  });

  it('detects a mismatching Mirror Node message', async () => {
    const ledger = new MockHederaLedger();
    const provider = new MockHederaAnchorProvider(ledger, {
      mutateMessage: (value) => ({ ...value, payloadHash: `sha256:${'d'.repeat(64)}` }),
    });
    const mirror = new MockMirrorProvider(ledger);
    const verifier = new MessageAnchorVerifier();
    const submission = await provider.submit(message, options);

    await expect(
      verifier.verify({
        expectedMessage: message,
        mirrorMessage: await mirror.findByTransactionId(submission.transactionId),
      }),
    ).resolves.toEqual({ matches: false, reason: 'MESSAGE_MISMATCH' });
  });
});
