import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import { NotificationDeliveryWorker } from './notification-delivery.worker.js';
import { NOTIFICATION_DELIVER_JOB } from './notification.constants.js';
import { Prisma } from '@clycites/database';

const deliveryId = '00000000-0000-4000-8000-000000000001';

describe('NotificationDeliveryWorker', () => {
  it('delivers identifier-only mock jobs without placing recipient data in audit metadata', async () => {
    const updateMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    const findUniqueOrThrow = vi.fn().mockResolvedValue({
      id: deliveryId,
      provider: 'mock',
      templateCode: 'PASSWORD_RESET',
      templateVersion: 1,
      parameters: { token: 'secret-token', expiresAt: new Date().toISOString() },
      recipientReference: '00000000-0000-4000-8000-000000000002',
      attemptCount: 1,
      organizationId: null,
    });
    const update = vi.fn().mockReturnValue({ operation: 'update' });
    const auditCreate = vi.fn().mockReturnValue({ operation: 'audit' });
    const transaction = vi.fn().mockResolvedValue([]);
    const database = {
      client: {
        notificationDelivery: { updateMany, findUniqueOrThrow, update },
        user: { findUnique: vi.fn().mockResolvedValue({ email: 'farmer@example.com' }) },
        auditEvent: { create: auditCreate },
        $transaction: transaction,
      },
    };
    const worker = new NotificationDeliveryWorker(
      new ConfigService({ REDIS_HOST: 'localhost', REDIS_PORT: 6379 }),
      database as never,
      { submit: vi.fn().mockResolvedValue({ providerReference: 'mock-ref', provider: 'mock' }) },
    );

    await expect(
      worker.process({
        id: 'job-1',
        name: NOTIFICATION_DELIVER_JOB,
        data: { notificationDeliveryId: deliveryId },
      }),
    ).resolves.toEqual({ status: 'DELIVERED' });

    const updateInput = updateMany.mock.calls[1]?.[0] as { where: { id: string } };
    expect(updateInput.where.id).toBe(deliveryId);
    const auditInput = auditCreate.mock.calls[0]?.[0] as {
      data: { metadata: { provider: string; templateCode: string } };
    };
    expect(auditInput.data.metadata).toEqual({
      provider: 'mock',
      templateCode: 'PASSWORD_RESET',
    });
    const deliveredUpdate = update.mock.calls[0]?.[0] as {
      data: { parameters?: typeof Prisma.JsonNull; status: string };
    };
    expect(deliveredUpdate.data).toMatchObject({
      status: 'DELIVERED',
      parameters: Prisma.JsonNull,
    });
    expect(JSON.stringify(auditCreate.mock.calls)).not.toContain('phone');
    expect(transaction).toHaveBeenCalledOnce();
  });

  it('does not resubmit a delivery that another worker claimed', async () => {
    const database = {
      client: {
        notificationDelivery: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      },
    };
    const provider = { submit: vi.fn() };
    const worker = new NotificationDeliveryWorker(
      new ConfigService({ REDIS_HOST: 'localhost', REDIS_PORT: 6379 }),
      database as never,
      provider,
    );

    await expect(
      worker.process({
        id: 'job-2',
        name: NOTIFICATION_DELIVER_JOB,
        data: { notificationDeliveryId: deliveryId },
      }),
    ).resolves.toEqual({ status: 'NOT_CLAIMED' });
    expect(provider.submit).not.toHaveBeenCalled();
  });

  it('suppresses SMS without invoking a provider and scrubs parameters', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const provider = { submit: vi.fn() };
    const worker = new NotificationDeliveryWorker(
      new ConfigService({ REDIS_HOST: 'localhost', REDIS_PORT: 6379 }),
      { client: { notificationDelivery: { updateMany } } } as never,
      provider,
    );

    await expect(
      worker.process({
        id: 'job-sms',
        name: NOTIFICATION_DELIVER_JOB,
        data: { notificationDeliveryId: deliveryId },
      }),
    ).resolves.toEqual({ status: 'SUPPRESSED' });
    expect(updateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { channel: 'SMS' },
      data: { status: 'SUPPRESSED', parameters: Prisma.JsonNull },
    });
    expect(provider.submit).not.toHaveBeenCalled();
  });

  it.each([
    { attemptCount: 1, status: 'PENDING', scrubbed: false },
    { attemptCount: 5, status: 'FAILED', scrubbed: true },
  ])('records a provider failure at attempt $attemptCount', async ({ attemptCount, status, scrubbed }) => {
    const updateMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    const update = vi.fn().mockResolvedValue({});
    const database = {
      client: {
        notificationDelivery: {
          updateMany,
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            id: deliveryId,
            provider: 'email',
            templateCode: 'PASSWORD_RESET',
            templateVersion: 1,
            parameters: { token: 'secret-token', expiresAt: new Date().toISOString() },
            recipientReference: '00000000-0000-4000-8000-000000000002',
            organizationId: null,
            attemptCount,
          }),
          update,
        },
        user: { findUnique: vi.fn().mockResolvedValue({ email: 'farmer@example.com' }) },
      },
    };
    const worker = new NotificationDeliveryWorker(
      new ConfigService({ REDIS_HOST: 'localhost', REDIS_PORT: 6379 }),
      database as never,
      { submit: vi.fn().mockRejectedValue(new Error('SMTP_UNAVAILABLE')) },
    );

    await expect(
      worker.process({
        id: 'job-failure',
        name: NOTIFICATION_DELIVER_JOB,
        data: { notificationDeliveryId: deliveryId },
      }),
    ).rejects.toThrow('SMTP_UNAVAILABLE');
    const failureCall = update.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    const failureData = failureCall.data;
    expect(failureData.status).toBe(status);
    expect(failureData.nextAttemptAt).toEqual(status === 'PENDING' ? expect.any(Date) : null);
    expect('parameters' in failureData).toBe(scrubbed);
  });
});
