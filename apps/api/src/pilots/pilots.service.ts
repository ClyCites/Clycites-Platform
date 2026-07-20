import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  hasPermission,
  PERMISSIONS,
  ROLES,
  type AuthenticatedPrincipal,
  type Permission,
} from '@clycites/auth';
import {
  PHASE_EIGHT_ERROR_CODES,
  type CreatePilotInput,
  type PilotConfigurationInput,
  type TransitionPilotInput,
} from '@clycites/contracts';
import type { PilotStatus, Prisma } from '@clycites/database';

import { AuditService } from '../audit/audit.service.js';
import { DomainEventService } from '../audit/domain-event.service.js';
import { DatabaseService } from '../database/database.service.js';
import { resolvePilotTransition } from './pilot-lifecycle.js';

const ACTIVE_SCOPE_STATUSES: PilotStatus[] = [
  'APPROVED_FOR_ONBOARDING',
  'ONBOARDING',
  'TRAINING',
  'BASELINE_COLLECTION',
  'SUPERVISED_LIVE_USE',
  'ACTIVE',
];
const READY_GATE_STATUSES = ['READY', 'READY_WITH_RISK', 'NOT_APPLICABLE'] as const;
const ACTION_PERMISSION: Record<TransitionPilotInput['action'], Permission> = {
  SUBMIT_READINESS_REVIEW: PERMISSIONS.PILOT_UPDATE,
  APPROVE_ONBOARDING: PERMISSIONS.PILOT_APPROVE,
  START_ONBOARDING: PERMISSIONS.PILOT_UPDATE,
  START_TRAINING: PERMISSIONS.PILOT_UPDATE,
  START_BASELINE: PERMISSIONS.PILOT_UPDATE,
  START_SUPERVISED_USE: PERMISSIONS.PILOT_ACTIVATE,
  ACTIVATE: PERMISSIONS.PILOT_ACTIVATE,
  PAUSE: PERMISSIONS.PILOT_PAUSE,
  RESUME: PERMISSIONS.PILOT_ACTIVATE,
  COMPLETE: PERMISSIONS.PILOT_COMPLETE,
  START_EVALUATION: PERMISSIONS.PILOT_COMPLETE,
  CLOSE: PERMISSIONS.PILOT_CLOSE,
};

