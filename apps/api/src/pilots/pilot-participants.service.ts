import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ROLES, type AuthenticatedPrincipal } from '@clycites/auth';
import { PHASE_EIGHT_ERROR_CODES, type EnrollPilotParticipantInput } from '@clycites/contracts';
import type {
  AssignPilotCollectionPointInput,
  AssignPilotDeviceInput,
  UpdatePilotDeviceStatusInput,
} from '@clycites/contracts';
import { Prisma } from '@clycites/database';

import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class PilotParticipantsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(pilotId: string, principal: AuthenticatedPrincipal) {
    const pilot = await this.accessiblePilot(pilotId, principal);
    return this.database.client.pilotParticipant.findMany({
      where: { pilotId: pilot.id },
      orderBy: [{ participantType: 'asc' }, { enrolledAt: 'asc' }],
      include: { trainingAssignments: { include: { trainingModule: true } } },
    });
  }

  async enroll(
    pilotId: string,
    input: EnrollPilotParticipantInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const pilot = await this.accessiblePilot(pilotId, principal);
    if (pilot.readOnly)
      throw new ConflictException({
        code: PHASE_EIGHT_ERROR_CODES.PILOT_INVALID_STATE_TRANSITION,
        message: 'Pilot is read-only',
      });
    if (
      !principal.roles.includes(ROLES.PLATFORM_ADMIN) &&
      ['BUYER_USER', 'OBSERVER'].includes(input.participantType)
    ) {
      throw new ForbiddenException('Permission denied');
    }
    await this.assertEligible(pilot.organizationId, input);
    try {
      return await this.database.client.$transaction(async (transaction) => {
        const participant = await transaction.pilotParticipant.create({
          data: {
            pilotId,
            participantType: input.participantType,
            ...('farmerId' in input
              ? { farmerId: input.farmerId, consentVerifiedAt: new Date(input.consentVerifiedAt) }
              : {
                  userId: input.userId,
                  organizationId: input.organizationId ?? pilot.organizationId,
                }),
            ...(input.collectionPointId ? { collectionPointId: input.collectionPointId } : {}),
            status: 'ENROLLED',
            trainingRequired: input.trainingRequired,
          },
        });
        await this.audit.create(
          {
            organizationId: pilot.organizationId,
            actorUserId: principal.subjectId,
            action: 'PILOT_PARTICIPANT_ENROLLED',
            entityType: 'PILOT_PARTICIPANT',
            entityId: participant.id,
            requestId,
            metadata: { pilotId, participantType: participant.participantType },
          },
          transaction,
        );
        return participant;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: PHASE_EIGHT_ERROR_CODES.PILOT_PARTICIPANT_ALREADY_ENROLLED,
          message: 'Participant is already actively enrolled',
        });
      }
      throw error;
    }
  }

  async detail(pilotId: string, participantId: string, principal: AuthenticatedPrincipal) {
    await this.accessiblePilot(pilotId, principal);
    const participant = await this.database.client.pilotParticipant.findFirst({
      where: { id: participantId, pilotId },
      include: { trainingAssignments: { include: { trainingModule: true } } },
    });
    if (!participant) throw new NotFoundException('Pilot participant not found');
    return participant;
  }

  async update(
    pilotId: string,
    participantId: string,
    status: 'ENROLLED' | 'ACTIVE' | 'SUSPENDED' | 'COMPLETED',
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const pilot = await this.accessiblePilot(pilotId, principal);
    const participant = await this.database.client.pilotParticipant.findFirst({
      where: { id: participantId, pilotId },
    });
    if (!participant) throw new NotFoundException('Pilot participant not found');
    if (participant.status === 'WITHDRAWN')
      throw new ConflictException({
        code: PHASE_EIGHT_ERROR_CODES.PILOT_PARTICIPANT_NOT_ELIGIBLE,
        message: 'Withdrawn participants cannot be reactivated',
      });
    return this.database.client.$transaction(async (transaction) => {
      const updated = await transaction.pilotParticipant.update({
        where: { id: participantId },
        data: { status },
      });
      await this.audit.create(
        {
          organizationId: pilot.organizationId,
          actorUserId: principal.subjectId,
          action: 'PILOT_PARTICIPANT_UPDATED',
          entityType: 'PILOT_PARTICIPANT',
          entityId: participantId,
          requestId,
          metadata: { pilotId, fromStatus: participant.status, toStatus: status },
        },
        transaction,
      );
      return updated;
    });
  }

  async assignCollectionPoint(
    pilotId: string,
    input: AssignPilotCollectionPointInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const pilot = await this.accessiblePilot(pilotId, principal);
    const collectionPoint = await this.database.client.collectionPoint.findFirst({
      where: {
        id: input.collectionPointId,
        organizationId: pilot.organizationId,
        status: 'ACTIVE',
      },
    });
    if (!collectionPoint) throw new NotFoundException('Collection point not found');
    return this.database.client.$transaction(async (transaction) => {
      const assignment = await transaction.pilotCollectionPoint.upsert({
        where: {
          pilotId_collectionPointId: { pilotId, collectionPointId: input.collectionPointId },
        },
        update: {
          status: 'READY',
          ...(input.readinessNotes ? { readinessNotes: input.readinessNotes } : {}),
        },
        create: {
          pilotId,
          collectionPointId: input.collectionPointId,
          status: 'READY',
          ...(input.readinessNotes ? { readinessNotes: input.readinessNotes } : {}),
        },
      });
      await this.audit.create(
        {
          organizationId: pilot.organizationId,
          actorUserId: principal.subjectId,
          action: 'PILOT_COLLECTION_POINT_ASSIGNED',
          entityType: 'PILOT_COLLECTION_POINT',
          entityId: assignment.id,
          requestId,
          metadata: { pilotId, collectionPointId: input.collectionPointId },
        },
        transaction,
      );
      return assignment;
    });
  }

  async assignDevice(
    pilotId: string,
    input: AssignPilotDeviceInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const pilot = await this.accessiblePilot(pilotId, principal);
    const [device, user, collectionPoint] = await Promise.all([
      this.database.client.registeredDevice.findFirst({
        where: { id: input.deviceId, organizationId: pilot.organizationId, status: 'ACTIVE' },
      }),
      this.database.client.organizationMembership.findFirst({
        where: {
          userId: input.assignedUserId,
          organizationId: pilot.organizationId,
          status: 'ACTIVE',
        },
      }),
      this.database.client.pilotCollectionPoint.findFirst({
        where: {
          pilotId,
          collectionPointId: input.collectionPointId,
          status: { in: ['READY', 'ACTIVE'] },
        },
      }),
    ]);
    if (!device || !user || !collectionPoint)
      throw new ConflictException({
        code: PHASE_EIGHT_ERROR_CODES.PILOT_PARTICIPANT_NOT_ELIGIBLE,
        message: 'Device assignment is outside the ready pilot scope',
      });
    return this.database.client.$transaction(async (transaction) => {
      const assignment = await transaction.pilotDeviceAssignment.create({
        data: {
          pilotId,
          deviceId: input.deviceId,
          assignedUserId: input.assignedUserId,
          collectionPointId: input.collectionPointId,
          ...(input.conditionNotes ? { conditionNotes: input.conditionNotes } : {}),
        },
      });
      await this.audit.create(
        {
          organizationId: pilot.organizationId,
          actorUserId: principal.subjectId,
          action: 'PILOT_DEVICE_ASSIGNED',
          entityType: 'PILOT_DEVICE_ASSIGNMENT',
          entityId: assignment.id,
          requestId,
          metadata: { pilotId, deviceId: input.deviceId },
        },
        transaction,
      );
      return assignment;
    });
  }

  async updateDevice(
    pilotId: string,
    assignmentId: string,
    input: UpdatePilotDeviceStatusInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const pilot = await this.accessiblePilot(pilotId, principal);
    const assignment = await this.database.client.pilotDeviceAssignment.findFirst({
      where: { id: assignmentId, pilotId },
    });
    if (!assignment) throw new NotFoundException('Pilot device assignment not found');
    return this.database.client.$transaction(async (transaction) => {
      const updated = await transaction.pilotDeviceAssignment.update({
        where: { id: assignmentId },
        data: {
          status: input.status,
          ...(input.conditionNotes ? { conditionNotes: input.conditionNotes } : {}),
          ...(input.status === 'RETURNED' ? { returnedAt: new Date() } : {}),
        },
      });
      await this.audit.create(
        {
          organizationId: pilot.organizationId,
          actorUserId: principal.subjectId,
          action: 'PILOT_DEVICE_STATUS_UPDATED',
          entityType: 'PILOT_DEVICE_ASSIGNMENT',
          entityId: assignmentId,
          requestId,
          metadata: { pilotId, fromStatus: assignment.status, toStatus: input.status },
        },
        transaction,
      );
      return updated;
    });
  }

  async withdraw(
    pilotId: string,
    participantId: string,
    reason: string,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const pilot = await this.accessiblePilot(pilotId, principal);
    const participant = await this.database.client.pilotParticipant.findFirst({
      where: { id: participantId, pilotId },
    });
    if (!participant) throw new NotFoundException('Pilot participant not found');
    return this.database.client.$transaction(async (transaction) => {
      const withdrawn = await transaction.pilotParticipant.update({
        where: { id: participant.id },
        data: { status: 'WITHDRAWN', withdrawnAt: new Date(), withdrawalReason: reason },
      });
      await this.audit.create(
        {
          organizationId: pilot.organizationId,
          actorUserId: principal.subjectId,
          action: 'PILOT_PARTICIPANT_WITHDRAWN',
          entityType: 'PILOT_PARTICIPANT',
          entityId: participant.id,
          requestId,
          metadata: { pilotId, reason },
        },
        transaction,
      );
      return withdrawn;
    });
  }

  private async assertEligible(organizationId: string, input: EnrollPilotParticipantInput) {
    const eligible =
      'farmerId' in input
        ? await this.database.client.farmerOrganizationMembership.findFirst({
            where: { farmerId: input.farmerId, organizationId, status: 'ACTIVE' },
          })
        : await this.database.client.organizationMembership.findFirst({
            where: {
              userId: input.userId,
              organizationId: input.organizationId ?? organizationId,
              status: 'ACTIVE',
            },
          });
    if (!eligible)
      throw new ConflictException({
        code: PHASE_EIGHT_ERROR_CODES.PILOT_PARTICIPANT_NOT_ELIGIBLE,
        message: 'Participant is not eligible for this pilot scope',
      });
  }

  private async accessiblePilot(pilotId: string, principal: AuthenticatedPrincipal) {
    const pilot = await this.database.client.pilot.findUnique({ where: { id: pilotId } });
    const allowed =
      pilot &&
      (principal.roles.includes(ROLES.PLATFORM_ADMIN) ||
        principal.organizations?.some(
          (organization) => organization.organizationId === pilot.organizationId,
        ));
    if (!allowed || !pilot)
      throw new NotFoundException({
        code: PHASE_EIGHT_ERROR_CODES.PILOT_NOT_FOUND,
        message: 'Pilot not found',
      });
    return pilot;
  }
}
