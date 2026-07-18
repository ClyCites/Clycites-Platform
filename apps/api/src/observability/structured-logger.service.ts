import { Inject, Injectable, type LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createLogger } from '@clycites/observability';
import type { Logger } from 'pino';

import type { ApiEnvironment } from '../config/environment.js';

@Injectable()
export class StructuredLoggerService implements LoggerService {
  private readonly logger: Logger;

  constructor(@Inject(ConfigService) config: ConfigService<ApiEnvironment, true>) {
    this.logger = createLogger(
      { application: 'clycites-api', environment: config.get('NODE_ENV', { infer: true }) },
      config.get('LOG_LEVEL', { infer: true }),
    );
  }

  log(message: unknown, context?: string): void {
    this.logger.info({ context }, String(message));
  }
  error(message: unknown, trace?: string, context?: string): void {
    this.logger.error({ context, trace }, String(message));
  }
  warn(message: unknown, context?: string): void {
    this.logger.warn({ context }, String(message));
  }
  debug(message: unknown, context?: string): void {
    this.logger.debug({ context }, String(message));
  }
  verbose(message: unknown, context?: string): void {
    this.logger.trace({ context }, String(message));
  }
}
