import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/prisma/client.js';

export * from './generated/prisma/client.js';

export const createDatabaseClient = (databaseUrl = process.env.DATABASE_URL): PrismaClient => {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to create the Prisma client');
  }

  // Opt-in only. Query events are required to audit query counts (N+1 detection) and are
  // never enabled by default because the payload contains query text.
  if (process.env.PRISMA_QUERY_LOG === '1') {
    return new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
      log: [{ emit: 'event', level: 'query' }],
    });
  }

  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
};

/**
 * Subscribes to Prisma query events. Only emits when `PRISMA_QUERY_LOG=1` was set before
 * the client was constructed. The cast is contained here because the log option is
 * applied conditionally at runtime, so the static client type cannot express the event.
 */
export const onQueryEvent = (client: PrismaClient, listener: () => void): void => {
  (client as unknown as { $on: (event: string, callback: () => void) => void }).$on(
    'query',
    listener,
  );
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
