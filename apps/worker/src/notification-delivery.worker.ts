import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Job, Worker } from 'bullmq';
import { z } from 'zod';

import type { WorkerEnvironment } from './environment.js';
import {
  NOTIFICATION_DELIVERY_QUEUE_NAME,
  NOTIFICATION_DELIVER_JOB,
} from './notification.constants.js';
import { NotificationProviderService } from './notification-provider.service.js';
import { WorkerDatabaseService } from './worker-database.service.js';

const notificationJobSchema = z.object({ notificationDeliveryId: z.uuid() }).strict();

@Injectable()
export class NotificationDeliveryWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private worker?: Worker;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<WorkerEnvironment, true>,
    @Inject(WorkerDatabaseService) private readonly database: WorkerDatabaseService,
    @Inject(NotificationProviderService) private readonly provider: NotificationProviderService,
  ) {}

  onApplicationBootstrap(): void {
    this.worker = new Worker(NOTIFICATION_DELIVERY_QUEUE_NAME, (job) => this.process(job), {
      connection: this.connection(),
      concurrency: 10,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  async process(job: Pick<Job, 'name' | 'data' | 'id'>): Promise<{ status: string }> {
    if (job.name !== NOTIFICATION_DELIVER_JOB) throw new Error('Unsupported notification job');
    const payload = notificationJobSchema.parse(job.data);
    const claimed = await this.database.client.notificationDelivery.updateMany({
      where: {
        id: payload.notificationDeliveryId,
        status: { in: ['PENDING', 'FAILED'] },
        provider: { in: ['mock', 'console'] },
      },
      data: { status: 'SUBMITTED', submittedAt: new Date(), attemptCount: { increment: 1 } },
    });
    if (claimed.count !== 1) return { status: 'NOT_CLAIMED' };

    const notification = await this.database.client.notificationDelivery.findUniqueOrThrow({
      where: { id: payload.notificationDeliveryId },
      select: { id: true, provider: true, templateCode: true, organizationId: true },
    });
    try {
      const result = await this.provider.submit({
        notificationDeliveryId: notification.id,
        provider: notification.provider,
        templateCode: notification.templateCode,
      });
      await this.database.client.$transaction([
        this.database.client.notificationDelivery.update({
          where: { id: notification.id },
          data: {
            status: 'DELIVERED',
            deliveredAt: new Date(),
            providerReference: result.providerReference,
            failureCode: null,
            failedAt: null,
            nextAttemptAt: null,
          },
        }),
        this.database.client.auditEvent.create({
          data: {
            organizationId: notification.organizationId,
            actorType: 'SYSTEM',
            action: 'NOTIFICATION_DELIVERED',
            entityType: 'NotificationDelivery',
            entityId: notification.id,
            requestId: `notification-worker:${job.id ?? notification.id}`,
            metadata: {
              provider: notification.provider,
              templateCode: notification.templateCode,
            },
          },
        }),
      ]);
      return { status: 'DELIVERED' };
    } catch (error) {
      await this.database.client.notificationDelivery.update({
        where: { id: notification.id },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          failureCode: error instanceof Error ? error.message.slice(0, 120) : 'PROVIDER_FAILURE',
        },
      });
      throw error;
    }
  }

  private connection() {
    const password = this.config.get('REDIS_PASSWORD', { infer: true });
    return {
      host: this.config.getOrThrow('REDIS_HOST', { infer: true }),
      port: this.config.getOrThrow('REDIS_PORT', { infer: true }),
      ...(password ? { password } : {}),
    };
  }
}
