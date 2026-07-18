import type { AnchorMessage, MirrorConfirmation, SubmissionResult } from '@clycites/contracts';
import { anchorMessageSchema, mirrorConfirmationSchema } from '@clycites/contracts';

import { canonicalJson } from './index.js';

export type HederaErrorCategory =
  | 'CONFIGURATION'
  | 'RETRYABLE'
  | 'PERMANENT'
  | 'UNKNOWN_OUTCOME'
  | 'MISMATCH';

export class HederaProviderError extends Error {
  constructor(
    readonly code: string,
    readonly category: HederaErrorCategory,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'HederaProviderError';
  }
}

export interface SubmitOptions {
  topicId: string;
  maxMessageBytes: number;
  maxTransactionFeeUsd: number;
}

export interface SubmissionQuery {
  topicId: string;
  transactionId: string;
}

export interface SubmissionLookupResult {
  found: boolean;
  confirmation: MirrorConfirmation | null;
}

export interface MirrorMessageQuery {
  topicId: string;
  afterSequenceNumber?: string;
  limit: number;
}

export interface MirrorMessagePage {
  messages: MirrorConfirmation[];
  nextSequenceNumber: string | null;
}

export interface HederaAnchorProvider {
  submit(message: AnchorMessage, options: SubmitOptions): Promise<SubmissionResult>;
  findSubmission(query: SubmissionQuery): Promise<SubmissionLookupResult>;
}

export interface HederaMirrorProvider {
  getMessage(topicId: string, sequenceNumber: string): Promise<MirrorConfirmation | null>;
  findByTransactionId(transactionId: string): Promise<MirrorConfirmation | null>;
  listMessages(query: MirrorMessageQuery): Promise<MirrorMessagePage>;
}

export interface VerificationInput {
  expectedMessage: AnchorMessage;
  mirrorMessage: MirrorConfirmation | null;
}

export interface ProviderVerificationResult {
  matches: boolean;
  reason: 'MATCH' | 'MISSING' | 'MESSAGE_MISMATCH';
}

export interface AnchorVerifier {
  verify(input: VerificationInput): Promise<ProviderVerificationResult>;
}

interface MockStoredMessage {
  confirmation: MirrorConfirmation;
  availableAfterLookup: number;
  lookupCount: number;
}

export interface MockHederaBehavior {
  failure?: 'RETRYABLE' | 'PERMANENT' | 'UNKNOWN_OUTCOME' | 'TIMEOUT';
  confirmationDelayLookups?: number;
  mirrorUnavailable?: boolean;
  mutateMessage?: (message: AnchorMessage) => AnchorMessage;
}

export class MockHederaLedger {
  private sequenceNumber = 0n;
  private readonly messages = new Map<string, MockStoredMessage>();

  constructor(readonly topicId = '0.0.424242') {}

  store(message: AnchorMessage, behavior: MockHederaBehavior = {}): MirrorConfirmation {
    this.sequenceNumber += 1n;
    const sequenceNumber = this.sequenceNumber.toString();
    const transactionId = `mock-tx-${message.anchorEventId}-${sequenceNumber}`;
    const confirmation = mirrorConfirmationSchema.parse({
      provider: 'MOCK',
      network: 'LOCAL',
      topicId: this.topicId,
      sequenceNumber,
      consensusTimestamp: `1700000000.${sequenceNumber.padStart(9, '0')}`,
      transactionId,
      message: behavior.mutateMessage?.(message) ?? message,
      runningHash: `mock-running-hash-${sequenceNumber}`,
      runningHashVersion: '3',
    });
    this.messages.set(sequenceNumber, {
      confirmation,
      availableAfterLookup: behavior.confirmationDelayLookups ?? 0,
      lookupCount: 0,
    });
    return confirmation;
  }

  bySequence(sequenceNumber: string): MirrorConfirmation | null {
    const stored = this.messages.get(sequenceNumber);
    if (!stored) return null;
    stored.lookupCount += 1;
    return stored.lookupCount > stored.availableAfterLookup ? stored.confirmation : null;
  }

  byTransaction(transactionId: string): MirrorConfirmation | null {
    const stored = [...this.messages.values()].find(
      ({ confirmation }) => confirmation.transactionId === transactionId,
    );
    if (!stored) return null;
    stored.lookupCount += 1;
    return stored.lookupCount > stored.availableAfterLookup ? stored.confirmation : null;
  }

