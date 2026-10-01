// Submission error classification decides whether an anchor is retried, abandoned, or handed to
// reconciliation. Getting it wrong is not a cosmetic problem: PERMANENT abandons an anchor for good,
// and RETRYABLE on a genuinely ambiguous outcome risks a second message on the ledger for one event.
import { describe, expect, it } from 'vitest';

import { classifySubmissionError } from './sdk-provider.js';

/** Mimics the SDK's PrecheckStatusError, which carries the network status as an object. */
class PrecheckError extends Error {
  constructor(public readonly status: { toString: () => string }) {
    super('transaction failed precheck');
  }
}

const status = (value: string) => new PrecheckError({ toString: () => value });

describe('classifySubmissionError', () => {
  it('treats a fee rejection as retryable, because a precheck rejection is not charged', () => {
    // The fee schedule and the HBAR price both move, so the same anchor succeeds once the cap or
    // HEDERA_USD_PER_HBAR is corrected. Marking it permanent abandons a recoverable anchor.
    const error = classifySubmissionError(status('INSUFFICIENT_TX_FEE'));
    expect(error.code).toBe('HEDERA_TRANSACTION_FEE_LIMIT_EXCEEDED');
    expect(error.category).toBe('RETRYABLE');
  });

  it('reports an empty operator account under its own code', () => {
    const error = classifySubmissionError(status('INSUFFICIENT_PAYER_BALANCE'));
    expect(error.code).toBe('HEDERA_OPERATOR_BALANCE_INSUFFICIENT');
    expect(error.category).toBe('RETRYABLE');
  });

  it('treats a duplicate transaction as an unknown outcome rather than a retry', () => {
    // The network has already seen the transaction id, so an earlier attempt may have reached
    // consensus. Retrying would risk a second anchor for one event.
    const error = classifySubmissionError(status('DUPLICATE_TRANSACTION'));
    expect(error.category).toBe('UNKNOWN_OUTCOME');
  });

  it('classifies a busy network explicitly rather than by falling through', () => {
    const error = classifySubmissionError(status('BUSY'));
    expect(error.code).toBe('HEDERA_NETWORK_BUSY');
    expect(error.category).toBe('RETRYABLE');
  });

  it('keeps a bad topic permanent', () => {
    for (const value of ['INVALID_TOPIC_ID', 'TOPIC_DELETED']) {
      expect(classifySubmissionError(status(value)).category).toBe('PERMANENT');
    }
  });

  it('routes an ambiguous outcome to reconciliation under the code reconciliation looks for', () => {
    // hedera-reconciliation.worker.ts recovers an anchor only when lastErrorCode is exactly this
    // string. The coupling is not expressible in the type system, so it is pinned here.
    for (const error of [
      classifySubmissionError(new Error('gRPC deadline exceeded')),
      classifySubmissionError(new Error('request timeout')),
      classifySubmissionError(status('TRANSACTION_EXPIRED')),
    ]) {
      expect(error.code).toBe('HEDERA_SUBMISSION_OUTCOME_UNKNOWN');
      expect(error.category).toBe('UNKNOWN_OUTCOME');
    }
  });

  it('defaults to retryable so that an unrecognised failure stays visible', () => {
    const error = classifySubmissionError(new Error('something the SDK has never returned before'));
    expect(error.category).toBe('RETRYABLE');
  });

  it('does not classify from message text when the SDK reported a status', () => {
    // A transaction id, memo, or wrapped cause can contain any of these words. Trusting the message
    // over the reported status would let unrelated text abandon a recoverable anchor.
    class Misleading extends Error {
      readonly status = { toString: () => 'BUSY' };
      constructor() {
        super('0.0.1234@1700000000.INVALID_TOPIC_ID-TIMEOUT');
      }
    }
    const error = classifySubmissionError(new Misleading());
    expect(error.code).toBe('HEDERA_NETWORK_BUSY');
    expect(error.category).toBe('RETRYABLE');
  });
});