@Injectable()
export class PilotsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DomainEventService) private readonly events: DomainEventService,
  ) {}

  async list(principal: AuthenticatedPrincipal) {
    return this.database.client.pilot.findMany({
      where: this.organizationScope(principal),
      orderBy: [{ updatedAt: 'desc' }, { code: 'asc' }],
      include: { _count: { select: { participants: true, supportCases: true } } },
    });
  }

  async get(pilotId: string, principal: AuthenticatedPrincipal) {
    const pilot = await this.database.client.pilot.findUnique({
      where: { id: pilotId },
      include: {
        configuration: true,
        readinessGates: { orderBy: { code: 'asc' } },
        statusEvents: { orderBy: { occurredAt: 'desc' }, take: 100 },
        _count: { select: { participants: true, supportCases: true, feedback: true } },
      },
    });
    if (!pilot || !this.canAccessOrganization(principal, pilot.organizationId)) {
      throw new NotFoundException({
        code: PHASE_EIGHT_ERROR_CODES.PILOT_NOT_FOUND,
        message: 'Pilot not found',
      });
    }
    return pilot;
  }

  async create(input: CreatePilotInput, principal: AuthenticatedPrincipal, requestId: string) {
    this.assertOrganizationAccess(principal, input.organizationId);
    const id = randomUUID();
    return this.database.client.$transaction(async (transaction) => {
      const pilot = await transaction.pilot.create({
        data: {
          id,
          publicId: `pilot_${randomUUID().replaceAll('-', '')}`,
          ...input,
          plannedStartDate: new Date(input.plannedStartDate),
          plannedEndDate: new Date(input.plannedEndDate),
          createdByUserId: principal.subjectId,
          statusEvents: {
            create: {
              toStatus: 'DRAFT',
              actorUserId: principal.subjectId,
              evidence: { source: 'pilot.create' },
            },
          },
        },
      });
      await this.recordMutation(
        transaction,
        pilot,
        principal.subjectId,
        requestId,
        'PILOT_CREATED',
      );
      return pilot;
    });
  }

  async transition(
    pilotId: string,
    input: TransitionPilotInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    if (!hasPermission(principal, ACTION_PERMISSION[input.action]))
      throw new ForbiddenException('Permission denied');
    return this.database.client.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${pilotId}, 0)) IS NULL AS "locked"`;
      const pilot = await transaction.pilot.findUnique({ where: { id: pilotId } });
      if (!pilot || !this.canAccessOrganization(principal, pilot.organizationId)) {
        throw new NotFoundException({
          code: PHASE_EIGHT_ERROR_CODES.PILOT_NOT_FOUND,
          message: 'Pilot not found',
        });
      }
      if (pilot.version !== input.version) {
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          message: 'Pilot was updated by another request',
        });
      }
      const nextStatus = resolvePilotTransition(pilot.status, input.action);
      if (!nextStatus) {
        throw new ConflictException({
          code: PHASE_EIGHT_ERROR_CODES.PILOT_INVALID_STATE_TRANSITION,
          message: `Cannot ${input.action} from ${pilot.status}`,
        });
      }
      await this.assertTransitionGuards(transaction, pilot, nextStatus);
      const now = new Date();
      const updated = await transaction.pilot.update({
        where: { id: pilot.id },
        data: {
          status: nextStatus,
          version: { increment: 1 },
          ...(input.action === 'APPROVE_ONBOARDING'
            ? { approvedByUserId: principal.subjectId, approvedAt: now }
            : {}),
          ...(input.action === 'PAUSE'
            ? { readOnly: true, pausedAt: now, pauseReason: input.reason ?? 'Pilot paused' }
            : {}),
          ...(input.action === 'RESUME'
            ? { readOnly: false, pausedAt: null, pauseReason: null }
            : {}),
          ...(input.action === 'COMPLETE'
            ? { readOnly: true, completedAt: now, actualEndDate: now }
            : {}),
          ...(input.action === 'START_SUPERVISED_USE' && !pilot.actualStartDate
            ? { actualStartDate: now }
            : {}),
          statusEvents: {
            create: {
              fromStatus: pilot.status,
              toStatus: nextStatus,
              actorUserId: principal.subjectId,
              ...(input.reason ? { reason: input.reason } : {}),
              evidence: input.evidence as Prisma.InputJsonObject,
            },
          },
        },
      });
      await this.recordMutation(
        transaction,
        updated,
        principal.subjectId,
        requestId,
        'PILOT_STATUS_CHANGED',
        {
          fromStatus: pilot.status,
          toStatus: nextStatus,
          action: input.action,
        },
      );
      return updated;
    });
  }

  async configure(
    pilotId: string,
    input: PilotConfigurationInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const pilot = await this.database.client.pilot.findUnique({ where: { id: pilotId } });
    if (!pilot || !this.canAccessOrganization(principal, pilot.organizationId)) {
      throw new NotFoundException({
        code: PHASE_EIGHT_ERROR_CODES.PILOT_NOT_FOUND,
        message: 'Pilot not found',
      });
    }
    if (pilot.readOnly)
      throw new ConflictException({
        code: PHASE_EIGHT_ERROR_CODES.PILOT_INVALID_STATE_TRANSITION,
        message: 'Pilot is read-only',
      });
    const disabledGlobalFlags = await this.database.client.featureFlag.findMany({
      where: {
        key: { in: input.enabledFeatureFlags },
        scope: 'PLATFORM',
        highRisk: true,
        enabled: false,
      },
      select: { key: true },
    });
    if (disabledGlobalFlags.length > 0) {
      throw new ConflictException({
        code: PHASE_EIGHT_ERROR_CODES.PILOT_NON_WAIVABLE_BLOCKER,
        message: 'Pilot configuration cannot override disabled global controls',
      });
    }
    return this.database.client.$transaction(async (transaction) => {
      const data = {
        allowedCommodityFormIds: input.allowedCommodityFormIds,
        enabledFeatureFlags: input.enabledFeatureFlags,
        languages: input.languages,
        supportHours: input.supportHours,
        baselinePeriodStart: new Date(input.baselinePeriodStart),
        baselinePeriodEnd: new Date(input.baselinePeriodEnd),
        activeUsePeriodStart: new Date(input.activeUsePeriodStart),
        activeUsePeriodEnd: new Date(input.activeUsePeriodEnd),
        evaluationPeriodStart: new Date(input.evaluationPeriodStart),
        evaluationPeriodEnd: new Date(input.evaluationPeriodEnd),
        dataRetentionPolicyId: input.dataRetentionPolicyId ?? null,
        offlineSnapshotLimit: input.offlineSnapshotLimit,
        maxSynchronizationBatch: input.maxSynchronizationBatch,
        incidentContacts: input.incidentContacts,
        escalationPolicy: input.escalationPolicy as Prisma.InputJsonObject,
        changedByUserId: principal.subjectId,
      };
      const configuration = await transaction.pilotConfiguration.upsert({
        where: { pilotId },
        update: data,
        create: { pilotId, ...data },
      });
      await this.audit.create(
        {
          organizationId: pilot.organizationId,
          actorUserId: principal.subjectId,
          action: 'PILOT_CONFIGURATION_CHANGED',
          entityType: 'PILOT_CONFIGURATION',
          entityId: configuration.id,
          requestId,
          metadata: { pilotId },
        },
        transaction,
      );
      return configuration;
    });
  }

  private async assertTransitionGuards(
    transaction: Prisma.TransactionClient,
    pilot: {
      id: string;
      organizationId: string;
      region: string;
      district: string;
      approvedAt: Date | null;
    },
    nextStatus: PilotStatus,
  ) {
    if (ACTIVE_SCOPE_STATUSES.includes(nextStatus)) {
      const overlap = await transaction.pilot.findFirst({
        where: {
          id: { not: pilot.id },
          organizationId: pilot.organizationId,
          region: pilot.region,
          district: pilot.district,
          status: { in: ACTIVE_SCOPE_STATUSES },
        },
      });
      if (overlap)
        throw new ConflictException({
          code: PHASE_EIGHT_ERROR_CODES.PILOT_OVERLAPPING_SCOPE,
          message: 'Another pilot controls this active scope',
        });
    }
    if (['SUPERVISED_LIVE_USE', 'ACTIVE'].includes(nextStatus)) {
      if (!pilot.approvedAt)
        throw new ConflictException({
          code: PHASE_EIGHT_ERROR_CODES.PILOT_APPROVAL_REQUIRED,
          message: 'Human onboarding approval is required',
        });
      const [blockingGates, blockingIncidents, incompleteTraining, baselineCount] =
        await Promise.all([
          transaction.pilotReadinessGate.count({
            where: {
              OR: [{ pilotId: null }, { pilotId: pilot.id }],
              blocking: true,
              status: { notIn: [...READY_GATE_STATUSES] },
            },
          }),
          transaction.operationalIncident.count({
            where: {
              organizationId: pilot.organizationId,
              severity: { in: ['SEV1', 'SEV2'] },
              status: { notIn: ['RESOLVED', 'CLOSED'] },
            },
          }),
          transaction.trainingAssignment.count({
            where: {
              pilotId: pilot.id,
              participant: { trainingRequired: true, status: { in: ['ENROLLED', 'ACTIVE'] } },
              status: { notIn: ['COMPLETED', 'WAIVED'] },
            },
          }),
          transaction.pilotBaselineMetric.count({
            where: { pilotId: pilot.id, verifiedAt: { not: null } },
          }),
        ]);
      if (blockingGates > 0 || blockingIncidents > 0) {
        throw new ConflictException({
          code: PHASE_EIGHT_ERROR_CODES.PILOT_BLOCKING_READINESS_GATES,
          message: 'Blocking readiness evidence or incidents remain',
        });
      }
      if (incompleteTraining > 0)
        throw new ConflictException({
          code: PHASE_EIGHT_ERROR_CODES.TRAINING_REQUIRED,
          message: 'Required participant training is incomplete',
        });
      if (baselineCount === 0)
        throw new ConflictException({
          code: PHASE_EIGHT_ERROR_CODES.BASELINE_REQUIRED,
          message: 'At least one verified baseline metric is required',
        });
    }
  }

  private async recordMutation(
    transaction: Prisma.TransactionClient,
    pilot: { id: string; organizationId: string; status: PilotStatus },
    actorUserId: string,
    requestId: string,
    action: string,
    metadata: Prisma.InputJsonObject = {},
  ) {
    await this.audit.create(
      {
        organizationId: pilot.organizationId,
        actorUserId,
        action,
        entityType: 'PILOT',
        entityId: pilot.id,
        requestId,
        metadata,
      },
      transaction,
    );
    await this.events.create(
      {
        aggregateType: 'PILOT',
        aggregateId: pilot.id,
        eventType: action,
        payload: { organizationId: pilot.organizationId, status: pilot.status, ...metadata },
      },
      transaction,
    );
  }

  private organizationScope(principal: AuthenticatedPrincipal): Prisma.PilotWhereInput {
    if (principal.roles.includes(ROLES.PLATFORM_ADMIN)) return {};
    return {
      organizationId: {
        in: principal.organizations?.map((organization) => organization.organizationId) ?? [],
      },
    };
  }

  private canAccessOrganization(principal: AuthenticatedPrincipal, organizationId: string) {
    return (
      principal.roles.includes(ROLES.PLATFORM_ADMIN) ||
      principal.organizations?.some(
        (organization) => organization.organizationId === organizationId,
      ) === true
    );
  }

  private assertOrganizationAccess(principal: AuthenticatedPrincipal, organizationId: string) {
    if (!this.canAccessOrganization(principal, organizationId))
      throw new ForbiddenException('Permission denied');
  }
}
