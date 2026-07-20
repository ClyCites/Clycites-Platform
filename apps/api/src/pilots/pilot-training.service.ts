import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ROLES, type AuthenticatedPrincipal } from '@clycites/auth';
import { PHASE_EIGHT_ERROR_CODES, type CreateTrainingModuleInput } from '@clycites/contracts';

import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class PilotTrainingService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  modules() {
    return this.database.client.trainingModule.findMany({
      orderBy: [{ code: 'asc' }, { language: 'asc' }, { version: 'desc' }],
    });
  }

  createModule(input: CreateTrainingModuleInput) {
    return this.database.client.trainingModule.create({
      data: { ...input, passingScore: input.passingScore ?? null, status: 'DRAFT' },
    });
  }

  async assign(
    pilotId: string,
    participantId: string,
    trainingModuleId: string,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const participant = await this.database.client.pilotParticipant.findFirst({
      where: { id: participantId, pilotId },
      include: { pilot: true },
    });
    if (!participant) throw new NotFoundException('Pilot participant not found');
    this.assertOrganizationAccess(participant.pilot.organizationId, principal);
    const module = await this.database.client.trainingModule.findUnique({
      where: { id: trainingModuleId },
    });
    if (!module || module.audience !== participant.participantType)
      throw new ConflictException({
        code: PHASE_EIGHT_ERROR_CODES.PILOT_PARTICIPANT_NOT_ELIGIBLE,
        message: 'Training module does not match participant audience',
      });
    return this.database.client.$transaction(async (transaction) => {
      const assignment = await transaction.trainingAssignment.create({
        data: { pilotId, participantId, trainingModuleId },
      });
      await this.audit.create(
        {
          organizationId: participant.pilot.organizationId,
          actorUserId: principal.subjectId,
          action: 'PILOT_TRAINING_ASSIGNED',
          entityType: 'TRAINING_ASSIGNMENT',
          entityId: assignment.id,
          requestId,
          metadata: { pilotId, trainingModuleId },
        },
        transaction,
      );
      return assignment;
    });
  }

  async complete(
    assignmentId: string,
    score: number | undefined,
    notes: string | undefined,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const assignment = await this.database.client.trainingAssignment.findUnique({
      where: { id: assignmentId },
      include: { trainingModule: true, pilot: true },
    });
    if (!assignment) throw new NotFoundException('Training assignment not found');
    this.assertOrganizationAccess(assignment.pilot.organizationId, principal);
    const passed =
      !assignment.trainingModule.requiresAssessment ||
      (score !== undefined && score >= (assignment.trainingModule.passingScore ?? 100));
    const completed = await this.database.client.$transaction(async (transaction) => {
      const completed = await transaction.trainingAssignment.update({
        where: { id: assignment.id },
        data: {
          status: passed ? 'COMPLETED' : 'FAILED',
          completedAt: new Date(),
          score: score ?? null,
          attemptCount: { increment: 1 },
          verifiedByUserId: principal.subjectId,
          ...(notes ? { notes } : {}),
        },
      });
      if (passed)
        await transaction.pilotParticipant.update({
          where: { id: assignment.participantId },
          data: { trainingCompletedAt: new Date() },
        });
      await this.audit.create(
        {
          organizationId: assignment.pilot.organizationId,
          actorUserId: principal.subjectId,
          action: passed ? 'PILOT_TRAINING_COMPLETED' : 'PILOT_TRAINING_FAILED',
          entityType: 'TRAINING_ASSIGNMENT',
          entityId: assignment.id,
          requestId,
          metadata: { pilotId: assignment.pilotId, score: score ?? null },
        },
        transaction,
      );
      return completed;
    });
    if (!passed)
      throw new ConflictException({
        code: PHASE_EIGHT_ERROR_CODES.TRAINING_PASSING_SCORE_NOT_MET,
        message: 'Training passing score was not met',
        assignment: completed,
      });
    return completed;
  }

  async waive(
    assignmentId: string,
    reason: string,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const assignment = await this.database.client.trainingAssignment.findUnique({
      where: { id: assignmentId },
      include: { pilot: true },
    });
    if (!assignment) throw new NotFoundException('Training assignment not found');
    this.assertOrganizationAccess(assignment.pilot.organizationId, principal);
    return this.database.client.$transaction(async (transaction) => {
      const waived = await transaction.trainingAssignment.update({
        where: { id: assignment.id },
        data: {
          status: 'WAIVED',
          completedAt: new Date(),
          verifiedByUserId: principal.subjectId,
          waiverReason: reason,
        },
      });
      await this.audit.create(
        {
          organizationId: assignment.pilot.organizationId,
          actorUserId: principal.subjectId,
          action: 'PILOT_TRAINING_WAIVED',
          entityType: 'TRAINING_ASSIGNMENT',
          entityId: assignment.id,
          requestId,
          metadata: { pilotId: assignment.pilotId, reason },
        },
        transaction,
      );
      return waived;
    });
  }

  private assertOrganizationAccess(organizationId: string, principal: AuthenticatedPrincipal) {
    if (
      !principal.roles.includes(ROLES.PLATFORM_ADMIN) &&
      !principal.organizations?.some(
        (organization) => organization.organizationId === organizationId,
      )
    ) {
      throw new NotFoundException('Training assignment not found');
    }
  }
}
