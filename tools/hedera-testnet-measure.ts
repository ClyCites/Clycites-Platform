/**
 * Measures what anchoring actually costs and how long it actually takes on the Hedera testnet.
 *
 * This spends real testnet HBAR. It is deliberately not wired into any test script or CI job; run
 * it by hand when the numbers need refreshing.
 *
 *   pnpm hedera:measure [sampleCount]
 *
 * Credentials come from the repository-root .env plus apps/worker/.env, which is where the operator
 * key lives — the API refuses to boot if it can see that key.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { buildAnchorMessage, RestMirrorProvider, SdkHederaAnchorProvider } from '@clycites/hedera';

function findRepositoryRoot(): string {
  let directory = process.cwd();
  while (!existsSync(resolve(directory, 'pnpm-workspace.yaml'))) {
    const parent = dirname(directory);
    if (parent === directory) throw new Error('Could not locate the repository root');
    directory = parent;
  }
  return directory;
}

const repositoryRoot = findRepositoryRoot();

function loadEnvFile(relativePath: string): Record<string, string> {
  const contents = readFileSync(resolve(repositoryRoot, relativePath), 'utf8');
  const values: Record<string, string> = {};
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    values[trimmed.slice(0, separator)] = trimmed.slice(separator + 1).replace(/^["']|["']$/g, '');
  }
  return values;
}

const env = { ...loadEnvFile('.env'), ...loadEnvFile('apps/worker/.env') };

function required(name: string): string {
  const value = env[name];
  if (value === undefined || value.length === 0) throw new Error(`${name} is not configured`);
  return value;
}

const network = required('HEDERA_NETWORK').toUpperCase();
if (network !== 'TESTNET') {
  throw new Error(`Refusing to measure against ${network}. This script is testnet-only.`);
}

const topicId = required('HEDERA_TOPIC_ID');
const mirrorBaseUrl = required('HEDERA_MIRROR_NODE_URL');
const usdPerHbar = Number(required('HEDERA_USD_PER_HBAR'));
const sampleCount = Number(process.argv[2] ?? '10');

const mirror = new RestMirrorProvider({
  baseUrl: mirrorBaseUrl,
  network: 'TESTNET',
  timeoutMs: 15_000,
  maxResponseBytes: 1_048_576,
});

const provider = new SdkHederaAnchorProvider(
  {
    network: 'TESTNET',
    operatorId: required('HEDERA_OPERATOR_ID'),
    operatorKey: required('HEDERA_OPERATOR_KEY'),
    usdPerHbar,
    requestTimeoutMs: 30_000,
  },
  mirror,
);

const referenceKey = {
  secret: required('HEDERA_REFERENCE_SECRET'),
  version: required('HEDERA_REFERENCE_SECRET_VERSION'),
};

interface Sample {
  bytes: number;
  submitMs: number;
  confirmMs: number;
  sequenceNumber: string;
  matched: boolean;
}

const percentile = (values: number[], fraction: number): number => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]!;
};

async function measureOne(index: number): Promise<Sample> {
  // A correction carries the full supersession block, so it is the largest message the system
  // produces. Measuring the worst case is the only measurement worth having for a size budget.
  const message = buildAnchorMessage(
    {
      schemaVersion: '1.0',
      anchorEventId: crypto.randomUUID(),
      eventType: 'TRACEABILITY_RECORD_SUPERSEDED',
      organizationId: crypto.randomUUID(),
      entityType: 'LOT',
      entityId: crypto.randomUUID(),
      canonicalPayloadHash: `sha256:${'0'.repeat(64)}`,
      previousEventHash: `sha256:${'2'.repeat(64)}`,
      occurredAt: new Date(),
      supersedesAnchor: {
        id: crypto.randomUUID(),
        canonicalPayloadHash: `sha256:${'1'.repeat(64)}`,
        submissionTransactionId: `0.0.7998683@1770000000.${index}`,
      },
    },
    referenceKey,
  );
  const bytes = Buffer.byteLength(JSON.stringify(message), 'utf8');

  const submitStartedAt = Date.now();
  const result = await provider.submit(message, {
    topicId,
    maxMessageBytes: 1024,
    maxTransactionFeeUsd: Number(required('HEDERA_MAX_TRANSACTION_FEE_USD')),
  });
  const submitMs = Date.now() - submitStartedAt;

  // Mirror node lag is measured from submission, because that is the interval a user waits before
  // an anchor can be shown as confirmed.
  const deadline = Date.now() + 60_000;
  let confirmation = await mirror.findByTransactionId(result.transactionId);
  while (confirmation === null && Date.now() < deadline) {
    await new Promise((done) => setTimeout(done, 1_000));
    confirmation = await mirror.findByTransactionId(result.transactionId);
  }
  if (confirmation === null) throw new Error(`Sample ${index} never appeared on the mirror node`);
  const confirmMs = Date.now() - submitStartedAt;

  return {
    bytes,
    submitMs,
    confirmMs,
    sequenceNumber: confirmation.sequenceNumber,
    matched: JSON.stringify(confirmation.message) === JSON.stringify(message),
  };
}

async function main(): Promise<void> {
  const samples: Sample[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = await measureOne(index);
    samples.push(sample);
    process.stdout.write(
      `sample ${index + 1}/${sampleCount}: ${sample.bytes}B submit=${sample.submitMs}ms ` +
        `confirm=${sample.confirmMs}ms seq=${sample.sequenceNumber} match=${sample.matched}\n`,
    );
  }

  const submitTimes = samples.map((sample) => sample.submitMs);
  const confirmTimes = samples.map((sample) => sample.confirmMs);
  process.stdout.write(
    `\n${JSON.stringify(
      {
        network: 'TESTNET',
        topicId,
        samples: samples.length,
        allMessagesMatched: samples.every((sample) => sample.matched),
        messageBytes: Math.max(...samples.map((sample) => sample.bytes)),
        submitMs: { p50: percentile(submitTimes, 0.5), p95: percentile(submitTimes, 0.95) },
        confirmMs: { p50: percentile(confirmTimes, 0.5), p95: percentile(confirmTimes, 0.95) },
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
