import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { HederaProviderError, hashPayload } from '@clycites/hedera';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { WorkerEnvironment } from './environment.js';
import { HEDERA_CONFIRM_JOB, HEDERA_SUBMIT_JOB } from './hedera.constants.js';
import { HederaConfirmationWorker } from './hedera-confirmation.worker.js';
import { HederaProviderService } from './hedera-provider.service.js';
import { HederaSubmissionWorker } from './hedera-submission.worker.js';
import { OutboxDispatcherService } from './outbox-dispatcher.service.js';
import { WorkerDatabaseService } from './worker-database.service.js';

const organizationId = '00000000-0000-4000-8000-000000000201';
const testTopicId = `0.0.${Date.now()}`;

describe.sequential('Hedera workers', () => {
  const config = new ConfigService<WorkerEnvironment, true>({
    NODE_ENV: 'test',
    REDIS_HOST: 'localhost',
    REDIS_PORT: 6379,
    LOG_LEVEL: 'info',
    DATABASE_URL: process.env.DATABASE_URL!,
    HEDERA_PROVIDER: 'mock',
    HEDERA_NETWORK: 'local',
    HEDERA_TOPIC_ID: testTopicId,
    HEDERA_SUBMISSION_ENABLED: true,
    HEDERA_CONFIRMATION_ENABLED: true,
    HEDERA_MAX_TRANSACTION_FEE_USD: 1,
    HEDERA_CONFIRMATION_TIMEOUT_SECONDS: 120,
    HEDERA_CONFIRMATION_POLL_INTERVAL_SECONDS: 1,
    HEDERA_REFERENCE_SECRET: 'test-only-hedera-reference-secret-at-least-32-bytes',
    HEDERA_REFERENCE_SECRET_VERSION: 'v1',
  });
  const database = new WorkerDatabaseService(config);
  const providers = new HederaProviderService(config);
  const dispatcher = new OutboxDispatcherService(config, database);
  const submission = new HederaSubmissionWorker(config, database, providers);
  const confirmation = new HederaConfirmationWorker(config, database, providers);

  beforeAll(async () => database.onModuleInit());

  afterAll(async () => {
    await submission.onModuleDestroy();
    await confirmation.onModuleDestroy();
    await dispatcher.onModuleDestroy();
    providers.onModuleDestroy();
    await database.onModuleDestroy();
  });

  it('hands off, submits, confirms, and verifies one logical mock anchor', async () => {
    const fixture = await createAnchor();

    expect(await dispatcher.dispatch()).toBeGreaterThanOrEqual(1);
    await expect(
      submission.process({
        id: `submit-${fixture.anchorId}`,
        name: HEDERA_SUBMIT_JOB,
        data: { anchorId: fixture.anchorId, expectedAnchorEventId: fixture.eventId },
      }),
    ).resolves.toEqual({ status: 'SUBMITTED' });
    await expect(
      confirmation.process({
        id: `confirm-${fixture.anchorId}`,
        name: HEDERA_CONFIRM_JOB,
        data: { anchorId: fixture.anchorId, expectedAnchorEventId: fixture.eventId },
      }),
    ).resolves.toEqual({ status: 'CONFIRMED' });

    const anchor = await database.client.hederaAnchor.findUniqueOrThrow({
      where: { id: fixture.anchorId },
      include: { attempts: true, verifications: true },
    });
    expect(anchor).toMatchObject({
      provider: 'MOCK',
      network: 'LOCAL',
      status: 'CONFIRMED',
      topicId: testTopicId,
    });
    expect(anchor.topicSequenceNumber?.toString()).toBe('1');
    expect(anchor.attempts.map(({ status }) => status)).toEqual(['SUCCEEDED', 'SUCCEEDED']);
    expect(anchor.verifications[0]).toMatchObject({ status: 'VERIFIED', chainStatus: 'VALID' });
  });

  it('blocks submission when the stored expected hash does not match the canonical payload', async () => {
    const fixture = await createAnchor(`sha256:${'f'.repeat(64)}`);
    await dispatcher.dispatch();

    await expect(
      submission.process({
        id: `submit-${fixture.anchorId}`,
        name: HEDERA_SUBMIT_JOB,
        data: { anchorId: fixture.anchorId, expectedAnchorEventId: fixture.eventId },
      }),
    ).resolves.toEqual({ status: 'MISMATCH' });
    await expect(
      database.client.hederaAnchor.findUniqueOrThrow({ where: { id: fixture.anchorId } }),
    ).resolves.toMatchObject({ status: 'MISMATCH', submissionTransactionId: null });
  });

  it('holds an unknown submission outcome for reconciliation instead of blind retry', async () => {
    const fixture = await createAnchor();
    await dispatcher.dispatch();
    const unknownProviders = new HederaProviderService(config);
    Object.defineProperty(unknownProviders, 'anchor', {
      value: {
        submit: () =>
          Promise.reject(
            new HederaProviderError(
              'HEDERA_SUBMISSION_OUTCOME_UNKNOWN',
              'UNKNOWN_OUTCOME',
              'Submission outcome requires reconciliation',
            ),
          ),
        findSubmission: () => Promise.resolve({ found: false, confirmation: null }),
        close: () => undefined,
      },
    });
    const unknownSubmission = new HederaSubmissionWorker(config, database, unknownProviders);
    try {
      await expect(
        unknownSubmission.process({
          id: `submit-unknown-${fixture.anchorId}`,
          name: HEDERA_SUBMIT_JOB,
          data: { anchorId: fixture.anchorId, expectedAnchorEventId: fixture.eventId },
        }),
      ).resolves.toEqual({ status: 'PERMANENT_FAILURE' });
      await expect(
        database.client.hederaAnchor.findUniqueOrThrow({
          where: { id: fixture.anchorId },
          include: { attempts: true },
        }),
      ).resolves.toMatchObject({
        status: 'PERMANENT_FAILURE',
        lastErrorCode: 'HEDERA_SUBMISSION_OUTCOME_UNKNOWN',
        attempts: [expect.objectContaining({ status: 'UNKNOWN' })],
      });
    } finally {
      await unknownSubmission.onModuleDestroy();
      unknownProviders.onModuleDestroy();
    }
  });

  it('does not dispatch an outbox event before its retry schedule is due', async () => {
    const fixture = await createAnchor();
    const nextAttemptAt = new Date(Date.now() + 60_000);
    await database.client.outboxEvent.update({
      where: { id: fixture.eventId },
      data: { nextAttemptAt },
    });

    await dispatcher.dispatch();

    await expect(
      database.client.outboxEvent.findUniqueOrThrow({ where: { id: fixture.eventId } }),
    ).resolves.toMatchObject({ status: 'PENDING', attemptCount: 0, nextAttemptAt });
    await expect(
      database.client.hederaAnchor.findUniqueOrThrow({ where: { id: fixture.anchorId } }),
    ).resolves.toMatchObject({ status: 'PENDING' });
  });

  async function createAnchor(expectedHash?: string) {
    const eventId = randomUUID();
    const traceabilityEventId = randomUUID();
    const anchorId = randomUUID();
    const entityId = randomUUID();
    const canonicalPayload = {
      schemaVersion: '1.0',
      eventId,
      eventType: 'LOT_CREATED',
      organizationId,
      lotId: entityId,
    };
    const canonicalPayloadHash = expectedHash ?? hashPayload(canonicalPayload);
    await database.client.$transaction(async (transaction) => {
      await transaction.outboxEvent.create({
        data: {
          id: eventId,
          aggregateType: 'CooperativeLot',
          aggregateId: entityId,
          eventType: 'COOPERATIVE_LOT_CREATED',
          schemaVersion: '1.0',
          payload: { organizationId },
        },
      });
      await transaction.traceabilityEvent.create({
        data: {
          id: traceabilityEventId,
          organizationId,
          outboxEventId: eventId,
          entityType: 'LOT',
          entityId,
          eventType: 'LOT_CREATED',
          schemaVersion: '1.0',
          canonicalPayload,
          canonicalPayloadHash,
          chainPosition: 1,
          occurredAt: new Date(),
        },
      });
      await transaction.hederaAnchor.create({
        data: {
          id: anchorId,
          anchorEventId: eventId,
          traceabilityEventId,
          organizationId,
          entityType: 'LOT',
          entityId,
          eventType: 'LOT_CREATED',
          schemaVersion: '1.0',
          canonicalPayloadHash,
          privacyReferenceVersion: 'v1',
          provider: 'MOCK',
          network: 'LOCAL',
        },
      });
    });
    return { anchorId, eventId };
  }
});
