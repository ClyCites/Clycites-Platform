import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module.js';
import type { ApiEnvironment } from './config/environment.js';
import { StructuredLoggerService } from './observability/structured-logger.service.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get<ConfigService<ApiEnvironment, true>>(ConfigService);
  app.useLogger(app.get(StructuredLoggerService));
  const trustProxyHops = config.get('TRUST_PROXY_HOPS', { infer: true });
  if (trustProxyHops > 0) app.set('trust proxy', trustProxyHops);
  app.use(helmet());
  app.enableCors({ origin: config.get('WEB_ORIGIN', { infer: true }), credentials: true });
  app.useBodyParser('json', { limit: '256kb' });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
  );
  app.enableShutdownHooks();

  if (config.get('API_DOCS_ENABLED', { infer: true })) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('ClyCites Platform API')
      .setDescription('REST API for the ClyCites Verifiable Agriculture Platform')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .addCookieAuth(config.get('AUTH_REFRESH_COOKIE_NAME', { infer: true }), {
        type: 'apiKey',
        in: 'cookie',
        description: 'Rotating HttpOnly refresh-session cookie',
      })
      .build();
    SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, swaggerConfig));
  }

  await app.listen(config.get('API_PORT', { infer: true }));
}

await bootstrap();
