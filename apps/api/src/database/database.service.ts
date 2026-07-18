import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { DatabaseService as SharedDatabaseService } from '@clycites/database';

@Injectable()
export class DatabaseService
  extends SharedDatabaseService
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  async ping(): Promise<void> {
    await this.client.$queryRaw`SELECT 1`;
  }
}
