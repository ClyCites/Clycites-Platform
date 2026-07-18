import 'reflect-metadata';

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createDatabaseClient } from '@clycites/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';

const database = createDatabaseClient();
const cooperativeId = '00000000-0000-4000-8000-000000000201';
const collectionAgentId = '00000000-0000-4000-8000-000000000103';
const financeOfficerId = '00000000-0000-4000-8000-000000000104';
const testOrganizationId = '10000000-0000-4000-8000-000000000201';
const farmerNumber = 'TEST-PHASE1-0001';
const password = process.env.SEED_STAFF_PASSWORD ?? 'ClyCites-local-2026!';

describe.sequential('Phase 1 API', () => {
  let app: INestApplication;
  let platformToken: string;
  let adminToken: string;
  let agentToken: string;
  let farmerId: string;
  let qrIdentityId: string;
  let publicId: string;

  beforeAll(async () => {
    await database.user.update({ where: { id: collectionAgentId }, data: { status: 'ACTIVE' } });
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    platformToken = await login('platform.admin@clycites.local');
    adminToken = await login('cooperative.admin@clycites.local');
    agentToken = await login('collection.agent@clycites.local');
  });

  afterAll(async () => {
    await database.auditEvent.deleteMany({
      where: { OR: [{ organizationId: testOrganizationId }, { entityId: farmerId }] },
    });
    await database.outboxEvent.deleteMany({
      where: { OR: [{ aggregateId: testOrganizationId }, { aggregateId: farmerId }] },
    });
    if (farmerId) {
      await database.farmerQrIdentity.deleteMany({ where: { farmerId } });
      await database.farmerConsent.deleteMany({ where: { farmerId } });
      await database.farm.deleteMany({ where: { farmerId } });
      await database.farmerOrganizationMembership.deleteMany({ where: { farmerId } });
      await database.farmer.deleteMany({ where: { id: farmerId } });
    }
    await database.organization.deleteMany({ where: { id: testOrganizationId } });
    await database.session.deleteMany({
      where: {
        userId: {
          in: [
            '00000000-0000-4000-8000-000000000101',
            '00000000-0000-4000-8000-000000000102',
            collectionAgentId,
            financeOfficerId,
          ],
        },
      },
    });
    await app.close();
    await database.$disconnect();
  });

  it('logs in without exposing credential hashes and authenticates access tokens', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'cooperative.admin@clycites.local', password })
      .expect(201);

    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|refreshTokenHash/);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${response.body.data.accessToken}`)
      .expect(200);
  });

  it('rejects invalid credentials and suspended users generically', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'cooperative.admin@clycites.local', password: 'incorrect' })
      .expect(401);
    await database.user.update({ where: { id: collectionAgentId }, data: { status: 'SUSPENDED' } });
    try {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'collection.agent@clycites.local', password })
        .expect(403);
    } finally {
      await database.user.update({ where: { id: collectionAgentId }, data: { status: 'ACTIVE' } });
    }
  });

  it('rotates refresh tokens and rejects reuse of the previous token', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'cooperative.admin@clycites.local', password })
      .expect(201);
    const originalCookie = cookie(loginResponse);
    const refreshResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('cookie', originalCookie)
      .expect(201);
    expect(cookie(refreshResponse)).not.toBe(originalCookie);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('cookie', originalCookie)
      .expect(401);
  });

  it('creates organizations as a platform administrator and rejects cross-organization access', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('authorization', `Bearer ${platformToken}`)
      .send({
        name: 'Phase One Test Cooperative',
        slug: 'phase-one-test-cooperative',
        type: 'COOPERATIVE',
        status: 'ACTIVE',
        registrationNumber: null,
        phone: null,
        email: null,
        district: 'Gulu',
        subCounty: null,
        address: null,
      })
      .expect(201);
    const created = await database.organization.findUniqueOrThrow({
      where: { slug: 'phase-one-test-cooperative' },
    });
    await database.organization.update({
      where: { id: created.id },
      data: { id: testOrganizationId },
    });
    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${testOrganizationId}/farmers`)
      .set('authorization', `Bearer ${agentToken}`)
      .expect(403);
  });

  it('enforces membership, role, uniqueness, and last-administrator invariants', async () => {
    const agentMembership = await database.organizationMembership.findUniqueOrThrow({
      where: {
        organizationId_userId: { organizationId: cooperativeId, userId: collectionAgentId },
      },
    });
    const financeMembership = await database.organizationMembership.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId: cooperativeId, userId: financeOfficerId } },
    });
    const administratorMembership = await database.organizationMembership.findFirstOrThrow({
      where: { organizationId: cooperativeId, role: 'COOPERATIVE_ADMIN', status: 'ACTIVE' },
    });
    const existingPoint = await database.collectionPoint.findFirstOrThrow({
      where: { organizationId: cooperativeId },
    });

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/members`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ userId: collectionAgentId, role: 'COLLECTION_AGENT', status: 'ACTIVE' })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/collection-points`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Duplicate Code',
        code: existingPoint.code,
        district: 'Kasese',
        status: 'ACTIVE',
        timezone: 'Africa/Kampala',
        subCounty: null,
        parish: null,
        village: null,
        latitude: null,
        longitude: null,
      })
      .expect(409);
    await request(app.getHttpServer())
      .delete(`/api/v1/organizations/${cooperativeId}/members/${administratorMembership.id}`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(409);

    await database.organizationMembership.update({
      where: { id: agentMembership.id },
      data: { status: 'SUSPENDED' },
    });
    try {
      await request(app.getHttpServer())
        .get(`/api/v1/organizations/${cooperativeId}/farmers`)
        .set('authorization', `Bearer ${agentToken}`)
        .expect(403);
    } finally {
      await database.organizationMembership.update({
        where: { id: agentMembership.id },
        data: { status: 'ACTIVE' },
      });
    }

    await database.organizationMembership.update({
      where: { id: financeMembership.id },
      data: { role: 'BUYER' },
    });
    try {
      const buyerToken = await login('finance.officer@clycites.local');
      await request(app.getHttpServer())
        .get(`/api/v1/organizations/${cooperativeId}/farmers`)
        .set('authorization', `Bearer ${buyerToken}`)
        .expect(403);
    } finally {
      await database.organizationMembership.update({
        where: { id: financeMembership.id },
        data: { role: 'FINANCE_OFFICER' },
      });
    }
  });

  it('registers a farmer, farm, consent, membership, QR, audit, and outbox atomically', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/farmers`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        farmerNumber,
        firstName: 'Test',
        lastName: 'Farmer',
        district: 'Kasese',
        membershipNumber: 'TEST-MEMBER-0001',
        initialFarm: {
          name: 'Test Farm',
          district: 'Kasese',
          totalArea: '1.2500',
          areaUnit: 'ACRE',
        },
        initialConsents: [
          { consentType: 'DATA_PROCESSING', policyVersion: 'test-v1', captureMethod: 'CHECKBOX' },
        ],
        issueQrIdentity: true,
      })
      .expect(201);
    farmerId = response.body.data.id;
    const [farmCount, consentCount, membershipCount, qr, auditCount, outboxCount] =
      await Promise.all([
        database.farm.count({ where: { farmerId } }),
        database.farmerConsent.count({ where: { farmerId } }),
        database.farmerOrganizationMembership.count({
          where: { farmerId, organizationId: cooperativeId },
        }),
        database.farmerQrIdentity.findFirstOrThrow({ where: { farmerId, status: 'ACTIVE' } }),
        database.auditEvent.count({ where: { entityId: farmerId } }),
        database.outboxEvent.count({ where: { aggregateId: farmerId } }),
      ]);
    qrIdentityId = qr.id;
    publicId = qr.publicId;
    expect([farmCount, consentCount, membershipCount]).toEqual([1, 1, 1]);
    expect(auditCount).toBeGreaterThan(0);
    expect(outboxCount).toBeGreaterThan(0);
    expect(publicId).toMatch(/^fq1_[A-Za-z0-9_-]{32}$/);
    expect(publicId).not.toContain(farmerNumber);
  });

  it('does not leave partial records when nested registration conflicts', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/farmers`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        farmerNumber: 'TEST-PHASE1-ROLLBACK',
        firstName: 'Rollback',
        lastName: 'Test',
        district: 'Kasese',
        membershipNumber: 'TEST-MEMBER-0001',
        initialFarm: {
          name: 'Should Roll Back',
          district: 'Kasese',
          totalArea: '2.0000',
          areaUnit: 'ACRE',
        },
        issueQrIdentity: true,
      })
      .expect(409);
    expect(await database.farmer.count({ where: { farmerNumber: 'TEST-PHASE1-ROLLBACK' } })).toBe(
      0,
    );
  });

  it('returns only the permitted collection profile and enforces QR state changes', async () => {
    const lookup = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${cooperativeId}/farmer-lookup/${publicId}`)
      .set('authorization', `Bearer ${agentToken}`)
      .expect(200);
    expect(lookup.body.data).toMatchObject({ farmerId, farmerNumber });
    expect(lookup.body.data).not.toHaveProperty('primaryPhone');
    expect(lookup.body.data).not.toHaveProperty('latitude');
    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${cooperativeId}/farmer-lookup/${publicId}`)
      .expect(401);

    const replacement = await request(app.getHttpServer())
      .post(
        `/api/v1/organizations/${cooperativeId}/farmers/${farmerId}/qr-identities/${qrIdentityId}/replace`,
      )
      .set('authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${cooperativeId}/farmer-lookup/${publicId}`)
      .set('authorization', `Bearer ${agentToken}`)
      .expect(404);
    const replacementId = replacement.body.data.id;
    const replacementPublicId = replacement.body.data.publicId;
    await request(app.getHttpServer())
      .post(
        `/api/v1/organizations/${cooperativeId}/farmers/${farmerId}/qr-identities/${replacementId}/revoke`,
      )
      .set('authorization', `Bearer ${adminToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${cooperativeId}/farmer-lookup/${replacementPublicId}`)
      .set('authorization', `Bearer ${agentToken}`)
      .expect(404);
  });

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(201);
    return response.body.data.accessToken as string;
  }

  function cookie(response: request.Response): string {
    const header: unknown = response.headers['set-cookie'];
    const value =
      typeof header === 'string'
        ? header
        : Array.isArray(header) && typeof header[0] === 'string'
          ? header[0]
          : undefined;
    if (!value) throw new Error('Refresh cookie missing');
    return value.split(';', 1)[0] ?? '';
  }
});
