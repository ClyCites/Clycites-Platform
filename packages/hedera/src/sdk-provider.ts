import type { AnchorMessage, SubmissionResult } from '@clycites/contracts';
import { anchorMessageSchema } from '@clycites/contracts';
import {
  Client,
  Hbar,
  PrivateKey,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
} from '@hiero-ledger/sdk';

import { canonicalJson } from './index.js';
import type {
  HederaAnchorProvider,
  HederaMirrorProvider,
  SubmissionLookupResult,
  SubmissionQuery,
  SubmitOptions,
} from './providers.js';
import { HederaProviderError } from './providers.js';

const parseOperatorKey = (operatorKey: string): PrivateKey => {
  const trimmed = operatorKey.trim();
  const rawHex = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
  // ECDSA secp256k1 keys are 32-byte hex, conventionally written with a 0x prefix.
  if (trimmed.startsWith('0x') && /^[0-9a-fA-F]{64}$/.test(rawHex)) {
    return PrivateKey.fromStringECDSA(trimmed);
  }
  // DER-encoded keys (ED25519 or ECDSA) carry their own type prefix.
  if (/^30[0-9a-fA-F]+$/.test(rawHex)) {
    return PrivateKey.fromStringDer(rawHex);
  }
  // Bare 32-byte hex without a prefix defaults to ED25519 (Hedera portal default).
  if (/^[0-9a-fA-F]{64}$/.test(rawHex)) {
    return PrivateKey.fromStringED25519(rawHex);
  }
  return PrivateKey.fromStringDer(trimmed);
};

export interface SdkHederaAnchorProviderConfig {
  network: 'TESTNET' | 'PREVIEWNET' | 'MAINNET';
  operatorId: string;
  operatorKey: string;
  usdPerHbar: number;
  requestTimeoutMs: number;
}

export interface CreateHederaTopicOptions {
  network: 'TESTNET' | 'PREVIEWNET';
  operatorId: string;
  operatorKey: string;
  memo: string;
  maxTransactionFeeHbar: number;
  acknowledgeNetworkCost: boolean;
}

export async function createHederaTopic(options: CreateHederaTopicOptions): Promise<string> {
  if (!options.acknowledgeNetworkCost) {
    throw new HederaProviderError(
      'HEDERA_NOT_CONFIGURED',
      'CONFIGURATION',
      'Test network topic creation requires explicit cost acknowledgement',
    );
  }
  if (options.maxTransactionFeeHbar <= 0 || options.maxTransactionFeeHbar > 10) {
    throw new HederaProviderError(
      'HEDERA_TRANSACTION_FEE_LIMIT_EXCEEDED',
      'CONFIGURATION',
      'Topic creation fee cap must be greater than zero and at most 10 HBAR',
    );
  }
  const client = options.network === 'TESTNET' ? Client.forTestnet() : Client.forPreviewnet();
  try {
    client.setOperator(options.operatorId, parseOperatorKey(options.operatorKey));
    // Submit once (idempotency) but allow the receipt query to poll through
    // transient UNKNOWN/RECEIPT_NOT_FOUND states while consensus settles.
    client.setMaxAttempts(5);
    const response = await new TopicCreateTransaction()
      .setTopicMemo(options.memo)
      .setMaxTransactionFee(new Hbar(options.maxTransactionFeeHbar))
      .setMaxAttempts(1)
      .execute(client);
    const receipt = await response.getReceipt(client);
    if (!receipt.topicId) {
      throw new HederaProviderError(
        'HEDERA_TOPIC_INVALID',
        'PERMANENT',
        'Hedera did not return a topic ID',
      );
    }
    return receipt.topicId.toString();
  } catch (error) {
    if (error instanceof HederaProviderError) throw error;
    throw new HederaProviderError(
      'HEDERA_SUBMISSION_RETRYABLE',
      'RETRYABLE',
      'Hedera topic creation failed',
      error,
    );
  } finally {
    client.close();
  }
}

export class SdkHederaAnchorProvider implements HederaAnchorProvider {
  private readonly client: Client;

  constructor(
    private readonly config: SdkHederaAnchorProviderConfig,
    private readonly mirrorProvider: HederaMirrorProvider,
  ) {
    try {
      this.client =
        config.network === 'TESTNET'
          ? Client.forTestnet()
          : config.network === 'PREVIEWNET'
            ? Client.forPreviewnet()
            : Client.forMainnet();
      this.client.setOperator(config.operatorId, parseOperatorKey(config.operatorKey));
      this.client.setMaxAttempts(1);
    } catch (error) {
      throw new HederaProviderError(
        'HEDERA_CREDENTIALS_INVALID',
        'CONFIGURATION',
        'Hedera operator configuration is invalid',
        error,
      );
    }
  }

