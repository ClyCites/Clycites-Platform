import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ROLES, type AuthenticatedPrincipal } from '@clycites/auth';
import {
  PHASE_EIGHT_ERROR_CODES,
  type RecalculatePilotMetricsInput,
  type RecordPilotBaselineInput,
  type ReviewMetricObservationInput,
  type SubmitPublicPilotFeedbackInput,
} from '@clycites/contracts';
import type { Prisma } from '@clycites/database';

import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class PilotEvidenceService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async overview(pilotId: string, principal: AuthenticatedPrincipal) {
    const pilot = await this.accessiblePilot(pilotId, principal);
    const [baselines, observations, feedback, supportCases] = await Promise.all([
      this.database.client.pilotBaselineMetric.findMany({
        where: { pilotId },
        orderBy: { createdAt: 'desc' },
      }),
      this.database.client.pilotMetricObservation.findMany({
        where: { pilotId },
        orderBy: { periodEnd: 'desc' },
      }),
      this.database.client.pilotFeedback.findMany({
        where: { pilotId },
        orderBy: { submittedAt: 'desc' },
      }),
      this.database.client.pilotSupportCase.findMany({
        where: { pilotId },
        orderBy: { openedAt: 'desc' },
      }),
    ]);
    return { pilotId: pilot.id, baselines, observations, feedback, supportCases };
  }

  async recordBaseline(
    pilotId: string,
    input: RecordPilotBaselineInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const pilot = await this.accessiblePilot(pilotId, principal);
    const values = this.metricValues(input);
    return this.database.client.$transaction(async (transaction) => {
      const baseline = await transaction.pilotBaselineMetric.create({
        data: {
          pilotId,
          metricCode: input.metricCode,
          metricVersion: input.metricVersion,
          valueType: input.valueType,
          ...values,
          ...(input.unit ? { unit: input.unit } : {}),
          measurementPeriodStart: new Date(input.measurementPeriodStart),
          measurementPeriodEnd: new Date(input.measurementPeriodEnd),
          source: input.source,
          ...(input.evidenceReference ? { evidenceReference: input.evidenceReference } : {}),
          collectedByUserId: principal.subjectId,
        },
      });
      await this.audit.create(
        {
          organizationId: pilot.organizationId,
          actorUserId: principal.subjectId,
          action: 'PILOT_BASELINE_RECORDED',
          entityType: 'PILOT_BASELINE_METRIC',
          entityId: baseline.id,
          requestId,
          metadata: { pilotId, metricCode: input.metricCode, metricVersion: input.metricVersion },
        },
        transaction,
      );
      return baseline;
    });
  }

  async listBaselines(pilotId: string, principal: AuthenticatedPrincipal) {
    await this.accessiblePilot(pilotId, principal);
    return this.database.client.pilotBaselineMetric.findMany({
      where: { pilotId },
      orderBy: [{ metricCode: 'asc' }, { measurementPeriodEnd: 'desc' }],
    });
  }

  async verifyBaseline(
    pilotId: string,
    baselineId: string,
    verificationNote: string | undefined,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const pilot = await this.accessiblePilot(pilotId, principal);
    const baseline = await this.database.client.pilotBaselineMetric.findFirst({
      where: { id: baselineId, pilotId },
    });
    if (!baseline) throw new NotFoundException('Pilot baseline not found');
    if (baseline.collectedByUserId === principal.subjectId)
      throw new ConflictException({
        code: PHASE_EIGHT_ERROR_CODES.PILOT_APPROVAL_REQUIRED,
        message: 'Baseline collector and verifier must be different people',
      });
    if (baseline.verifiedAt) return baseline;
    return this.database.client.$transaction(async (transaction) => {
      const verified = await transaction.pilotBaselineMetric.update({
        where: { id: baselineId },
        data: { verifiedByUserId: principal.subjectId, verifiedAt: new Date() },
      });
      await this.audit.create(
        {
          organizationId: pilot.organizationId,
          actorUserId: principal.subjectId,
          action: 'PILOT_BASELINE_VERIFIED',
          entityType: 'PILOT_BASELINE_METRIC',
          entityId: baselineId,
          requestId,
          metadata: {
            pilotId,
            metricCode: baseline.metricCode,
            ...(verificationNote ? { verificationNote } : {}),
          },
        },
        transaction,
      );
      return verified;
    });
  }

  async listMetrics(pilotId: string, principal: AuthenticatedPrincipal) {
    await this.accessiblePilot(pilotId, principal);
    const [definitions, observations] = await Promise.all([
      this.database.client.pilotMetricDefinition.findMany({
        where: { active: true },
        orderBy: [{ code: 'asc' }, { metricVersion: 'desc' }],
      }),
      this.database.client.pilotMetricObservation.findMany({
        where: { pilotId },
        orderBy: { periodEnd: 'desc' },
      }),
    ]);
    return { definitions, observations };
  }

  async metric(pilotId: string, metricCode: string, principal: AuthenticatedPrincipal) {
    await this.accessiblePilot(pilotId, principal);
    const [definitions, baselines, observations] = await Promise.all([
      this.database.client.pilotMetricDefinition.findMany({
        where: { code: metricCode },
        orderBy: { metricVersion: 'desc' },
      }),
      this.database.client.pilotBaselineMetric.findMany({
        where: { pilotId, metricCode },
        orderBy: { measurementPeriodEnd: 'desc' },
      }),
      this.database.client.pilotMetricObservation.findMany({
        where: { pilotId, metricCode },
        orderBy: { periodEnd: 'desc' },
      }),
    ]);
    if (definitions.length === 0 && baselines.length === 0 && observations.length === 0)
      throw new NotFoundException('Pilot metric not found');
    return { metricCode, definitions, baselines, observations };
  }

  async recalculateMetrics(
    pilotId: string,
    input: RecalculatePilotMetricsInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const pilot = await this.accessiblePilot(pilotId, principal);
    const definitions = await this.database.client.pilotMetricDefinition.findMany({
      where: { active: true, ...(input.metricCodes ? { code: { in: input.metricCodes } } : {}) },
      orderBy: [{ code: 'asc' }, { metricVersion: 'desc' }],
    });
    const latestDefinitions = [
      ...new Map(definitions.map((definition) => [definition.code, definition])).values(),
    ];
    const periodStart = new Date(input.periodStart);
    const periodEnd = new Date(input.periodEnd);
    const participantCount = await this.database.client.pilotParticipant.count({
      where: { pilotId, status: { not: 'WITHDRAWN' } },
    });
    const created = [];
    const skipped: Array<{ metricCode: string; reason: string }> = [];

    for (const definition of latestDefinitions) {
      if (definition.code === 'critical_incident_count') {
        const value = await this.database.client.operationalIncident.count({
          where: {
            organizationId: pilot.organizationId,
            severity: { in: ['SEV1', 'SEV2'] },
            detectedAt: { gte: periodStart, lte: periodEnd },
          },
        });
        created.push(
          await this.database.client.pilotMetricObservation.create({
            data: {
              pilotId,
              metricCode: definition.code,
              metricVersion: definition.metricVersion,
              periodStart,
              periodEnd,
              valueType: 'INTEGER',
              integerValue: value,
              unit: definition.unit,
              source: 'operational_incidents',
              calculationMetadata: { calculationVersion: 1, severity: ['SEV1', 'SEV2'] },
              generatedAutomatically: true,
              dataQuality: 'HIGH',
            },
          }),
        );
      } else if (definition.code === 'support_cases_per_100_users') {
        if (participantCount === 0) {
          skipped.push({ metricCode: definition.code, reason: 'No enrolled pilot population' });
          continue;
        }
        const supportCaseCount = await this.database.client.pilotSupportCase.count({
          where: { pilotId, openedAt: { gte: periodStart, lte: periodEnd } },
        });
        created.push(
          await this.database.client.pilotMetricObservation.create({
            data: {
              pilotId,
              metricCode: definition.code,
              metricVersion: definition.metricVersion,
              periodStart,
              periodEnd,
              valueType: 'DECIMAL',
              decimalValue: ((supportCaseCount / participantCount) * 100).toFixed(6),
              unit: definition.unit,
              source: 'pilot_support_cases',
              calculationMetadata: {
                calculationVersion: 1,
                populationCount: participantCount,
                supportCaseCount,
              },
              generatedAutomatically: true,
              dataQuality: participantCount >= 20 ? 'ACCEPTABLE' : 'PARTIAL',
            },
          }),
        );
      } else {
        skipped.push({ metricCode: definition.code, reason: 'No approved automatic calculator' });
      }
    }
    await this.audit.create({
      organizationId: pilot.organizationId,
      actorUserId: principal.subjectId,
      action: 'PILOT_METRICS_RECALCULATED',
      entityType: 'PILOT',
      entityId: pilotId,
      requestId,
      metadata: {
        createdCount: created.length,
        skippedCount: skipped.length,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      },
    });
    return { created, skipped };
  }

  async reviewMetric(
    pilotId: string,
    observationId: string,
    input: ReviewMetricObservationInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const pilot = await this.accessiblePilot(pilotId, principal);
    const observation = await this.database.client.pilotMetricObservation.findFirst({
      where: { id: observationId, pilotId },
    });
    if (!observation) throw new NotFoundException('Pilot metric observation not found');
    return this.database.client.$transaction(async (transaction) => {
      const reviewed = await transaction.pilotMetricObservation.update({
        where: { id: observationId },
        data: {
          reviewStatus: input.status,
          reviewedByUserId: principal.subjectId,
          reviewedAt: new Date(),
          reviewNotes: input.notes ?? null,
        },
      });
      await this.audit.create(
        {
          organizationId: pilot.organizationId,
          actorUserId: principal.subjectId,
          action: 'PILOT_METRIC_REVIEWED',
          entityType: 'PILOT_METRIC_OBSERVATION',
          entityId: observationId,
          requestId,
          metadata: { pilotId, metricCode: observation.metricCode, status: input.status },
        },
        transaction,
      );
      return reviewed;
    });
  }

  async submitPublicFeedback(publicId: string, input: SubmitPublicPilotFeedbackInput) {
    const pilot = await this.database.client.pilot.findUnique({
      where: { publicId },
      select: { id: true, status: true },
    });
    if (!pilot || ['DRAFT', 'CLOSED'].includes(pilot.status))
      throw new NotFoundException('Pilot feedback channel not found');
    return this.database.client.pilotFeedback.create({
      data: {
        pilotId: pilot.id,
        respondentType: input.respondentType,
        category: input.category,
        rating: input.rating ?? null,
        message: input.message ?? null,
        language: input.language,
        channel: input.channel,
        anonymous: input.anonymous,
        consentToContact: input.consentToContact,
      },
    });
  }

  async listFeedback(pilotId: string, principal: AuthenticatedPrincipal) {
    await this.accessiblePilot(pilotId, principal);
    return this.database.client.pilotFeedback.findMany({
      where: { pilotId },
      orderBy: { submittedAt: 'desc' },
    });
  }

  async feedback(pilotId: string, feedbackId: string, principal: AuthenticatedPrincipal) {
    await this.accessiblePilot(pilotId, principal);
    const feedback = await this.database.client.pilotFeedback.findFirst({
      where: { id: feedbackId, pilotId },
    });
    if (!feedback) throw new NotFoundException('Pilot feedback not found');
    return feedback;
  }

  async triageFeedback(
    pilotId: string,
    feedbackId: string,
    status: 'TRIAGED' | 'IN_REVIEW',
    assignedToUserId: string | undefined,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const pilot = await this.accessiblePilot(pilotId, principal);
    const feedback = await this.database.client.pilotFeedback.findFirst({
      where: { id: feedbackId, pilotId },
    });
    if (!feedback) throw new NotFoundException('Pilot feedback not found');
    if (['RESOLVED', 'CLOSED'].includes(feedback.status))
      throw new ConflictException({
        code: PHASE_EIGHT_ERROR_CODES.SUPPORT_CASE_INVALID_STATE_TRANSITION,
        message: 'Resolved feedback cannot return to triage',
      });
    return this.database.client.$transaction(async (transaction) => {
      const updated = await transaction.pilotFeedback.update({
        where: { id: feedbackId },
        data: { status, ...(assignedToUserId ? { assignedToUserId } : {}) },
      });
      await this.audit.create(
        {
          organizationId: pilot.organizationId,
          actorUserId: principal.subjectId,
          action: 'PILOT_FEEDBACK_TRIAGED',
          entityType: 'PILOT_FEEDBACK',
          entityId: feedbackId,
          requestId,
          metadata: { pilotId, status },
        },
        transaction,
      );
      return updated;
    });
  }

  async resolveFeedback(
    pilotId: string,
    feedbackId: string,
    resolution: string,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const pilot = await this.accessiblePilot(pilotId, principal);
    const feedback = await this.database.client.pilotFeedback.findFirst({
      where: { id: feedbackId, pilotId },
    });
    if (!feedback) throw new NotFoundException('Pilot feedback not found');
    if (feedback.status === 'CLOSED')
      throw new ConflictException({
        code: PHASE_EIGHT_ERROR_CODES.SUPPORT_CASE_INVALID_STATE_TRANSITION,
        message: 'Closed feedback cannot be resolved',
      });
    return this.database.client.$transaction(async (transaction) => {
      const updated = await transaction.pilotFeedback.update({
        where: { id: feedbackId },
        data: { status: 'RESOLVED', resolution, resolvedAt: new Date() },
      });
      await this.audit.create(
        {
          organizationId: pilot.organizationId,
          actorUserId: principal.subjectId,
          action: 'PILOT_FEEDBACK_RESOLVED',
          entityType: 'PILOT_FEEDBACK',
          entityId: feedbackId,
          requestId,
          metadata: { pilotId },
        },
        transaction,
      );
      return updated;
    });
  }

  private metricValues(
    input: RecordPilotBaselineInput,
  ): Pick<
    Prisma.PilotBaselineMetricUncheckedCreateInput,
    'decimalValue' | 'integerValue' | 'textValue'
  > {
    if (input.valueType === 'DECIMAL')
      return { decimalValue: input.decimalValue, integerValue: null, textValue: null };
    if (input.valueType === 'INTEGER')
      return { decimalValue: null, integerValue: input.integerValue, textValue: null };
    return { decimalValue: null, integerValue: null, textValue: input.textValue };
  }

  private async accessiblePilot(pilotId: string, principal: AuthenticatedPrincipal) {
    const pilot = await this.database.client.pilot.findUnique({ where: { id: pilotId } });
    const allowed =
      pilot &&
      (principal.platformRole === ROLES.PLATFORM_ADMIN ||
        principal.memberships.has(pilot.organizationId));
    if (!pilot || !allowed) throw new NotFoundException('Pilot not found');
    return pilot;
  }
}
