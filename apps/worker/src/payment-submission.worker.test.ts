import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import type { WorkerEnvironment } from './environment.js';
import { PAYMENT_SUBMIT_JOB } from './payment.constants.js';
import { PaymentSubmissionWorker } from './payment-submission.worker.js';

const paymentInstructionId = '00000000-0000-4000-8000-000000009001';
const farmerSettlementId = '00000000-0000-4000-8000-000000009002';
const organizationId = '00000000-0000-4000-8000-000000000201';

const config = new ConfigService<WorkerEnvironment, true>({
  REDIS_HOST: 'localhost',
  REDIS_PORT: 6379,
} as WorkerEnvironment);

describe('PaymentSubmissionWorker', () => {
  it.each([
    ['manual', 'PENDING'],
    ['mock', 'SUBMITTED'],
  ] as const)(
    'submits a claimed %s instruction without marking it paid',
    async (provider, attemptStatus) => {
      const createAttempt = vi
        .fn<
          (input: {
            data: { attemptNumber: number; provider: string; status: string };
          }) => Promise<{ id: string }>
        >()
        .mockResolvedValue({ id: 'attempt-id' });
      const updateInstruction = vi
        .fn<(input: { where: { id: string }; data: { status: string } }) => Promise<object>>()
        .mockResolvedValue({});
      const transaction = {
        paymentInstruction: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            id: paymentInstructionId,
            organizationId,
            farmerSettlementId,
            provider,
            idempotencyKey: 'payment-idempotency-key',
            attempts: [{ attemptNumber: 2 }],
          }),
          update: updateInstruction,
        },
        paymentAttempt: { create: createAttempt },
        farmerSettlement: { update: vi.fn().mockResolvedValue({}) },
        auditEvent: { create: vi.fn().mockResolvedValue({}) },
      };
      const database = {
        client: {
          $transaction: vi.fn((operation: (client: typeof transaction) => Promise<unknown>) =>
            operation(transaction),
          ),
        },
      };
      const worker = new PaymentSubmissionWorker(config, database as never);

      await expect(
        worker.process({
          id: `payment-submit-${paymentInstructionId}`,
          name: PAYMENT_SUBMIT_JOB,
          data: { paymentInstructionId, expectedVersion: 4 },
        }),
      ).resolves.toEqual({ status: 'SUBMITTED' });

      expect(createAttempt.mock.calls[0]?.[0].data).toMatchObject({
        attemptNumber: 3,
        provider,
        status: attemptStatus,
      });
      expect(updateInstruction.mock.calls[0]?.[0]).toMatchObject({
        where: { id: paymentInstructionId },
        data: { status: 'SUBMITTED' },
      });
      expect(transaction.farmerSettlement.update).toHaveBeenCalledWith({
        where: { id: farmerSettlementId },
        data: { paymentStatus: 'PROCESSING' },
      });
    },
  );

  it('does nothing when the queued version cannot be claimed', async () => {
    const transaction = {
      paymentInstruction: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
    const database = {
      client: {
        $transaction: vi.fn((operation: (client: typeof transaction) => Promise<unknown>) =>
          operation(transaction),
        ),
      },
    };
    const worker = new PaymentSubmissionWorker(config, database as never);

    await expect(
      worker.process({
        id: 'stale-job',
        name: PAYMENT_SUBMIT_JOB,
        data: { paymentInstructionId, expectedVersion: 3 },
      }),
    ).resolves.toEqual({ status: 'NOT_CLAIMED' });
  });

  it('rejects jobs containing payment details', async () => {
    const database = { client: { $transaction: vi.fn() } };
    const worker = new PaymentSubmissionWorker(config, database as never);

    await expect(
      worker.process({
        id: 'unsafe-job',
        name: PAYMENT_SUBMIT_JOB,
        data: {
          paymentInstructionId,
          expectedVersion: 1,
          accountIdentifier: '256700123456',
        },
      }),
    ).rejects.toThrow();
    expect(database.client.$transaction).not.toHaveBeenCalled();
  });
});
