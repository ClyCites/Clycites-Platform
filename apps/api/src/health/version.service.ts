import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { VersionData } from '@clycites/contracts';

import type { ApiEnvironment } from '../config/environment.js';

@Injectable()
export class VersionService {
  constructor(private readonly config: ConfigService<ApiEnvironment, true>) {}

  version(): VersionData {
    return {
      application: 'clycites-api',
      apiVersion: 'v1',
      environment: this.config.get('NODE_ENV', { infer: true }),
      version: this.config.get('APP_VERSION', { infer: true }),
      buildSha: this.config.get('BUILD_SHA', { infer: true }),
    };
  }
}
