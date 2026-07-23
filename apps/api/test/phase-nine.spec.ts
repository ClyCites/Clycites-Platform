import 'reflect-metadata';

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createDatabaseClient } from '@clycites/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';

const database = createDatabaseClient();

// Seeded Phase 2 (schema phase 9) fixtures.
const cooperativeId = '00000000-0000-4000-8000-000000000201';
const recipientOrganizationId = '00000000-0000-4000-8000-000000000202';
const password = process.env.SEED_STAFF_PASSWORD ?? 'ClyCites-local-2026!';

const analyticsBody = {
  dateRange: { from: '2026-01-01', to: '2026-01-31' },
  granularity: 'DAY' as const,
};

describe.sequential('Phase 2 Enterprise Dashboard API', () => {
  let app: INestApplication;
  let analystToken: string;
  let auditorToken: string;
  let coopAdminToken: string;
  let exporterAdminToken: string;
  let cooperativeSlug: string;
  const createdExportIds: string[] = [];

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    const cooperative = await database.organization.findUniqueOrThrow({
      where: { id: cooperativeId },
      select: { slug: true },
    });
    cooperativeSlug = cooperative.slug;

    analystToken = await login('analyst@clycites.local');
    auditorToken = await login('auditor@clycites.local');
    coopAdminToken = await login('cooperative.admin@clycites.local');
    exporterAdminToken = await login('exporter.admin@clycites.local');
  });

  afterAll(async () => {
    if (createdExportIds.length > 0) {
      await database.auditEvent.deleteMany({
        where: { entityId: { in: createdExportIds } },
      });
      await database.reportExport.deleteMany({ where: { id: { in: createdExportIds } } });
    }
    await app.close();
    await database.$disconnect();
  });

  it('resolves the tenant context with effective permissions from custom roles', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/me/context')
      .set('authorization', `Bearer ${analystToken}`)
      .expect(200);

    const memberships = response.body.data.memberships as Array<{ organizationId: string }>;
    const permissions = response.body.data.effectivePermissions as string[];

    expect(response.body.data.activeOrganizationId).toBe(cooperativeId);
    expect(memberships.some((membership) => membership.organizationId === cooperativeId)).toBe(true);
    // Base VIEWER role grants analytics.read; the Analyst custom role adds settlement.read.
    expect(permissions).toContain('analytics.read');
    expect(permissions).toContain('settlement.read');
    // No custom role grants finance analytics, so it must remain absent.
    expect(permissions).not.toContain('analytics.finance.read');
  });

  it('grants analytics overview to a permitted tenant member', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/analytics/overview`)
      .set('authorization', `Bearer ${analystToken}`)
      .send(analyticsBody)
      .expect(201);

    expect(response.body.data.organizationId).toBe(cooperativeId);
  });

  it('denies finance analytics when the member lacks the finance permission', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/analytics/finance`)
      .set('authorization', `Bearer ${analystToken}`)
      .send(analyticsBody)
      .expect(403);
  });

  it('isolates tenants so an administrator of one organization cannot read another', async () => {
    // exporter.admin administers the recipient organization, not the cooperative.
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${recipientOrganizationId}/analytics/overview`)
      .set('authorization', `Bearer ${exporterAdminToken}`)
      .send(analyticsBody)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/analytics/overview`)
      .set('authorization', `Bearer ${exporterAdminToken}`)
      .send(analyticsBody)
      .expect(403);
  });

  it('allows an auditor to search the audit trail but not manage branding', async () => {
    const audit = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/audit/search`)
      .set('authorization', `Bearer ${auditorToken}`)
      .send({ page: 1, pageSize: 25 })
      .expect(201);

    expect(Array.isArray(audit.body.data.items)).toBe(true);
    expect(audit.body.data.pagination.page).toBe(1);

    await request(app.getHttpServer())
      .put(`/api/v1/organizations/${cooperativeId}/branding`)
      .set('authorization', `Bearer ${auditorToken}`)
      .send({ displayName: 'Hijacked Brand' })
      .expect(403);
  });

  it('serves public branding without authentication', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/public/organizations/${cooperativeSlug}/branding`)
      .expect(200);

    expect(response.body.data.displayName).toEqual(expect.any(String));
  });

  it('queues a report export as a pending job and lists it for the tenant', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/reports/exports`)
      .set('authorization', `Bearer ${coopAdminToken}`)
      .send({ reportType: 'FARMER_REGISTRY', format: 'CSV' })
      .expect(201);

    const created = response.body.data as { id: string; status: string };
    createdExportIds.push(created.id);
    expect(created.status).toBe('PENDING');

    const list = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${cooperativeId}/reports/exports`)
      .set('authorization', `Bearer ${coopAdminToken}`)
      .expect(200);

    const ids = (list.body.data as Array<{ id: string }>).map((entry) => entry.id);
    expect(ids).toContain(created.id);
  });

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(201);
    return response.body.data.accessToken as string;
  }
});
