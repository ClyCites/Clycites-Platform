import { Inject, Injectable } from '@nestjs/common';
import type { HealthData, ReadinessData } from '@clycites/contracts';
import type { Redis } from 'ioredis';

import { DatabaseService } from '../database/database.service.js';
import { REDIS_CLIENT } from '../queue/queue.constants.js';

@Injectable()
export class HealthService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  health(): HealthData {
    return { status: 'ok' };
  }

  async readiness(): Promise<ReadinessData> {
    const [postgres, redis] = await Promise.all([
      this.probe(() => this.database.ping()),
      this.probe(async () => {
        await this.redis.ping();
      }),
    ]);
    return {
      status: postgres.status === 'up' && redis.status === 'up' ? 'ready' : 'not_ready',
      dependencies: { postgres, redis },
    };
  }

  private async probe(
    operation: () => Promise<void>,
  ): Promise<ReadinessData['dependencies']['postgres']> {
    const startedAt = performance.now();
    try {
      await operation();
      return { status: 'up', latencyMs: Math.round(performance.now() - startedAt) };
    } catch {
      return { status: 'down', message: 'Dependency is unreachable' };
    }
  }
}
