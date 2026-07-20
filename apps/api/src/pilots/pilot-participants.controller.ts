import { Body, Controller, Get, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedPrincipal } from '@clycites/auth';
import {
  assignPilotCollectionPointSchema,
  assignPilotDeviceSchema,
  assignTrainingSchema,
  completeTrainingSchema,
  createTrainingModuleSchema,
  enrollPilotParticipantSchema,
  updatePilotDeviceStatusSchema,
  updatePilotParticipantSchema,
  waiveTrainingSchema,
  withdrawPilotParticipantSchema,
} from '@clycites/contracts';

import { parseWithSchema } from '../common/validation.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentPrincipal, RequirePermissions } from '../identity/identity.decorators.js';
import { PermissionsGuard } from '../identity/permissions.guard.js';
import type { AuthenticatedRequest } from '../observability/request-context.js';
import { PilotParticipantsService } from './pilot-participants.service.js';
import { PilotTrainingService } from './pilot-training.service.js';

@ApiTags('Pilot onboarding and training')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, PermissionsGuard)
@Controller()
export class PilotParticipantsController {
  constructor(
    @Inject(PilotParticipantsService) private readonly participants: PilotParticipantsService,
    @Inject(PilotTrainingService) private readonly training: PilotTrainingService,
  ) {}

  @Get('pilots/:pilotId/participants')
  @RequirePermissions(PERMISSIONS.PILOT_PARTICIPANT_READ)
  list(@Param('pilotId') pilotId: string, @CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.participants.list(pilotId, principal);
  }

  @Post('pilots/:pilotId/participants')
  @RequirePermissions(PERMISSIONS.PILOT_PARTICIPANT_ENROLL)
  enroll(
    @Param('pilotId') pilotId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.participants.enroll(
      pilotId,
      parseWithSchema(enrollPilotParticipantSchema, body),
      principal,
      request.requestId,
    );
  }

  @Get('pilots/:pilotId/participants/:participantId')
  @RequirePermissions(PERMISSIONS.PILOT_PARTICIPANT_READ)
  detail(
    @Param('pilotId') pilotId: string,
    @Param('participantId') participantId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.participants.detail(pilotId, participantId, principal);
  }

  @Patch('pilots/:pilotId/participants/:participantId')
  @RequirePermissions(PERMISSIONS.PILOT_PARTICIPANT_UPDATE)
  update(
    @Param('pilotId') pilotId: string,
    @Param('participantId') participantId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = parseWithSchema(updatePilotParticipantSchema, body);
    return this.participants.update(
      pilotId,
      participantId,
      input.status,
      principal,
      request.requestId,
    );
  }

  @Post('pilots/:pilotId/participants/:participantId/withdraw')
  @RequirePermissions(PERMISSIONS.PILOT_PARTICIPANT_WITHDRAW)
  withdraw(
    @Param('pilotId') pilotId: string,
    @Param('participantId') participantId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = parseWithSchema(withdrawPilotParticipantSchema, body);
    return this.participants.withdraw(
      pilotId,
      participantId,
      input.reason,
      principal,
      request.requestId,
    );
  }

  @Post('pilots/:pilotId/collection-points')
  @RequirePermissions(PERMISSIONS.PILOT_PARTICIPANT_UPDATE)
  assignCollectionPoint(
    @Param('pilotId') pilotId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.participants.assignCollectionPoint(
      pilotId,
      parseWithSchema(assignPilotCollectionPointSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('pilots/:pilotId/devices')
  @RequirePermissions(PERMISSIONS.PILOT_PARTICIPANT_UPDATE)
  assignDevice(
    @Param('pilotId') pilotId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.participants.assignDevice(
      pilotId,
      parseWithSchema(assignPilotDeviceSchema, body),
      principal,
      request.requestId,
    );
  }

  @Patch('pilots/:pilotId/devices/:assignmentId')
  @RequirePermissions(PERMISSIONS.PILOT_PARTICIPANT_UPDATE)
  updateDevice(
    @Param('pilotId') pilotId: string,
    @Param('assignmentId') assignmentId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.participants.updateDevice(
      pilotId,
      assignmentId,
      parseWithSchema(updatePilotDeviceStatusSchema, body),
      principal,
      request.requestId,
    );
  }

  @Get('training/modules')
  @RequirePermissions(PERMISSIONS.TRAINING_READ)
  modules() {
    return this.training.modules();
  }

  @Post('training/modules')
  @RequirePermissions(PERMISSIONS.TRAINING_MANAGE)
  createModule(@Body() body: unknown) {
    return this.training.createModule(parseWithSchema(createTrainingModuleSchema, body));
  }

  @Post('pilots/:pilotId/training/assignments')
  @RequirePermissions(PERMISSIONS.TRAINING_ASSIGN)
  assign(
    @Param('pilotId') pilotId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = parseWithSchema(assignTrainingSchema, body);
    return this.training.assign(
      pilotId,
      input.participantId,
      input.trainingModuleId,
      principal,
      request.requestId,
    );
  }

  @Post('training/assignments/:assignmentId/complete')
  @RequirePermissions(PERMISSIONS.TRAINING_COMPLETE)
  complete(
    @Param('assignmentId') assignmentId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = parseWithSchema(completeTrainingSchema, body);
    return this.training.complete(
      assignmentId,
      input.score,
      input.notes,
      principal,
      request.requestId,
    );
  }

  @Post('training/assignments/:assignmentId/waive')
  @RequirePermissions(PERMISSIONS.TRAINING_WAIVE)
  waive(
    @Param('assignmentId') assignmentId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = parseWithSchema(waiveTrainingSchema, body);
    return this.training.waive(assignmentId, input.reason, principal, request.requestId);
  }
}
