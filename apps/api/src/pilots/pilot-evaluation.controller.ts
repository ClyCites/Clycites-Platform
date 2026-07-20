import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedPrincipal } from '@clycites/auth';
import { approvePilotDecisionSchema, createPilotDecisionSchema } from '@clycites/contracts';

import { parseWithSchema } from '../common/validation.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentPrincipal, RequirePermissions } from '../identity/identity.decorators.js';
import { PermissionsGuard } from '../identity/permissions.guard.js';
import type { AuthenticatedRequest } from '../observability/request-context.js';
import { PilotEvaluationService } from './pilot-evaluation.service.js';
import { PilotPreflightService } from './pilot-preflight.service.js';

@ApiTags('Pilot evaluation and preflight')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('pilots/:pilotId')
export class PilotEvaluationController {
  constructor(
    @Inject(PilotEvaluationService) private readonly evaluationService: PilotEvaluationService,
    @Inject(PilotPreflightService) private readonly preflightService: PilotPreflightService,
  ) {}

  @Get('evaluation')
  @RequirePermissions(PERMISSIONS.PILOT_EVALUATION_READ)
  evaluation(
    @Param('pilotId') pilotId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.evaluationService.evaluation(pilotId, principal);
  }

  @Post('evaluation/generate')
  @RequirePermissions(PERMISSIONS.PILOT_EVALUATION_GENERATE)
  generateEvaluation(
    @Param('pilotId') pilotId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.evaluationService.evaluation(pilotId, principal);
  }

  @Post('decisions')
  @RequirePermissions(PERMISSIONS.PILOT_DECISION_CREATE)
  decide(
    @Param('pilotId') pilotId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.evaluationService.createDecision(
      pilotId,
      parseWithSchema(createPilotDecisionSchema, body),
      principal,
      request.requestId,
    );
  }

  @Get('decisions')
  @RequirePermissions(PERMISSIONS.PILOT_EVALUATION_READ)
  decisions(
    @Param('pilotId') pilotId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.evaluationService.decisions(pilotId, principal);
  }

  @Get('decisions/:decisionId')
  @RequirePermissions(PERMISSIONS.PILOT_EVALUATION_READ)
  decision(
    @Param('pilotId') pilotId: string,
    @Param('decisionId') decisionId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.evaluationService.decision(pilotId, decisionId, principal);
  }

  @Post('decisions/approve')
  @RequirePermissions(PERMISSIONS.PILOT_DECISION_APPROVE)
  approve(
    @Param('pilotId') pilotId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = parseWithSchema(approvePilotDecisionSchema, body);
    return this.evaluationService.approveDecision(
      pilotId,
      input.decisionVersion,
      input.evidenceSnapshotHash,
      input.approvalNote,
      principal,
      request.requestId,
    );
  }

  @Get('preflight')
  @RequirePermissions(PERMISSIONS.PILOT_PREFLIGHT_READ)
  preflight(
    @Param('pilotId') pilotId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.preflightService.run(pilotId, principal);
  }

  @Post('preflight')
  @RequirePermissions(PERMISSIONS.PILOT_PREFLIGHT_RUN)
  runPreflight(
    @Param('pilotId') pilotId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.preflightService.run(pilotId, principal);
  }
}
