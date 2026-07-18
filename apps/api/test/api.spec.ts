import 'reflect-metadata';

import { type INestApplication, ServiceUnavailableException } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { ReadinessData, VersionData } from '@clycites/contracts';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HealthController } from '../src/health/health.controller.js';
import { HealthService } from '../src/health/health.service.js';
import { VersionController } from '../src/health/version.controller.js';
import { VersionService } from '../src/health/version.service.js';
import { ApiExceptionFilter } from '../src/observability/api-exception.filter.js';
import { RequestIdMiddleware } from '../src/observability/request-id.middleware.js';
import { ResponseEnvelopeInterceptor } from '../src/observability/response-envelope.interceptor.js';

describe('system API', () => {
  let app: INestApplication;
  const readiness = vi.fn<() => Promise<ReadinessData>>();
  const version: VersionData = {
    application: 'clycites-api',
    apiVersion: 'v1',
    environment: 'test',
    version: '0.1.0',
    buildSha: 'test',
  };

  beforeEach(async () => {
    readiness.mockResolvedValue({
      status: 'ready',
      dependencies: { postgres: { status: 'up' }, redis: { status: 'up' } },
    });
    const module = await Test.createTestingModule({
      controllers: [HealthController, VersionController],
      providers: [
        { provide: HealthService, useValue: { health: () => ({ status: 'ok' }), readiness } },
        { provide: VersionService, useValue: { version: () => version } },
        { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(new RequestIdMiddleware().use);
    await app.init();
  });

  afterEach(async () => app.close());

  it('returns health in the response envelope', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(response.body.data).toEqual({ status: 'ok' });
    expect(response.body.meta).toMatchObject({
      requestId: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('propagates a caller request ID', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('x-request-id', 'client-request-7');
    expect(response.headers['x-request-id']).toBe('client-request-7');
    expect(response.body.meta.requestId).toBe('client-request-7');
  });

  it('reports readiness', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/ready').expect(200);
    expect(response.body.data.status).toBe('ready');
  });

  it('returns an error envelope when readiness fails', async () => {
    readiness.mockRejectedValueOnce(new ServiceUnavailableException('Dependencies unavailable'));
    const response = await request(app.getHttpServer()).get('/api/v1/ready').expect(503);
    expect(response.body.error.code).toBe('DEPENDENCY_UNAVAILABLE');
    expect(response.body.meta.requestId).toEqual(expect.any(String));
  });

  it('returns version information', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/version').expect(200);
    expect(response.body.data).toEqual(version);
  });
});