  after(sequenceNumber: string | undefined, limit: number): MirrorConfirmation[] {
    const after = BigInt(sequenceNumber ?? '0');
    return [...this.messages.entries()]
      .filter(([sequence]) => BigInt(sequence) > after)
      .sort(([left], [right]) => (BigInt(left) < BigInt(right) ? -1 : 1))
      .slice(0, limit)
      .map(([, stored]) => stored.confirmation);
  }
}

export class MockHederaAnchorProvider implements HederaAnchorProvider {
  constructor(
    private readonly ledger: MockHederaLedger,
    private readonly behavior: MockHederaBehavior = {},
  ) {}

  async submit(message: AnchorMessage, options: SubmitOptions): Promise<SubmissionResult> {
    const validatedMessage = await anchorMessageSchema.parseAsync(message);
    const messageBytes = Buffer.byteLength(canonicalJson(validatedMessage), 'utf8');
    if (messageBytes > options.maxMessageBytes) {
      throw new HederaProviderError(
        'HEDERA_MESSAGE_TOO_LARGE',
        'PERMANENT',
        `Anchor message exceeds ${options.maxMessageBytes} bytes`,
      );
    }
    if (options.topicId !== this.ledger.topicId) {
      throw new HederaProviderError('HEDERA_TOPIC_INVALID', 'CONFIGURATION', 'Mock topic mismatch');
    }
    if (this.behavior.failure === 'RETRYABLE') {
      throw new HederaProviderError(
        'HEDERA_SUBMISSION_RETRYABLE',
        'RETRYABLE',
        'Mock retryable submission failure',
      );
    }
    if (this.behavior.failure === 'PERMANENT') {
      throw new HederaProviderError(
        'HEDERA_SUBMISSION_PERMANENT_FAILURE',
        'PERMANENT',
        'Mock permanent submission failure',
      );
    }
    if (this.behavior.failure === 'TIMEOUT') {
      throw new HederaProviderError(
        'HEDERA_CONFIRMATION_TIMEOUT',
        'UNKNOWN_OUTCOME',
        'Mock submission timed out',
      );
    }

    const confirmation = this.ledger.store(validatedMessage, this.behavior);
    if (this.behavior.failure === 'UNKNOWN_OUTCOME') {
      throw new HederaProviderError(
        'HEDERA_SUBMISSION_OUTCOME_UNKNOWN',
        'UNKNOWN_OUTCOME',
        'Mock submission outcome is unknown',
      );
    }
    return {
      provider: 'MOCK',
      network: 'LOCAL',
      topicId: confirmation.topicId,
      transactionId: confirmation.transactionId!,
      transactionHash: `mock-transaction-hash-${confirmation.sequenceNumber}`,
      submittedAt: new Date(1_700_000_000_000 + Number(confirmation.sequenceNumber)).toISOString(),
    };
  }

  findSubmission(query: SubmissionQuery): Promise<SubmissionLookupResult> {
    const confirmation = this.ledger.byTransaction(query.transactionId);
    return Promise.resolve({ found: confirmation !== null, confirmation });
  }
}

export class MockMirrorProvider implements HederaMirrorProvider {
  constructor(
    private readonly ledger: MockHederaLedger,
    private readonly behavior: MockHederaBehavior = {},
  ) {}

  private assertAvailable(): void {
    if (this.behavior.mirrorUnavailable) {
      throw new HederaProviderError(
        'HEDERA_MIRROR_NODE_UNAVAILABLE',
        'RETRYABLE',
        'Mock Mirror Node is unavailable',
      );
    }
  }

  getMessage(topicId: string, sequenceNumber: string): Promise<MirrorConfirmation | null> {
    this.assertAvailable();
    if (topicId !== this.ledger.topicId) return Promise.resolve(null);
    return Promise.resolve(this.ledger.bySequence(sequenceNumber));
  }

  findByTransactionId(transactionId: string): Promise<MirrorConfirmation | null> {
    this.assertAvailable();
    return Promise.resolve(this.ledger.byTransaction(transactionId));
  }

  listMessages(query: MirrorMessageQuery): Promise<MirrorMessagePage> {
    this.assertAvailable();
    if (query.topicId !== this.ledger.topicId) {
      return Promise.resolve({ messages: [], nextSequenceNumber: null });
    }
    const messages = this.ledger.after(query.afterSequenceNumber, query.limit);
    return Promise.resolve({
      messages,
      nextSequenceNumber: messages.at(-1)?.sequenceNumber ?? null,
    });
  }
}

export class MessageAnchorVerifier implements AnchorVerifier {
  verify(input: VerificationInput): Promise<ProviderVerificationResult> {
    if (!input.mirrorMessage) return Promise.resolve({ matches: false, reason: 'MISSING' });
    return Promise.resolve(
      canonicalJson(input.expectedMessage) === canonicalJson(input.mirrorMessage.message)
        ? { matches: true, reason: 'MATCH' }
        : { matches: false, reason: 'MESSAGE_MISMATCH' },
    );
  }
}

