import { Global, MiddlewareConsumer, Module, RequestMethod, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import { ApiExceptionFilter } from './api-exception.filter.js';
import { RequestIdMiddleware } from './request-id.middleware.js';
import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor.js';
import { StructuredLoggerService } from './structured-logger.service.js';

@Global()
@Module({
  providers: [
    StructuredLoggerService,
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
  ],
  exports: [StructuredLoggerService],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
