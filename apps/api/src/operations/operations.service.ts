import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  can,
  PERMISSIONS,
  ROLES,
  type AuthenticatedPrincipal,
  type Permission,
} from '@clycites/auth';
import type {
  CreateDataSubjectRequestInput,
  CreateOperationalIncidentInput,
  CreatePilotReadinessGateInput,
  CreateRetentionPolicyInput,
  RecordBackupVerificationInput,
  SetFeatureFlagInput,
  TransitionPilotReadinessGateInput,
  UpdateDataSubjectRequestInput,
  UpdateOperationalIncidentInput,
} from '@clycites/contracts';
import type { Prisma } from '@clycites/database';
import { Queue } from 'bullmq';

import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { NOTIFICATION_DELIVERY_QUEUE, NOTIFICATION_DELIVER_JOB } from '../queue/queue.constants.js';

const openGateStatuses = ['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED'] as const;

@Injectable()
export class OperationsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NOTIFICATION_DELIVERY_QUEUE) private readonly notificationQueue: Queue,
  ) {}

  async overview(principal: AuthenticatedPrincipal) {
    const organizationFilter = this.organizationFilter(principal, PERMISSIONS.OPERATIONS_READ);
    const [gates, incidents, privacyRequests, backups, flags, notificationBacklog, outboxBacklog] =
      await Promise.all([
        this.database.client.pilotReadinessGate.findMany({
          orderBy: [{ blocking: 'desc' }, { code: 'asc' }],
        }),
        this.database.client.operationalIncident.findMany({
          where: organizationFilter,
          orderBy: [{ severity: 'asc' }, { detectedAt: 'desc' }],
          take: 100,
        }),
        this.database.client.dataSubjectRequest.findMany({
          where: organizationFilter,
          orderBy: { submittedAt: 'desc' },
          take: 100,
        }),
        this.database.client.backupVerificationRecord.findMany({
          orderBy: { startedAt: 'desc' },
          take: 20,
        }),
        this.database.client.featureFlag.findMany({
          where: this.featureFlagFilter(principal, PERMISSIONS.FEATURE_FLAG_READ),
          orderBy: [{ highRisk: 'desc' }, { key: 'asc' }],
        }),
        this.database.client.notificationDelivery.count({
          where: { status: { in: ['PENDING', 'QUEUED', 'FAILED'] } },
        }),
        this.database.client.outboxEvent.count({
          where: { status: { in: ['PENDING', 'PROCESSING', 'FAILED'] } },
        }),
      ]);
    const openBlockingGateCount = gates.filter(
      (gate) =>
        gate.blocking &&
        openGateStatuses.includes(gate.status as (typeof openGateStatuses)[number]),
    ).length;
    return {
      readiness: {
        ready: gates.length > 0 && openBlockingGateCount === 0,
        blockingGateCount: gates.filter((gate) => gate.blocking).length,
        openBlockingGateCount,
        evaluatedAt: new Date().toISOString(),
      },
      gates,
      incidents,
      privacyRequests,
      backups: backups.map((backup) => ({
        ...backup,
        sizeBytes: backup.sizeBytes?.toString() ?? null,
      })),
      flags,
      metrics: { notificationBacklog, outboxBacklog, activeIncidentCount: incidents.length },
    };
  }

  listReadinessGates() {
    return this.database.client.pilotReadinessGate.findMany({
      include: { statusEvents: { orderBy: { occurredAt: 'desc' }, take: 10 } },
      orderBy: [{ blocking: 'desc' }, { riskLevel: 'desc' }, { code: 'asc' }],
    });
  }

  async createReadinessGate(
    input: CreatePilotReadinessGateInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.database.client.$transaction(async (transaction) => {
      const gate = await transaction.pilotReadinessGate.create({
        data: {
          ...input,
          evidence: {},
          status: 'NOT_STARTED',
        } as Prisma.PilotReadinessGateUncheckedCreateInput,
      });
      await transaction.pilotReadinessGateStatusEvent.create({
        data: {
          readinessGateId: gate.id,
          toStatus: 'NOT_STARTED',
          actorUserId: principal.subjectId,
          evidence: {},
        },
      });
      await this.audit.create(
        {
          actorUserId: principal.subjectId,
          action: 'PILOT_READINESS_GATE_CREATED',
          entityType: 'PilotReadinessGate',
          entityId: gate.id,
          requestId,
          metadata: { code: gate.code, blocking: gate.blocking },
        },
        transaction,
      );
      return gate;
    });
  }

  async transitionReadinessGate(
    gateId: string,
    input: TransitionPilotReadinessGateInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.database.client.$transaction(async (transaction) => {
      const gate = await transaction.pilotReadinessGate.findUnique({ where: { id: gateId } });
      if (!gate) throw new NotFoundException('Readiness gate not found');
      if (gate.status === input.status)
        throw new ConflictException('Readiness gate already has this status');
      if (
        gate.humanReviewRequired &&
        ['READY', 'NOT_APPLICABLE'].includes(input.status) &&
        Object.keys(input.evidence).length === 0
      )
        throw new BadRequestException('Human-reviewed gates require recorded evidence');
      const reviewed = ['READY', 'READY_WITH_RISK', 'NOT_APPLICABLE'].includes(input.status);
      const updated = await transaction.pilotReadinessGate.update({
        where: { id: gateId },
        data: {
          status: input.status,
          evidence: input.evidence as Prisma.InputJsonObject,
          notes: input.riskNotes,
          nextReviewAt: input.nextReviewAt ? new Date(input.nextReviewAt) : null,
          reviewedByUserId: reviewed ? principal.subjectId : null,
          reviewedAt: reviewed ? new Date() : null,
        } as Prisma.PilotReadinessGateUncheckedUpdateInput,
      });
      await transaction.pilotReadinessGateStatusEvent.create({
        data: {
          readinessGateId: gateId,
          fromStatus: gate.status,
          toStatus: input.status,
          actorUserId: principal.subjectId,
          evidence: input.evidence as Prisma.InputJsonObject,
          riskNotes: input.riskNotes,
        } as Prisma.PilotReadinessGateStatusEventUncheckedCreateInput,
      });
      await this.audit.create(
        {
          actorUserId: principal.subjectId,
          action: 'PILOT_READINESS_GATE_TRANSITIONED',
          entityType: 'PilotReadinessGate',
          entityId: gateId,
          requestId,
          metadata: { fromStatus: gate.status, toStatus: input.status },
        },
        transaction,
      );
      return updated;
    });
  }

  listIncidents(principal: AuthenticatedPrincipal) {
    return this.database.client.operationalIncident.findMany({
      where: this.organizationFilter(principal, PERMISSIONS.INCIDENT_READ),
      orderBy: [{ status: 'asc' }, { severity: 'asc' }, { detectedAt: 'desc' }],
    });
  }

  async createIncident(
    input: CreateOperationalIncidentInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    this.assertOrganizationAccess(principal, input.organizationId);
    return this.database.client.$transaction(async (transaction) => {
      const sequence = await transaction.operationalIncident.count({
        where: {
          createdAt: { gte: new Date(`${new Date().getUTCFullYear()}-01-01T00:00:00.000Z`) },
        },
      });
      const incident = await transaction.operationalIncident.create({
        data: {
          ...input,
          incidentNumber: `INC-${new Date().getUTCFullYear()}-${String(sequence + 1).padStart(5, '0')}`,
          detectedAt: new Date(input.detectedAt),
          reportedByUserId: principal.subjectId,
        } as Prisma.OperationalIncidentUncheckedCreateInput,
      });
      await this.audit.create(
        {
          ...(input.organizationId ? { organizationId: input.organizationId } : {}),
          actorUserId: principal.subjectId,
          action: 'OPERATIONAL_INCIDENT_CREATED',
          entityType: 'OperationalIncident',
          entityId: incident.id,
          requestId,
          metadata: { severity: incident.severity, category: incident.category },
        },
        transaction,
      );
      return incident;
    });
  }

  async updateIncident(
    incidentId: string,
    input: UpdateOperationalIncidentInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.database.client.$transaction(async (transaction) => {
      const incident = await transaction.operationalIncident.findUnique({
        where: { id: incidentId },
      });
      if (!incident) throw new NotFoundException('Incident not found');
      this.assertOrganizationAccess(principal, incident.organizationId ?? undefined);
      const now = new Date();
      const updated = await transaction.operationalIncident.update({
        where: { id: incidentId },
        data: {
          ...input,
          acknowledgedAt:
            incident.acknowledgedAt ?? (input.status === 'ACKNOWLEDGED' ? now : undefined),
          resolvedAt: ['RESOLVED', 'CLOSED'].includes(input.status) ? now : null,
        } as Prisma.OperationalIncidentUncheckedUpdateInput,
      });
      await this.audit.create(
        {
          ...(incident.organizationId ? { organizationId: incident.organizationId } : {}),
          actorUserId: principal.subjectId,
          action: 'OPERATIONAL_INCIDENT_UPDATED',
          entityType: 'OperationalIncident',
          entityId: incidentId,
          requestId,
          metadata: { fromStatus: incident.status, toStatus: input.status },
        },
        transaction,
      );
      return updated;
    });
  }

  listPrivacyRequests(principal: AuthenticatedPrincipal) {
    return this.database.client.dataSubjectRequest.findMany({
      where: this.organizationFilter(principal, PERMISSIONS.PRIVACY_REQUEST_READ),
      orderBy: { submittedAt: 'desc' },
    });
  }

  async createPrivacyRequest(
    input: CreateDataSubjectRequestInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    this.assertOrganizationAccess(principal, input.organizationId);
    return this.database.client.$transaction(async (transaction) => {
      const request = await transaction.dataSubjectRequest.create({
        data: {
          publicId: `dsr_${crypto.randomUUID()}`,
          organizationId: input.organizationId,
          subjectType: input.subjectType,
          farmerId: input.subjectType === 'FARMER' ? input.farmerId : undefined,
          userId: input.subjectType === 'USER' ? input.userId : undefined,
          requestType: input.requestType,
          notes: input.notes,
        } as Prisma.DataSubjectRequestUncheckedCreateInput,
      });
      await this.audit.create(
        {
          ...(input.organizationId ? { organizationId: input.organizationId } : {}),
          actorUserId: principal.subjectId,
          action: 'DATA_SUBJECT_REQUEST_CREATED',
          entityType: 'DataSubjectRequest',
          entityId: request.id,
          requestId,
          metadata: { requestType: request.requestType, subjectType: request.subjectType },
        },
        transaction,
      );
      return request;
    });
  }

  async updatePrivacyRequest(
    privacyRequestId: string,
    input: UpdateDataSubjectRequestInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.database.client.$transaction(async (transaction) => {
      const existing = await transaction.dataSubjectRequest.findUnique({
        where: { id: privacyRequestId },
      });
      if (!existing) throw new NotFoundException('Privacy request not found');
      this.assertOrganizationAccess(principal, existing.organizationId ?? undefined);
      const completed = ['FULFILLED', 'PARTIALLY_FULFILLED'].includes(input.status);
      const rejected = input.status === 'REJECTED';
      const updated = await transaction.dataSubjectRequest.update({
        where: { id: privacyRequestId },
        data: {
          status: input.status,
          assignedToUserId: input.assignedToUserId,
          identityVerifiedAt: input.identityVerified ? new Date() : undefined,
          completedAt: completed ? new Date() : null,
          rejectedAt: rejected ? new Date() : null,
          rejectionReason: rejected ? input.rejectionReason : null,
          responseDocumentKey: input.responseDocumentKey,
          notes: input.notes,
        } as Prisma.DataSubjectRequestUncheckedUpdateInput,
      });
      await this.audit.create(
        {
          ...(existing.organizationId ? { organizationId: existing.organizationId } : {}),
          actorUserId: principal.subjectId,
          action: 'DATA_SUBJECT_REQUEST_UPDATED',
          entityType: 'DataSubjectRequest',
          entityId: privacyRequestId,
          requestId,
          metadata: { fromStatus: existing.status, toStatus: input.status },
        },
        transaction,
      );
      return updated;
    });
  }

  listRetentionPolicies(principal: AuthenticatedPrincipal) {
    return this.database.client.dataRetentionPolicy.findMany({
      where: this.organizationFilter(principal, PERMISSIONS.RETENTION_POLICY_READ),
      include: { dryRuns: { orderBy: { createdAt: 'desc' }, take: 5 } },
      orderBy: [{ status: 'asc' }, { dataCategory: 'asc' }, { policyVersion: 'desc' }],
    });
  }

  async createRetentionPolicy(
    input: CreateRetentionPolicyInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    this.assertOrganizationAccess(principal, input.organizationId);
    return this.database.client.$transaction(async (transaction) => {
      const policy = await transaction.dataRetentionPolicy.create({
        data: {
          ...input,
          effectiveFrom: new Date(input.effectiveFrom),
          effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : undefined,
          createdByUserId: principal.subjectId,
        } as Prisma.DataRetentionPolicyUncheckedCreateInput,
      });
      await this.audit.create(
        {
          ...(input.organizationId ? { organizationId: input.organizationId } : {}),
          actorUserId: principal.subjectId,
          action: 'DATA_RETENTION_POLICY_CREATED',
          entityType: 'DataRetentionPolicy',
          entityId: policy.id,
          requestId,
          metadata: { dataCategory: policy.dataCategory, policyVersion: policy.policyVersion },
        },
        transaction,
      );
      return policy;
    });
  }

  async retentionDryRun(policyId: string, principal: AuthenticatedPrincipal, requestId: string) {
    return this.database.client.$transaction(async (transaction) => {
      const policy = await transaction.dataRetentionPolicy.findUnique({ where: { id: policyId } });
      if (!policy) throw new NotFoundException('Retention policy not found');
      this.assertOrganizationAccess(principal, policy.organizationId ?? undefined);
      const cutoff = new Date(Date.now() - policy.retentionDays * 86_400_000);
      const immutableRecordsRetained = await transaction.auditEvent.count({
        where: {
          ...(policy.organizationId ? { organizationId: policy.organizationId } : {}),
          createdAt: { lt: cutoff },
        },
      });
      const dryRun = await transaction.dataRetentionDryRun.create({
        data: {
          dataRetentionPolicyId: policy.id,
          policyVersion: policy.policyVersion,
          immutableRecordsRetained,
          report: {
            cutoff: cutoff.toISOString(),
            destructiveExecution: false,
            dataCategory: policy.dataCategory,
            deletionMode: policy.deletionMode,
          },
        },
      });
      await this.audit.create(
        {
          ...(policy.organizationId ? { organizationId: policy.organizationId } : {}),
          actorUserId: principal.subjectId,
          action: 'DATA_RETENTION_DRY_RUN_COMPLETED',
          entityType: 'DataRetentionDryRun',
          entityId: dryRun.id,
          requestId,
          metadata: { policyId: policy.id, destructiveExecution: false },
        },
        transaction,
      );
      return { ...dryRun, estimatedStorageBytes: dryRun.estimatedStorageBytes?.toString() ?? null };
    });
  }

  listBackups() {
    return this.database.client.backupVerificationRecord
      .findMany({ orderBy: { startedAt: 'desc' }, take: 100 })
      .then((records) =>
        records.map((record) => ({
          ...record,
          sizeBytes: record.sizeBytes?.toString() ?? null,
        })),
      );
  }

  async recordBackup(
    input: RecordBackupVerificationInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.database.client.$transaction(async (transaction) => {
      const record = await transaction.backupVerificationRecord.create({
        data: {
          ...input,
          startedAt: new Date(input.startedAt),
          completedAt: input.completedAt ? new Date(input.completedAt) : undefined,
          sizeBytes: input.sizeBytes ? BigInt(input.sizeBytes) : undefined,
          retentionUntil: input.retentionUntil ? new Date(input.retentionUntil) : undefined,
          restoreTestedAt: input.restoreTestedAt ? new Date(input.restoreTestedAt) : undefined,
          verifiedByUserId: principal.subjectId,
        } as Prisma.BackupVerificationRecordUncheckedCreateInput,
      });
      await this.audit.create(
        {
          actorUserId: principal.subjectId,
          action: 'BACKUP_VERIFICATION_RECORDED',
          entityType: 'BackupVerificationRecord',
          entityId: record.id,
          requestId,
          metadata: { environment: record.environment, status: record.status },
        },
        transaction,
      );
      return { ...record, sizeBytes: record.sizeBytes?.toString() ?? null };
    });
  }

  listFeatureFlags(principal: AuthenticatedPrincipal) {
    return this.database.client.featureFlag.findMany({
      where: this.featureFlagFilter(principal, PERMISSIONS.FEATURE_FLAG_READ),
      orderBy: [{ highRisk: 'desc' }, { key: 'asc' }],
    });
  }

  async setFeatureFlag(
    input: SetFeatureFlagInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    this.assertOrganizationAccess(principal, input.organizationId);
    const existing = await this.database.client.featureFlag.findFirst({
      where: { key: input.key, organizationId: input.organizationId ?? null },
    });
    return this.database.client.$transaction(async (transaction) => {
      const flag = existing
        ? await transaction.featureFlag.update({
            where: { id: existing.id },
            data: {
              ...input,
              changedByUserId: principal.subjectId,
              changedAt: new Date(),
            } as Prisma.FeatureFlagUncheckedUpdateInput,
          })
        : await transaction.featureFlag.create({
            data: {
              ...input,
              changedByUserId: principal.subjectId,
            } as Prisma.FeatureFlagUncheckedCreateInput,
          });
      await this.audit.create(
        {
          ...(input.organizationId ? { organizationId: input.organizationId } : {}),
          actorUserId: principal.subjectId,
          action: 'FEATURE_FLAG_CHANGED',
          entityType: 'FeatureFlag',
          entityId: flag.id,
          requestId,
          metadata: { key: flag.key, enabled: flag.enabled, highRisk: flag.highRisk },
        },
        transaction,
      );
      return flag;
    });
  }

  async retryNotification(
    notificationId: string,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const notification = await this.database.client.notificationDelivery.findUnique({
      where: { id: notificationId },
    });
    if (!notification) throw new NotFoundException('Notification delivery not found');
    this.assertOrganizationAccess(principal, notification.organizationId ?? undefined);
    if (notification.status !== 'FAILED')
      throw new ConflictException('Only failed notifications can be retried');
    await this.database.client.$transaction(async (transaction) => {
      await transaction.notificationDelivery.update({
        where: { id: notificationId },
        data: { status: 'QUEUED', nextAttemptAt: new Date() },
      });
      await this.audit.create(
        {
          ...(notification.organizationId ? { organizationId: notification.organizationId } : {}),
          actorUserId: principal.subjectId,
          action: 'NOTIFICATION_RETRY_QUEUED',
          entityType: 'NotificationDelivery',
          entityId: notificationId,
          requestId,
        },
        transaction,
      );
    });
    await this.notificationQueue.add(
      NOTIFICATION_DELIVER_JOB,
      { notificationDeliveryId: notificationId },
      { jobId: `notification-${notificationId}` },
    );
    return { queued: true };
  }

  private isPlatformAdmin(principal: AuthenticatedPrincipal): boolean {
    return principal.platformRole === ROLES.PLATFORM_ADMIN;
  }

  private allowedOrganizationIds(
    principal: AuthenticatedPrincipal,
    permission?: Permission,
  ): string[] {
    const organizationIds = [...principal.memberships.keys()];
    return permission
      ? organizationIds.filter((organizationId) => can(principal, permission, organizationId))
      : organizationIds;
  }

  private assertOrganizationAccess(
    principal: AuthenticatedPrincipal,
    organizationId: string | undefined,
  ): void {
    if (this.isPlatformAdmin(principal)) return;
    if (!organizationId || !this.allowedOrganizationIds(principal).includes(organizationId))
      throw new ForbiddenException('Organization access denied');
  }

  private organizationFilter(
    principal: AuthenticatedPrincipal,
    permission: Permission,
  ): {
    organizationId?: { in: string[] };
  } {
    if (this.isPlatformAdmin(principal)) return {};
    return { organizationId: { in: this.allowedOrganizationIds(principal, permission) } };
  }

  private featureFlagFilter(
    principal: AuthenticatedPrincipal,
    permission: Permission,
  ): Prisma.FeatureFlagWhereInput {
    if (this.isPlatformAdmin(principal)) return {};
    return { organizationId: { in: this.allowedOrganizationIds(principal, permission) } };
  }
}
