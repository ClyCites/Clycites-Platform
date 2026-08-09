import { createHmac } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';

import { REDIS_CLIENT } from '../queue/queue.constants.js';

export type LoginIdentifierClass = 'email' | 'phone' | 'username';

interface FailureResult {
  lockedOut: boolean;
  retryAfterSeconds: number;
}

const RECORD_FAILURE_SCRIPT = `
local failures = redis.call('HINCRBY', KEYS[1], 'failures', 1)
redis.call('EXPIRE', KEYS[1], ARGV[4] * 2)
if failures < tonumber(ARGV[1]) then
  return {0, 0}
end
redis.call('HSET', KEYS[1], 'failures', 0)
local level = redis.call('HINCRBY', KEYS[1], 'level', 1)
local duration = tonumber(ARGV[2])
if level == 2 then
  duration = duration * 5
elseif level == 3 then
  duration = duration * 15
elseif level >= 4 then
  duration = tonumber(ARGV[3])
end
if duration > tonumber(ARGV[3]) then
  duration = tonumber(ARGV[3])
end
redis.call('SET', KEYS[2], '1', 'EX', duration)
return {1, duration}
`;

@Injectable()
export class LoginLimiterService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(ConfigService)
    private readonly config: ConfigService<Record<string, unknown>, false>,
  ) {}

  hashIdentifier(identifierClass: LoginIdentifierClass, normalizedIdentifier: string): string {
    return createHmac(
      'sha256',
      this.config.getOrThrow<string>('AUTH_IDENTIFIER_HASH_PEPPER'),
    )
      .update(`${identifierClass}:${normalizedIdentifier}`)
      .digest('hex');
  }

  async retryAfter(identifierClass: LoginIdentifierClass, identifierHash: string, userId?: string) {
    const keys = this.keys(identifierClass, identifierHash, userId);
    const remaining = await Promise.all(keys.map((key) => this.redis.pttl(`${key}:lock`)));
    const retryAfterMilliseconds = Math.max(0, ...remaining);
    return retryAfterMilliseconds > 0 ? Math.ceil(retryAfterMilliseconds / 1000) : 0;
  }

  async recordFailure(
    identifierClass: LoginIdentifierClass,
    identifierHash: string,
    userId?: string,
  ): Promise<FailureResult> {
    const results = await Promise.all(
      this.keys(identifierClass, identifierHash, userId).map((key) => this.recordKeyFailure(key)),
    );
    return {
      lockedOut: results.some(([lockedOut]) => lockedOut === 1),
      retryAfterSeconds: Math.max(0, ...results.map(([, seconds]) => seconds)),
    };
  }

  async reset(
    identifierClass: LoginIdentifierClass,
    identifierHash: string,
    userId: string,
  ): Promise<void> {
    const keys = this.keys(identifierClass, identifierHash, userId).flatMap((key) => [
      key,
      `${key}:lock`,
    ]);
    await this.redis.del(...keys);
  }

  private keys(identifierClass: LoginIdentifierClass, identifierHash: string, userId?: string) {
    return [
      `auth:login:identifier:${identifierClass}:${identifierHash}`,
      ...(userId ? [`auth:login:user:${userId}`] : []),
    ];
  }

  private async recordKeyFailure(key: string): Promise<[number, number]> {
    const result = await this.redis.eval(
      RECORD_FAILURE_SCRIPT,
      2,
      key,
      `${key}:lock`,
      this.config.getOrThrow<number>('AUTH_LOGIN_MAX_FAILURES'),
      this.config.getOrThrow<number>('AUTH_LOGIN_LOCKOUT_BASE_SECONDS'),
      this.config.getOrThrow<number>('AUTH_LOGIN_LOCKOUT_MAX_SECONDS'),
      this.config.getOrThrow<number>('AUTH_LOGIN_LOCKOUT_MAX_SECONDS'),
    );
    if (!Array.isArray(result) || result.length !== 2) {
      throw new Error('Unexpected login limiter response');
    }
    return [Number(result[0]), Number(result[1])];
  }
}
