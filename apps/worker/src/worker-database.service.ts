import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDatabaseClient, type PrismaClient } from '@clycites/database';

import type { WorkerEnvironment } from './environment.js';

@Injectable()
export class WorkerDatabaseService implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaClient;

  constructor(@Inject(ConfigService) config: ConfigService<WorkerEnvironment, true>) {
    this.client = createDatabaseClient(config.getOrThrow('DATABASE_URL', { infer: true }));
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
