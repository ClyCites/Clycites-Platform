import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';

import type { ApiEnvironment } from '../config/environment.js';
import { REDIS_CLIENT } from '../queue/queue.constants.js';

const WINDOW_SECONDS = 60;
const INCREMENT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('TTL', KEYS[1])
return {count, ttl}
`;

export class OfflineSyncRateLimitException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super(
      { code: 'OFFLINE_SYNC_RATE_LIMITED', message: 'Device synchronization rate exceeded' },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

@Injectable()
export class OfflineSyncRateLimiterService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(ConfigService) private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  async assertAllowed(deviceId: string): Promise<void> {
    const window = Math.floor(Date.now() / (WINDOW_SECONDS * 1000));
    const result = await this.redis.eval(
      INCREMENT_SCRIPT,
      1,
      `offline-sync:device:${deviceId}:${window}`,
      WINDOW_SECONDS,
    );
    if (!Array.isArray(result) || result.length !== 2) {
      throw new Error('Unexpected offline sync rate limiter response');
    }
    const count = Number(result[0]);
    const ttl = Number(result[1]);
    if (count > this.config.getOrThrow<number>('OFFLINE_SYNC_REQUESTS_PER_MINUTE')) {
      throw new OfflineSyncRateLimitException(Math.max(1, ttl));
    }
  }
}
