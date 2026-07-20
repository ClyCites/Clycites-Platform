import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';

export function createOpenApiDocument(
  app: INestApplication,
  refreshCookieName: string,
): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('ClyCites Platform API')
    .setDescription('REST API for the ClyCites Verifiable Agriculture Platform')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .addCookieAuth(refreshCookieName, {
      type: 'apiKey',
      in: 'cookie',
      description: 'Rotating HttpOnly refresh-session cookie',
    })
    .build();

  return SwaggerModule.createDocument(app, config);
}
