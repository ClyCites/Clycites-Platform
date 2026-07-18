import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module.js';
import type { ApiEnvironment } from './config/environment.js';
import { StructuredLoggerService } from './observability/structured-logger.service.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get<ConfigService<ApiEnvironment, true>>(ConfigService);
  app.useLogger(app.get(StructuredLoggerService));
  app.use(helmet());
  app.enableCors({ origin: config.get('WEB_ORIGIN', { infer: true }), credentials: true });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
  );
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ClyCites Platform API')
    .setDescription('REST API for the ClyCites Verifiable Agriculture Platform')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, swaggerConfig));

  await app.listen(config.get('API_PORT', { infer: true }));
}

await bootstrap();
