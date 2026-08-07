import { randomUUID } from 'node:crypto';

import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ROLES, type AuthenticatedPrincipal } from '@clycites/auth';
import {
  PHASE_EIGHT_ERROR_CODES,
  type CreateSupportCaseInput,
  type EscalateSupportCaseInput,
} from '@clycites/contracts';

import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class PilotSupportService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async create(
    input: CreateSupportCaseInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const pilot = await this.accessiblePilot(input.pilotId, principal);
    return this.database.client.$transaction(async (transaction) => {
      const supportCase = await transaction.pilotSupportCase.create({
        data: {
          caseNumber: `PSC-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`,
          pilotId: pilot.id,
          organizationId: pilot.organizationId,
          ...(input.participantId ? { participantId: input.participantId } : {}),
          category: input.category,
          priority: input.priority,
          title: input.title,
          description: input.description,
          ...(input.relatedEntityType ? { relatedEntityType: input.relatedEntityType } : {}),
          ...(input.relatedEntityId ? { relatedEntityId: input.relatedEntityId } : {}),
        },
      });
      await this.audit.create(
        {
          organizationId: pilot.organizationId,
          actorUserId: principal.subjectId,
          action: 'PILOT_SUPPORT_CASE_CREATED',
          entityType: 'PILOT_SUPPORT_CASE',
          entityId: supportCase.id,
          requestId,
          metadata: { pilotId: pilot.id, priority: input.priority },
        },
        transaction,
      );
      return supportCase;
    });
  }

  async list(organizationId: string, principal: AuthenticatedPrincipal) {
    this.assertOrganizationAccess(organizationId, principal);
    return this.database.client.pilotSupportCase.findMany({
      where: { organizationId },
      orderBy: [{ status: 'asc' }, { priority: 'desc' }, { openedAt: 'desc' }],
    });
  }

  async detail(organizationId: string, caseId: string, principal: AuthenticatedPrincipal) {
    this.assertOrganizationAccess(organizationId, principal);
    const supportCase = await this.database.client.pilotSupportCase.findFirst({
      where: { id: caseId, organizationId },
    });
    if (!supportCase) throw new NotFoundException('Support case not found');
    return supportCase;
  }

  async createForOrganization(
    organizationId: string,
    input: CreateSupportCaseInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    this.assertOrganizationAccess(organizationId, principal);
    const pilot = await this.accessiblePilot(input.pilotId, principal);
    if (pilot.organizationId !== organizationId) throw new NotFoundException('Pilot not found');
    return this.create(input, principal, requestId);
  }

  async update(
    caseId: string,
    status: 'TRIAGED' | 'IN_PROGRESS' | 'WAITING_FOR_PARTICIPANT' | 'WAITING_FOR_PROVIDER',
    assignedToUserId: string | undefined,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const supportCase = await this.caseForPrincipal(caseId, principal);
    if (['RESOLVED', 'CLOSED'].includes(supportCase.status))
      throw new ConflictException({
        code: PHASE_EIGHT_ERROR_CODES.SUPPORT_CASE_INVALID_STATE_TRANSITION,
        message: 'Resolved support case cannot return to active work',
      });
    if (assignedToUserId) {
      const membership = await this.database.client.organizationMembership.findFirst({
        where: {
          organizationId: supportCase.organizationId,
          userId: assignedToUserId,
          status: 'ACTIVE',
        },
      });
      if (!membership) throw new NotFoundException('Support assignee not found');
    }
    return this.database.client.$transaction(async (transaction) => {
      const updated = await transaction.pilotSupportCase.update({
        where: { id: caseId },
        data: {
          status,
          ...(assignedToUserId ? { assignedToUserId } : {}),
          ...(supportCase.firstResponseAt ? {} : { firstResponseAt: new Date() }),
        },
      });
      await this.audit.create(
        {
          organizationId: supportCase.organizationId,
          actorUserId: principal.subjectId,
          action: 'PILOT_SUPPORT_CASE_UPDATED',
          entityType: 'PILOT_SUPPORT_CASE',
          entityId: caseId,
          requestId,
          metadata: { status },
        },
        transaction,
      );
      return updated;
    });
  }

  async resolve(
    caseId: string,
    resolutionCode: string,
    summary: string,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const supportCase = await this.caseForPrincipal(caseId, principal);
    if (supportCase.status === 'CLOSED')
      throw new ConflictException({
        code: PHASE_EIGHT_ERROR_CODES.SUPPORT_CASE_INVALID_STATE_TRANSITION,
        message: 'Closed support case cannot be resolved',
      });
    return this.database.client.$transaction(async (transaction) => {
      const resolved = await transaction.pilotSupportCase.update({
        where: { id: caseId },
        data: {
          status: 'RESOLVED',
          resolvedAt: new Date(),
          resolutionCode,
          resolutionSummary: summary,
          ...(supportCase.firstResponseAt ? {} : { firstResponseAt: new Date() }),
        },
      });
      await this.audit.create(
        {
          organizationId: supportCase.organizationId,
          actorUserId: principal.subjectId,
          action: 'PILOT_SUPPORT_CASE_RESOLVED',
          entityType: 'PILOT_SUPPORT_CASE',
          entityId: caseId,
          requestId,
          metadata: { resolutionCode },
        },
        transaction,
      );
      return resolved;
    });
  }

  async close(caseId: string, principal: AuthenticatedPrincipal, requestId: string) {
    const supportCase = await this.caseForPrincipal(caseId, principal);
    if (supportCase.status !== 'RESOLVED')
      throw new ConflictException({
        code: PHASE_EIGHT_ERROR_CODES.SUPPORT_CASE_INVALID_STATE_TRANSITION,
        message: 'Only resolved support cases can be closed',
      });
    return this.database.client.$transaction(async (transaction) => {
      const closed = await transaction.pilotSupportCase.update({
        where: { id: caseId },
        data: { status: 'CLOSED', closedAt: new Date() },
      });
      await this.audit.create(
        {
          organizationId: supportCase.organizationId,
          actorUserId: principal.subjectId,
          action: 'PILOT_SUPPORT_CASE_CLOSED',
          entityType: 'PILOT_SUPPORT_CASE',
          entityId: caseId,
          requestId,
          metadata: { pilotId: supportCase.pilotId },
        },
        transaction,
      );
      return closed;
    });
  }

  async reopen(caseId: string, principal: AuthenticatedPrincipal, requestId: string) {
    const supportCase = await this.caseForPrincipal(caseId, principal);
    if (supportCase.status !== 'CLOSED')
      throw new ConflictException({
        code: PHASE_EIGHT_ERROR_CODES.SUPPORT_CASE_INVALID_STATE_TRANSITION,
        message: 'Only closed support cases can be reopened',
      });
    return this.database.client.$transaction(async (transaction) => {
      const reopened = await transaction.pilotSupportCase.update({
        where: { id: caseId },
        data: {
          status: 'TRIAGED',
          resolvedAt: null,
          closedAt: null,
          resolutionCode: null,
          resolutionSummary: null,
        },
      });
      await this.audit.create(
        {
          organizationId: supportCase.organizationId,
          actorUserId: principal.subjectId,
          action: 'PILOT_SUPPORT_CASE_REOPENED',
          entityType: 'PILOT_SUPPORT_CASE',
          entityId: caseId,
          requestId,
          metadata: { pilotId: supportCase.pilotId },
        },
        transaction,
      );
      return reopened;
    });
  }

  async escalate(
    caseId: string,
    input: EscalateSupportCaseInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const supportCase = await this.caseForPrincipal(caseId, principal);
    if (['RESOLVED', 'CLOSED'].includes(supportCase.status))
      throw new ConflictException({
        code: PHASE_EIGHT_ERROR_CODES.SUPPORT_CASE_INVALID_STATE_TRANSITION,
        message: 'Resolved support case cannot be escalated',
      });
    if (supportCase.escalatedIncidentId)
      throw new ConflictException({
        code: PHASE_EIGHT_ERROR_CODES.SUPPORT_CASE_INVALID_STATE_TRANSITION,
        message: 'Support case is already escalated',
      });
    return this.database.client.$transaction(async (transaction) => {
      const incident = await transaction.operationalIncident.create({
        data: {
          incidentNumber: `INC-PILOT-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`,
          title: supportCase.title,
          description: supportCase.description,
          category: input.category,
          severity: input.severity,
          restricted: input.restricted,
          organizationId: supportCase.organizationId,
          detectedAt: new Date(),
          reportedByUserId: principal.subjectId,
          impactSummary: input.impactSummary,
          externalReference: supportCase.caseNumber,
        },
      });
      const escalated = await transaction.pilotSupportCase.update({
        where: { id: caseId },
        data: {
          escalatedIncidentId: incident.id,
          status: 'IN_PROGRESS',
          ...(supportCase.firstResponseAt ? {} : { firstResponseAt: new Date() }),
        },
      });
      await this.audit.create(
        {
          organizationId: supportCase.organizationId,
          actorUserId: principal.subjectId,
          action: 'PILOT_SUPPORT_CASE_ESCALATED',
          entityType: 'PILOT_SUPPORT_CASE',
          entityId: caseId,
          requestId,
          metadata: {
            pilotId: supportCase.pilotId,
            incidentId: incident.id,
            severity: incident.severity,
          },
        },
        transaction,
      );
      return { supportCase: escalated, incident };
    });
  }

  private async caseForPrincipal(caseId: string, principal: AuthenticatedPrincipal) {
    const supportCase = await this.database.client.pilotSupportCase.findUnique({
      where: { id: caseId },
    });
    if (
      !supportCase ||
      (principal.platformRole !== ROLES.PLATFORM_ADMIN &&
        !principal.memberships.has(supportCase.organizationId))
    )
      throw new NotFoundException('Support case not found');
    return supportCase;
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

  private assertOrganizationAccess(organizationId: string, principal: AuthenticatedPrincipal) {
    if (
      principal.platformRole !== ROLES.PLATFORM_ADMIN &&
      !principal.memberships.has(organizationId)
    )
      throw new NotFoundException('Organization not found');
  }
}