  async submit(message: AnchorMessage, options: SubmitOptions): Promise<SubmissionResult> {
    const validatedMessage = await anchorMessageSchema.parseAsync(message);
    const serializedMessage = canonicalJson(validatedMessage);
    if (Buffer.byteLength(serializedMessage, 'utf8') > options.maxMessageBytes) {
      throw new HederaProviderError(
        'HEDERA_MESSAGE_TOO_LARGE',
        'PERMANENT',
        `Anchor message exceeds ${options.maxMessageBytes} bytes`,
      );
    }
    const hbarLimit = options.maxTransactionFeeUsd / this.config.usdPerHbar;
    try {
      const response = await new TopicMessageSubmitTransaction()
        .setTopicId(options.topicId)
        .setMessage(serializedMessage)
        .setMaxChunks(1)
        .setMaxAttempts(1)
        .setMaxTransactionFee(new Hbar(hbarLimit))
        .execute(this.client, this.config.requestTimeoutMs);
      return {
        provider: 'SDK',
        network: this.config.network,
        topicId: options.topicId,
        transactionId: response.transactionId.toString(),
        transactionHash: Buffer.from(response.transactionHash).toString('hex'),
        submittedAt: new Date().toISOString(),
      };
    } catch (error) {
      throw this.mapSubmissionError(error);
    }
  }

  async findSubmission(query: SubmissionQuery): Promise<SubmissionLookupResult> {
    const confirmation = await this.mirrorProvider.findByTransactionId(query.transactionId);
    return { found: confirmation !== null && confirmation.topicId === query.topicId, confirmation };
  }

  close(): void {
    this.client.close();
  }

  /**
   * Classifies a submission failure. The category decides whether the anchor is retried, abandoned,
   * or left for reconciliation, so the safe default for anything unrecognised is RETRYABLE: an
   * anchor that keeps retrying stays visibly unfinished, whereas one wrongly marked permanent is
   * silently abandoned.
   *
   * The Hedera SDK reports the network status on `status` for precheck and receipt errors. That is
   * preferred over the message text, which is free-form and can contain a transaction id or memo
   * that happens to include one of these words.
   */
  private mapSubmissionError(error: unknown): HederaProviderError {
    return classifySubmissionError(error);
  }
}

export function classifySubmissionError(error: unknown): HederaProviderError {
  const status =
    typeof (error as { status?: { toString?: () => string } } | undefined)?.status?.toString ===
    'function'
      ? String((error as { status: { toString: () => string } }).status).toUpperCase()
      : '';
  const message = error instanceof Error ? error.message.toUpperCase() : '';
  const indicates = (...codes: string[]) =>
    codes.some((code) => (status ? status === code : message.includes(code)));

  if (indicates('INVALID_TOPIC_ID', 'TOPIC_DELETED', 'AUTHORIZATION_FAILED')) {
    return new HederaProviderError(
      'HEDERA_TOPIC_INVALID',
      'PERMANENT',
      'Configured Hedera topic is invalid',
      error,
    );
  }
  if (indicates('DUPLICATE_TRANSACTION')) {
    // The network has already seen this transaction id, so an earlier attempt may well have
    // reached consensus. Reconciliation decides, rather than a retry that could double-anchor.
    return new HederaProviderError(
      'HEDERA_SUBMISSION_OUTCOME_UNKNOWN',
      'UNKNOWN_OUTCOME',
      'Hedera submission outcome is unknown and requires reconciliation',
      error,
    );
  }
  if (indicates('INSUFFICIENT_PAYER_BALANCE', 'INSUFFICIENT_ACCOUNT_BALANCE')) {
    // Retryable rather than permanent: topping up the operator account resolves it, and the
    // precheck rejection is not charged.
    return new HederaProviderError(
      'HEDERA_OPERATOR_BALANCE_INSUFFICIENT',
      'RETRYABLE',
      'The Hedera operator account has insufficient balance',
      error,
    );
  }
  if (indicates('INSUFFICIENT_TX_FEE', 'MAX_TRANSACTION_FEE')) {
    // A precheck fee rejection is not charged and reflects the fee schedule and HBAR price at that
    // moment, both of which move. Retrying under a corrected HEDERA_USD_PER_HBAR or fee cap
    // succeeds, so this must not permanently abandon the anchor.
    return new HederaProviderError(
      'HEDERA_TRANSACTION_FEE_LIMIT_EXCEEDED',
      'RETRYABLE',
      'Hedera transaction fee exceeded the configured limit',
      error,
    );
  }
  if (indicates('BUSY', 'PLATFORM_NOT_ACTIVE', 'PLATFORM_TRANSACTION_NOT_CREATED')) {
    return new HederaProviderError(
      'HEDERA_NETWORK_BUSY',
      'RETRYABLE',
      'The Hedera network rejected the submission as busy',
      error,
    );
  }
  if (
    indicates('TRANSACTION_EXPIRED') ||
    message.includes('TIMEOUT') ||
    message.includes('DEADLINE')
  ) {
    return new HederaProviderError(
      'HEDERA_SUBMISSION_OUTCOME_UNKNOWN',
      'UNKNOWN_OUTCOME',
      'Hedera submission outcome is unknown and requires reconciliation',
      error,
    );
  }
  return new HederaProviderError(
    'HEDERA_SUBMISSION_RETRYABLE',
    'RETRYABLE',
    'Hedera submission failed',
    error,
  );
}
