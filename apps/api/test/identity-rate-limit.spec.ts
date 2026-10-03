import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

describe('public credential rate limits', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });
  afterAll(async () => {
    if (app) await app.close();
  });
  it('limits repeated verification attempts with the real HTTP throttler', async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/email-verification/confirm')
        .send({ token: 'invalid-verification-token-with-at-least-thirty-two-characters' })
        .expect(400);
    }
    const blocked = await request(app.getHttpServer())
      .post('/api/v1/auth/email-verification/confirm')
      .send({ token: 'invalid-verification-token-with-at-least-thirty-two-characters' })
      .expect(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });
});
