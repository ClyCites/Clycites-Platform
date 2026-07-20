import 'reflect-metadata';

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createDatabaseClient } from '@clycites/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';

const cooperativeId = '00000000-0000-4000-8000-000000000201';
const buyerId = '00000000-0000-4000-8000-000000000202';
const farmerId = '00000000-0000-4000-8000-000000000401';
const settlementId = '00000000-0000-4000-8000-000000004071';
const password = process.env.SEED_STAFF_PASSWORD ?? 'ClyCites-local-2026!';
const database = createDatabaseClient();
const policyCode = `P6-SELF-APPROVAL-${Date.now()}`;

describe.sequential('Phase 6 finance API', () => {
  let app: INestApplication;
  let financeToken: string;
  let buyerToken: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    financeToken = await login('finance.officer@clycites.local');
    buyerToken = await login('buyer@clycites.local');
  });

  afterAll(async () => {
    await database.deductionPolicy.deleteMany({ where: { code: policyCode } });
    if (app) await app.close();
    await database.$disconnect();
  });

  it('returns reconciled seeded proceeds and settlement totals', async () => {
    const proceeds = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${cooperativeId}/finance/sale-proceeds`)
      .set('authorization', `Bearer ${financeToken}`)
      .expect(200);
    expect(proceeds.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          proceedsNumber: 'PRC-KIS-2026-001',
          status: 'VERIFIED',
          recordedAmountMinor: '36000000',
        }),
      ]),
    );

    const settlement = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${cooperativeId}/finance/settlements/${settlementId}`)
      .set('authorization', `Bearer ${financeToken}`)
      .expect(200);
    expect(settlement.body.data).toMatchObject({
      status: 'APPROVED',
      sourceTotalMinor: '36000000',
      grossAllocatedMinor: '36000000',
      deductionsTotalMinor: '360000',
      netSettlementTotalMinor: '35640000',
    });
    expect(settlement.body.data.farmerSettlements[0].statements[0].checksum).toMatch(
      /^sha256:[a-f0-9]{64}$/,
    );
  });

  it('never exposes encrypted or full payment identifiers', async () => {
    const methods = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${cooperativeId}/finance/farmers/${farmerId}/payment-methods`)
      .set('authorization', `Bearer ${financeToken}`)
      .expect(200);
    expect(methods.body.data[0]).toMatchObject({
      accountIdentifierLast4: '3456',
      status: 'VERIFIED',
    });
    const serialized = JSON.stringify(methods.body.data);
    expect(serialized).not.toContain('accountIdentifierEncrypted');
    expect(serialized).not.toContain('256700123456');
    expect(serialized).not.toContain('v1.L78205SpPykV-ZLF');
  });

  it('requires a different user to approve a deduction policy', async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/finance/deduction-policies`)
      .set('authorization', `Bearer ${financeToken}`)
      .send({
        code: policyCode,
        name: 'Self-approval test policy',
        description: 'Created only to verify separation of duties.',
        type: 'FIXED_AMOUNT',
        basis: 'GROSS_ENTITLEMENT',
        value: '1000',
        currency: 'UGX',
        priority: 999,
        effectiveFrom: '2026-07-20',
        requiresFarmerConsent: false,
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post(
        `/api/v1/organizations/${cooperativeId}/finance/deduction-policies/${created.body.data.id}/approve`,
      )
      .set('authorization', `Bearer ${financeToken}`)
      .expect(409);
    expect(response.body.error.code).toBe('SELF_APPROVAL_FORBIDDEN');
  });

  it('keeps finance records unavailable to buyers', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${buyerId}/finance/payment-instructions`)
      .set('authorization', `Bearer ${buyerToken}`)
      .expect(403);
  });

  async function login(email: string) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(201);
    return response.body.data.accessToken as string;
  }
});
