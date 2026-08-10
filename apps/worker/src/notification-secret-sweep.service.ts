import { Inject, Injectable, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { notificationTemplates } from '@clycites/contracts';
import { Prisma } from '@clycites/database';

import { WorkerDatabaseService } from './worker-database.service.js';

const SECRET_TEMPLATE_CODES = Object.entries(notificationTemplates)
  .filter(([, template]) => template.containsSecret)
  .map(([code]) => code);

@Injectable()
export class NotificationSecretSweepService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(@Inject(WorkerDatabaseService) private readonly database: WorkerDatabaseService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.sweep();
    this.timer = setInterval(() => void this.sweep(), 60 * 60_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async sweep(): Promise<number> {
    const result = await this.database.client.notificationDelivery.updateMany({
      where: {
        templateCode: { in: SECRET_TEMPLATE_CODES },
        status: { in: ['DELIVERED', 'FAILED', 'CANCELLED', 'SUPPRESSED'] },
        NOT: { parameters: { equals: Prisma.JsonNull } },
      },
      data: { parameters: Prisma.JsonNull },
    });
    return result.count;
  }
}