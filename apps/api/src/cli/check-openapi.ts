import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module.js';
import type { ApiEnvironment } from '../config/environment.js';
import { createOpenApiDocument } from '../openapi.js';

async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });

  try {
    app.setGlobalPrefix('api/v1');
    await app.init();
    const config = app.get<ConfigService<ApiEnvironment, true>>(ConfigService);
    const document = createOpenApiDocument(
      app,
      config.get('AUTH_REFRESH_COOKIE_NAME', { infer: true }),
    );
    const paths = Object.keys(document.paths);

    if (!document.openapi.startsWith('3.') || paths.length === 0) {
      throw new Error('Generated OpenAPI document is empty or unsupported.');
    }
    if (!paths.some((path) => path.includes('/pilots'))) {
      throw new Error('Generated OpenAPI document does not include controlled-pilot paths.');
    }

    process.stdout.write(
      `${JSON.stringify({ valid: true, openapi: document.openapi, paths: paths.length })}\n`,
    );
  } finally {
    await app.close();
  }
}

await main();