interface MirrorNodeMessageResponse {
  consensus_timestamp: string;
  message: string;
  running_hash?: string;
  running_hash_version?: number;
  sequence_number: number | string;
  topic_id: string;
}

interface MirrorNodePageResponse {
  messages: MirrorNodeMessageResponse[];
  links?: { next?: string | null };
}

export interface RestMirrorProviderConfig {
  baseUrl: string;
  network: 'TESTNET' | 'PREVIEWNET' | 'MAINNET';
  timeoutMs: number;
  maxResponseBytes: number;
  fetchImplementation?: typeof fetch;
}

export class RestMirrorProvider implements HederaMirrorProvider {
  private readonly baseUrl: URL;
  private readonly fetchImplementation: typeof fetch;

  constructor(private readonly config: RestMirrorProviderConfig) {
    this.baseUrl = new URL(config.baseUrl);
    if (this.baseUrl.protocol !== 'https:') {
      throw new HederaProviderError(
        'HEDERA_NOT_CONFIGURED',
        'CONFIGURATION',
        'Mirror Node URL must use HTTPS',
      );
    }
    this.fetchImplementation = config.fetchImplementation ?? fetch;
  }

  async getMessage(topicId: string, sequenceNumber: string): Promise<MirrorConfirmation | null> {
    const page = await this.request(
      `/api/v1/topics/${encodeURIComponent(topicId)}/messages/${encodeURIComponent(sequenceNumber)}`,
    );
    const rawMessage = (page as { messages?: MirrorNodeMessageResponse[] }).messages?.[0] ?? page;
    return this.decode(rawMessage as MirrorNodeMessageResponse);
  }

  async findByTransactionId(transactionId: string): Promise<MirrorConfirmation | null> {
    const page = (await this.request(
      `/api/v1/topics/messages?transaction.id=${encodeURIComponent(transactionId)}&limit=1`,
    )) as MirrorNodePageResponse;
    const message = page.messages[0];
    return message ? this.decode(message, transactionId) : null;
  }

  async listMessages(query: MirrorMessageQuery): Promise<MirrorMessagePage> {
    const after = query.afterSequenceNumber
      ? `&sequencenumber=gt:${encodeURIComponent(query.afterSequenceNumber)}`
      : '';
    const page = (await this.request(
      `/api/v1/topics/${encodeURIComponent(query.topicId)}/messages?limit=${query.limit}&order=asc${after}`,
    )) as MirrorNodePageResponse;
    const messages = page.messages.map((message) => this.decode(message));
    return { messages, nextSequenceNumber: messages.at(-1)?.sequenceNumber ?? null };
  }

  private decode(
    raw: MirrorNodeMessageResponse,
    transactionId: string | null = null,
  ): MirrorConfirmation {
    try {
      const decoded = Buffer.from(raw.message, 'base64').toString('utf8');
      return mirrorConfirmationSchema.parse({
        provider: 'SDK',
        network: this.config.network,
        topicId: raw.topic_id,
        sequenceNumber: String(raw.sequence_number),
        consensusTimestamp: raw.consensus_timestamp,
        transactionId,
        message: anchorMessageSchema.parse(JSON.parse(decoded)),
        runningHash: raw.running_hash ?? null,
        runningHashVersion:
          raw.running_hash_version === undefined ? null : String(raw.running_hash_version),
      });
    } catch (error) {
      throw new HederaProviderError(
        'HEDERA_MESSAGE_SCHEMA_INVALID',
        'PERMANENT',
        'Mirror Node returned an invalid anchor message',
        error,
      );
    }
  }

  private async request(path: string): Promise<unknown> {
    const url = new URL(path, this.baseUrl);
    try {
      const response = await this.fetchImplementation(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
      if (response.status === 404) return { messages: [] };
      if (!response.ok) throw new Error(`Mirror Node returned HTTP ${response.status}`);
      const body = await response.text();
      if (Buffer.byteLength(body, 'utf8') > this.config.maxResponseBytes) {
        throw new Error('Mirror Node response exceeded configured size limit');
      }
      return JSON.parse(body) as unknown;
    } catch (error) {
      if (error instanceof HederaProviderError) throw error;
      throw new HederaProviderError(
        'HEDERA_MIRROR_NODE_UNAVAILABLE',
        'RETRYABLE',
        'Mirror Node request failed',
        error,
      );
    }
  }
}
