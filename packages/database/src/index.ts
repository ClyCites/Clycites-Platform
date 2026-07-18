import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/prisma/client.js';

export * from './generated/prisma/client.js';

export const createDatabaseClient = (databaseUrl = process.env.DATABASE_URL): PrismaClient => {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to create the Prisma client');
  }

  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
};

export class DatabaseService {
  readonly client: PrismaClient;

  constructor(databaseUrl?: string) {
    this.client = createDatabaseClient(databaseUrl);
  }

  async connect(): Promise<void> {
    await this.client.$connect();
  }

  async disconnect(): Promise<void> {
    await this.client.$disconnect();
  }
}
