import { createHash } from 'node:crypto';

import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ROLES, type AuthenticatedPrincipal } from '@clycites/auth';
import { PHASE_EIGHT_ERROR_CODES, type CreatePilotDecisionInput } from '@clycites/contracts';
import type { Pilot, PilotStatus, Prisma } from '@clycites/database';

import { AuditService } from '../audit/audit.service.js';
import { DomainEventService } from '../audit/domain-event.service.js';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class PilotEvaluationService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DomainEventService) private readonly events: DomainEventService,
  ) {}

  async evaluation(pilotId: string, principal: AuthenticatedPrincipal) {
    const pilot = await this.accessiblePilot(pilotId, principal);
    const evidence = await this.evidenceSnapshot(pilot);
    const evidenceSnapshotHash = this.hashEvidence(pilot, evidence);
    const decisions = await this.database.client.pilotDecision.findMany({
      where: { pilotId },
      orderBy: { decisionVersion: 'desc' },
    });
    return {
      generatedAt: new Date().toISOString(),
      automatedDecision: null,
      pilot,
      evidence,
      evidenceSnapshotHash,
      decisions,
    };
  }

  private async evidenceSnapshot(pilot: Pilot) {
    const pilotId = pilot.id;
    const [baselines, metrics, feedback, support, incidents] = await Promise.all([
      this.database.client.pilotBaselineMetric.count({
        where: { pilotId, verifiedAt: { not: null } },
      }),
      this.database.client.pilotMetricObservation.groupBy({
        by: ['dataQuality', 'reviewStatus'],
        where: { pilotId },
        orderBy: [{ dataQuality: 'asc' }, { reviewStatus: 'asc' }],
        _count: true,
      }),
      this.database.client.pilotFeedback.groupBy({
        by: ['category', 'status'],
        where: { pilotId },
        orderBy: [{ category: 'asc' }, { status: 'asc' }],
        _count: true,
      }),
      this.database.client.pilotSupportCase.groupBy({
        by: ['priority', 'status'],
        where: { pilotId },
        orderBy: [{ priority: 'asc' }, { status: 'asc' }],
        _count: true,
      }),
      this.database.client.operationalIncident.findMany({
        where: { organizationId: pilot.organizationId, status: { notIn: ['RESOLVED', 'CLOSED'] } },
        select: { incidentNumber: true, severity: true, status: true },
        orderBy: { incidentNumber: 'asc' },
      }),
    ]);
    return {
      verifiedBaselineCount: baselines,
      metricQuality: metrics,
      feedback,
      support,
      openIncidents: incidents,
    };
  }

  async createDecision(
    pilotId: string,
    input: CreatePilotDecisionInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const pilot = await this.accessiblePilot(pilotId, principal);
    if (pilot.status !== 'EVALUATING')
      throw new ConflictException({
        code: PHASE_EIGHT_ERROR_CODES.PILOT_INVALID_STATE_TRANSITION,
        message: 'Pilot must be evaluating before a decision is recorded',
      });
    const currentEvidenceHash = this.hashEvidence(pilot, await this.evidenceSnapshot(pilot));
    if (input.evidenceSnapshotHash !== currentEvidenceHash)
      throw new ConflictException({
        code: PHASE_EIGHT_ERROR_CODES.PILOT_DECISION_EVIDENCE_INCOMPLETE,
        message: 'Decision evidence snapshot does not match current pilot evidence',
      });
    const latest = await this.database.client.pilotDecision.findFirst({
      where: { pilotId },
      orderBy: { decisionVersion: 'desc' },
    });
    return this.database.client.$transaction(async (transaction) => {
      const decision = await transaction.pilotDecision.create({
        data: {
          pilotId,
          decision: input.decision,
          decisionVersion: (latest?.decisionVersion ?? 0) + 1,
          summary: input.summary,
          evidenceSnapshotHash: input.evidenceSnapshotHash,
          strengths: input.strengths,
          risks: input.risks,
          blockingIssues: input.blockingIssues,
          conditions: input.conditions,
          decidedByUserId: principal.subjectId,
          ...(input.nextReviewAt ? { nextReviewAt: new Date(input.nextReviewAt) } : {}),
        },
      });
      await this.audit.create(
        {
          organizationId: pilot.organizationId,
          actorUserId: principal.subjectId,
          action: 'PILOT_DECISION_RECORDED',
          entityType: 'PILOT_DECISION',
          entityId: decision.id,
          requestId,
          metadata: { pilotId, decision: input.decision, approved: false },
        },
        transaction,
      );
      return decision;
    });
  }

  async decisions(pilotId: string, principal: AuthenticatedPrincipal) {
    await this.accessiblePilot(pilotId, principal);
    return this.database.client.pilotDecision.findMany({
      where: { pilotId },
      orderBy: { decisionVersion: 'desc' },
    });
  }

  async decision(pilotId: string, decisionId: string, principal: AuthenticatedPrincipal) {
    await this.accessiblePilot(pilotId, principal);
    const decision = await this.database.client.pilotDecision.findFirst({
      where: { id: decisionId, pilotId },
    });
    if (!decision) throw new NotFoundException('Pilot decision not found');
    return decision;
  }

  async approveDecision(
    pilotId: string,
    decisionVersion: number,
    evidenceSnapshotHash: string,
    approvalNote: string,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const pilot = await this.accessiblePilot(pilotId, principal);
    const source = await this.database.client.pilotDecision.findUnique({
      where: { pilotId_decisionVersion: { pilotId, decisionVersion } },
    });
    if (!source) throw new NotFoundException('Pilot decision not found');
    if (source.decidedByUserId === principal.subjectId)
      throw new ConflictException({
        code: PHASE_EIGHT_ERROR_CODES.PILOT_DECISION_APPROVAL_REQUIRED,
        message: 'Decision maker and approver must be different people',
      });
    if (source.evidenceSnapshotHash !== evidenceSnapshotHash)
      throw new ConflictException({
        code: PHASE_EIGHT_ERROR_CODES.PILOT_DECISION_EVIDENCE_INCOMPLETE,
        message: 'Evidence snapshot changed before approval',
      });
    const currentEvidenceHash = this.hashEvidence(pilot, await this.evidenceSnapshot(pilot));
    if (source.evidenceSnapshotHash !== currentEvidenceHash)
      throw new ConflictException({
        code: PHASE_EIGHT_ERROR_CODES.PILOT_DECISION_EVIDENCE_INCOMPLETE,
        message: 'Pilot evidence changed before approval',
      });
    const targetStatus: PilotStatus =
      source.decision === 'GO'
        ? 'GO'
        : source.decision === 'CONDITIONAL_GO'
          ? 'CONDITIONAL_GO'
          : source.decision === 'NO_GO'
            ? 'NO_GO'
            : source.decision === 'PAUSE'
              ? 'PAUSED'
              : 'READINESS_REVIEW';
    return this.database.client.$transaction(async (transaction) => {
      const latest = await transaction.pilotDecision.findFirst({
        where: { pilotId },
        orderBy: { decisionVersion: 'desc' },
      });
      const approved = await transaction.pilotDecision.create({
        data: {
          pilotId,
          decision: source.decision,
          decisionVersion: (latest?.decisionVersion ?? 0) + 1,
          summary: source.summary,
          evidenceSnapshotHash: source.evidenceSnapshotHash,
          strengths: source.strengths as Prisma.InputJsonValue,
          risks: source.risks as Prisma.InputJsonValue,
          blockingIssues: source.blockingIssues as Prisma.InputJsonValue,
          conditions: source.conditions as Prisma.InputJsonValue,
          decidedByUserId: source.decidedByUserId,
          approvedByUserId: principal.subjectId,
          approvedAt: new Date(),
          ...(source.nextReviewAt ? { nextReviewAt: source.nextReviewAt } : {}),
        },
      });
      const updated = await transaction.pilot.update({
        where: { id: pilotId },
        data: {
          status: targetStatus,
          readOnly: ['PAUSED', 'NO_GO'].includes(targetStatus),
          version: { increment: 1 },
          ...(targetStatus === 'PAUSED' ? { pausedAt: new Date(), pauseReason: approvalNote } : {}),
          statusEvents: {
            create: {
              fromStatus: pilot.status,
              toStatus: targetStatus,
              actorUserId: principal.subjectId,
              reason: approvalNote,
              evidence: { decisionId: approved.id, evidenceSnapshotHash },
            },
          },
        },
      });
      await this.audit.create(
        {
          organizationId: pilot.organizationId,
          actorUserId: principal.subjectId,
          action: 'PILOT_DECISION_APPROVED',
          entityType: 'PILOT_DECISION',
          entityId: approved.id,
          requestId,
          metadata: { pilotId, decision: source.decision, sourceDecisionId: source.id },
        },
        transaction,
      );
      await this.events.create(
        {
          aggregateType: 'PILOT',
          aggregateId: pilotId,
          eventType: 'PILOT_DECISION_APPROVED',
          payload: {
            organizationId: pilot.organizationId,
            decision: source.decision,
            status: updated.status,
          },
        },
        transaction,
      );
      return approved;
    });
  }

  private async accessiblePilot(pilotId: string, principal: AuthenticatedPrincipal) {
    const pilot = await this.database.client.pilot.findUnique({ where: { id: pilotId } });
    if (
      !pilot ||
      (principal.platformRole !== ROLES.PLATFORM_ADMIN &&
        !principal.memberships.has(pilot.organizationId))
    )
      throw new NotFoundException('Pilot not found');
    return pilot;
  }

  private hashEvidence(pilot: Pilot, evidence: object) {
    return `sha256:${createHash('sha256')
      .update(
        JSON.stringify({
          pilotId: pilot.id,
          pilotVersion: pilot.version,
          status: pilot.status,
          evidence,
        }),
      )
      .digest('hex')}`;
  }
}
