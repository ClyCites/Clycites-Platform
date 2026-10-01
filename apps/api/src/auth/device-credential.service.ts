import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { ApiEnvironment } from '../config/environment.js';

@Injectable()
export class DeviceCredentialService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  issue(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hash(token) };
  }

  matches(storedHash: string | null, token: string): boolean {
    if (!storedHash) return false;
    const expected = Buffer.from(storedHash, 'hex');
    const actual = Buffer.from(this.hash(token), 'hex');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private hash(token: string): string {
    return createHmac('sha256', this.config.get('AUTH_DEVICE_TOKEN_PEPPER', { infer: true }))
      .update(token)
      .digest('hex');
  }
}
