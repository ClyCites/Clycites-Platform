import 'reflect-metadata';

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createDatabaseClient } from '@clycites/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';

const cooperativeId = '00000000-0000-4000-8000-000000000201';
const outsideOrganizationId = '00000000-0000-4000-8000-000000009999';
const pilotId = '00000000-0000-4000-8000-000000006003';
const observationId = '00000000-0000-4000-8000-000000006063';
const password = process.env.SEED_STAFF_PASSWORD ?? 'ClyCites-local-2026!';
const database = createDatabaseClient();

describe.sequential('Phase 8 controlled pilot API', () => {
  let app: INestApplication;
  let platformToken: string;
  let cooperativeToken: string;
  const supportCaseIds: string[] = [];
  const incidentIds: string[] = [];

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    platformToken = await login('platform.admin@clycites.local');
    cooperativeToken = await login('cooperative.admin@clycites.local');
  });

  afterAll(async () => {
    await database.auditEvent.deleteMany({
      where: {
        entityType: { in: ['PILOT_SUPPORT_CASE', 'PILOT_METRIC_OBSERVATION'] },
        entityId: { in: [...supportCaseIds, observationId] },
      },
    });
    await database.pilotSupportCase.deleteMany({ where: { id: { in: supportCaseIds } } });
    await database.operationalIncident.deleteMany({ where: { id: { in: incidentIds } } });
    await database.pilotMetricObservation.update({
      where: { id: observationId },
      data: {
        reviewStatus: 'UNREVIEWED',
        reviewedByUserId: null,
        reviewedAt: null,
        reviewNotes: null,
      },
    });
    if (app) await app.close();
    await database.$disconnect();
  });

  it('derives an evaluation evidence hash without producing an automated decision', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/pilots/${pilotId}/evaluation`)
      .set('authorization', `Bearer ${platformToken}`)
      .expect(200);

    expect(response.body.data).toMatchObject({ automatedDecision: null });
    expect(response.body.data.evidenceSnapshotHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('persists a human metric review and its notes', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/pilots/${pilotId}/metrics/${observationId}/review`)
      .set('authorization', `Bearer ${platformToken}`)
      .send({ status: 'QUESTIONED', notes: 'Synthetic review note for integration assurance.' })
      .expect(201);

    await expect(
      database.pilotMetricObservation.findUnique({ where: { id: observationId } }),
    ).resolves.toMatchObject({
      reviewStatus: 'QUESTIONED',
      reviewNotes: 'Synthetic review note for integration assurance.',
    });
  });

  it('escalates a support case into a separate linked operational incident', async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/support-cases`)
      .set('authorization', `Bearer ${cooperativeToken}`)
      .send({
        pilotId,
        category: 'OFFLINE_SYNC',
        priority: 'HIGH',
        title: 'Synthetic escalation assurance',
        description: 'Synthetic API integration record; no field incident occurred.',
      })
      .expect(201);
    const supportCaseId = created.body.data.id as string;
    supportCaseIds.push(supportCaseId);

    const escalated = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/support-cases/${supportCaseId}/escalate`)
      .set('authorization', `Bearer ${platformToken}`)
      .send({
        category: 'OFFLINE_SYNC',
        severity: 'SEV3',
        impactSummary: 'Synthetic integration-test impact only.',
        restricted: false,
      })
      .expect(201);
    const incidentId = escalated.body.data.incident.id as string;
    incidentIds.push(incidentId);

    expect(escalated.body.data.supportCase.escalatedIncidentId).toBe(incidentId);
    expect(escalated.body.data.incident.externalReference).toBe(created.body.data.caseNumber);
  });

  it('denies another organization support scope to cooperative staff', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${outsideOrganizationId}/support-cases`)
      .set('authorization', `Bearer ${cooperativeToken}`)
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
