import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Job, Worker } from 'bullmq';
import { z } from 'zod';
import { renderEmailNotification } from '@clycites/contracts';
import { Prisma } from '@clycites/database';

import type { WorkerEnvironment } from './environment.js';
import {
  NOTIFICATION_DELIVERY_QUEUE_NAME,
  NOTIFICATION_DELIVER_JOB,
} from './notification.constants.js';
import { NotificationProviderService } from './notification-provider.service.js';
import { WorkerDatabaseService } from './worker-database.service.js';

const notificationJobSchema = z.object({ notificationDeliveryId: z.uuid() }).strict();
const MAX_ATTEMPTS = 5;

@Injectable()
export class NotificationDeliveryWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private worker?: Worker;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<WorkerEnvironment, true>,
    @Inject(WorkerDatabaseService) private readonly database: WorkerDatabaseService,
    @Inject(NotificationProviderService)
    private readonly provider: Pick<NotificationProviderService, 'submit'>,
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
    const suppressed = await this.database.client.notificationDelivery.updateMany({
      where: {
        id: payload.notificationDeliveryId,
        status: { in: ['PENDING', 'QUEUED'] },
        channel: 'SMS',
      },
      data: {
        status: 'SUPPRESSED',
        parameters: Prisma.JsonNull,
        failureCode: 'SMS_NOT_IMPLEMENTED',
        failedAt: new Date(),
      },
    });
    if (suppressed.count === 1) return { status: 'SUPPRESSED' };
    const claimed = await this.database.client.notificationDelivery.updateMany({
      where: {
        id: payload.notificationDeliveryId,
        status: { in: ['PENDING', 'QUEUED'] },
        provider: { in: ['mock', 'console', 'email'] },
      },
      data: { status: 'SUBMITTED', submittedAt: new Date(), attemptCount: { increment: 1 } },
    });
    if (claimed.count !== 1) return { status: 'NOT_CLAIMED' };

    const notification = await this.database.client.notificationDelivery.findUniqueOrThrow({
      where: { id: payload.notificationDeliveryId },
      select: {
        id: true,
        provider: true,
        templateCode: true,
        templateVersion: true,
        parameters: true,
        recipientReference: true,
        organizationId: true,
        attemptCount: true,
      },
    });
    try {
      const recipient = await this.database.client.user.findUnique({
        where: { id: notification.recipientReference },
        select: { email: true },
      });
      if (!recipient?.email) throw new Error('RECIPIENT_EMAIL_UNAVAILABLE');
      const rendered = renderEmailNotification(
        notification.templateCode,
        notification.templateVersion,
        notification.parameters,
      );
      const result = await this.provider.submit({
        notificationDeliveryId: notification.id,
        provider: notification.provider,
        templateCode: notification.templateCode,
        recipient: recipient.email,
        ...rendered,
      });
      await this.database.client.$transaction([
        this.database.client.notificationDelivery.update({
          where: { id: notification.id },
          data: {
            status: 'DELIVERED',
            parameters: Prisma.JsonNull,
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
              provider: result.provider,
              templateCode: notification.templateCode,
            },
          },
        }),
      ]);
      return { status: 'DELIVERED' };
    } catch (error) {
      const terminal = notification.attemptCount >= MAX_ATTEMPTS;
      await this.database.client.notificationDelivery.update({
        where: { id: notification.id },
        data: {
          status: terminal ? 'FAILED' : 'PENDING',
          ...(terminal ? { parameters: Prisma.JsonNull, failedAt: new Date() } : {}),
          nextAttemptAt: terminal
            ? null
            : new Date(Date.now() + Math.min(300_000, 2_000 * 2 ** notification.attemptCount)),
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
