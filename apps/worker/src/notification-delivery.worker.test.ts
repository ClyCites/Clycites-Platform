import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import { NotificationDeliveryWorker } from './notification-delivery.worker.js';
import { NOTIFICATION_DELIVER_JOB } from './notification.constants.js';
import { NotificationProviderService } from './notification-provider.service.js';

const deliveryId = '00000000-0000-4000-8000-000000000001';

describe('NotificationDeliveryWorker', () => {
  it('delivers identifier-only mock jobs without placing recipient data in audit metadata', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findUniqueOrThrow = vi.fn().mockResolvedValue({
      id: deliveryId,
      provider: 'mock',
      templateCode: 'PAYMENT_RECONCILED',
      organizationId: null,
    });
    const update = vi.fn().mockReturnValue({ operation: 'update' });
    const auditCreate = vi.fn().mockReturnValue({ operation: 'audit' });
    const transaction = vi.fn().mockResolvedValue([]);
    const database = {
      client: {
        notificationDelivery: { updateMany, findUniqueOrThrow, update },
        auditEvent: { create: auditCreate },
        $transaction: transaction,
      },
    };
    const worker = new NotificationDeliveryWorker(
      new ConfigService({ REDIS_HOST: 'localhost', REDIS_PORT: 6379 }),
      database as never,
      new NotificationProviderService(),
    );

    await expect(
      worker.process({
        id: 'job-1',
        name: NOTIFICATION_DELIVER_JOB,
        data: { notificationDeliveryId: deliveryId },
      }),
    ).resolves.toEqual({ status: 'DELIVERED' });

    const updateInput = updateMany.mock.calls[0]?.[0] as { where: { id: string } };
    expect(updateInput.where.id).toBe(deliveryId);
    const auditInput = auditCreate.mock.calls[0]?.[0] as {
      data: { metadata: { provider: string; templateCode: string } };
    };
    expect(auditInput.data.metadata).toEqual({
      provider: 'mock',
      templateCode: 'PAYMENT_RECONCILED',
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
});
