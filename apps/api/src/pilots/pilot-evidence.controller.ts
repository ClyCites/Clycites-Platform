import { Body, Controller, Get, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedPrincipal } from '@clycites/auth';
import {
  createSupportCaseSchema,
  escalateSupportCaseSchema,
  recalculatePilotMetricsSchema,
  recordPilotBaselineSchema,
  resolvePilotFeedbackSchema,
  resolveSupportCaseSchema,
  reviewMetricObservationSchema,
  submitPublicPilotFeedbackSchema,
  triagePilotFeedbackSchema,
  updateSupportCaseSchema,
  verifyPilotBaselineSchema,
} from '@clycites/contracts';

import { parseWithSchema } from '../common/validation.js';
import { AuthGuard } from '../identity/auth.guard.js';
import {
  CurrentPrincipal,
  OrgScopeFromEntity,
  OrgScopeFromParam,
  PlatformScope,
  RequirePermissions,
} from '../identity/identity.decorators.js';
import { PermissionsGuard } from '../identity/permissions.guard.js';
import type { AuthenticatedRequest } from '../observability/request-context.js';
import { PilotEvidenceService } from './pilot-evidence.service.js';
import { PilotSupportService } from './pilot-support.service.js';

@ApiTags('Pilot evidence and support')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, PermissionsGuard)
@Controller()
export class PilotEvidenceController {
  constructor(
    @Inject(PilotEvidenceService) private readonly evidence: PilotEvidenceService,
    @Inject(PilotSupportService) private readonly support: PilotSupportService,
  ) {}

  @Get('pilots/:pilotId/evidence')
  @RequirePermissions(PERMISSIONS.PILOT_METRIC_READ)
  @OrgScopeFromEntity('pilot', 'pilotId')
  overview(
    @Param('pilotId') pilotId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.evidence.overview(pilotId, principal);
  }

  @Post('pilots/:pilotId/baselines')
  @RequirePermissions(PERMISSIONS.PILOT_BASELINE_RECORD)
  @OrgScopeFromEntity('pilot', 'pilotId')
  baseline(
    @Param('pilotId') pilotId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.evidence.recordBaseline(
      pilotId,
      parseWithSchema(recordPilotBaselineSchema, body),
      principal,
      request.requestId,
    );
  }

  @Get('pilots/:pilotId/baselines')
  @RequirePermissions(PERMISSIONS.PILOT_BASELINE_READ)
  @OrgScopeFromEntity('pilot', 'pilotId')
  baselines(
    @Param('pilotId') pilotId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.evidence.listBaselines(pilotId, principal);
  }

  @Post('pilots/:pilotId/baselines/:baselineId/verify')
  @RequirePermissions(PERMISSIONS.PILOT_BASELINE_VERIFY)
  @OrgScopeFromEntity('pilot', 'pilotId')
  verifyBaseline(
    @Param('pilotId') pilotId: string,
    @Param('baselineId') baselineId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = parseWithSchema(verifyPilotBaselineSchema, body);
    return this.evidence.verifyBaseline(
      pilotId,
      baselineId,
      input.verificationNote,
      principal,
      request.requestId,
    );
  }

  @Get('pilots/:pilotId/metrics')
  @RequirePermissions(PERMISSIONS.PILOT_METRIC_READ)
  @OrgScopeFromEntity('pilot', 'pilotId')
  metrics(
    @Param('pilotId') pilotId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.evidence.listMetrics(pilotId, principal);
  }

  @Get('pilots/:pilotId/metrics/:metricCode')
  @RequirePermissions(PERMISSIONS.PILOT_METRIC_READ)
  @OrgScopeFromEntity('pilot', 'pilotId')
  metric(
    @Param('pilotId') pilotId: string,
    @Param('metricCode') metricCode: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.evidence.metric(pilotId, metricCode, principal);
  }

  @Post('pilots/:pilotId/metrics/recalculate')
  @RequirePermissions(PERMISSIONS.PILOT_METRIC_RECALCULATE)
  @OrgScopeFromEntity('pilot', 'pilotId')
  recalculateMetrics(
    @Param('pilotId') pilotId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.evidence.recalculateMetrics(
      pilotId,
      parseWithSchema(recalculatePilotMetricsSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('pilots/:pilotId/metrics/:observationId/review')
  @RequirePermissions(PERMISSIONS.PILOT_METRIC_REVIEW)
  @OrgScopeFromEntity('pilot', 'pilotId')
  reviewMetric(
    @Param('pilotId') pilotId: string,
    @Param('observationId') observationId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.evidence.reviewMetric(
      pilotId,
      observationId,
      parseWithSchema(reviewMetricObservationSchema, body),
      principal,
      request.requestId,
    );
  }

  @Get('pilots/:pilotId/feedback')
  @RequirePermissions(PERMISSIONS.PILOT_FEEDBACK_READ)
  @OrgScopeFromEntity('pilot', 'pilotId')
  feedbackList(
    @Param('pilotId') pilotId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.evidence.listFeedback(pilotId, principal);
  }

  @Get('pilots/:pilotId/feedback/:feedbackId')
  @RequirePermissions(PERMISSIONS.PILOT_FEEDBACK_READ)
  @OrgScopeFromEntity('pilot', 'pilotId')
  feedbackDetail(
    @Param('pilotId') pilotId: string,
    @Param('feedbackId') feedbackId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.evidence.feedback(pilotId, feedbackId, principal);
  }

  @Post('pilots/:pilotId/feedback/:feedbackId/triage')
  @RequirePermissions(PERMISSIONS.PILOT_FEEDBACK_TRIAGE)
  @OrgScopeFromEntity('pilot', 'pilotId')
  triageFeedback(
    @Param('pilotId') pilotId: string,
    @Param('feedbackId') feedbackId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = parseWithSchema(triagePilotFeedbackSchema, body);
    return this.evidence.triageFeedback(
      pilotId,
      feedbackId,
      input.status,
      input.assignedToUserId,
      principal,
      request.requestId,
    );
  }

  @Post('pilots/:pilotId/feedback/:feedbackId/resolve')
  @RequirePermissions(PERMISSIONS.PILOT_FEEDBACK_RESOLVE)
  @OrgScopeFromEntity('pilot', 'pilotId')
  resolveFeedback(
    @Param('pilotId') pilotId: string,
    @Param('feedbackId') feedbackId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = parseWithSchema(resolvePilotFeedbackSchema, body);
    return this.evidence.resolveFeedback(
      pilotId,
      feedbackId,
      input.resolution,
      principal,
      request.requestId,
    );
  }

  @Post('pilot-support-cases')
  @RequirePermissions(PERMISSIONS.SUPPORT_CASE_CREATE)
  @PlatformScope()
  createSupport(
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.support.create(
      parseWithSchema(createSupportCaseSchema, body),
      principal,
      request.requestId,
    );
  }

  @Patch('pilot-support-cases/:caseId')
  @RequirePermissions(PERMISSIONS.SUPPORT_CASE_ASSIGN)
  @OrgScopeFromEntity('pilot-support-case', 'caseId')
  updateSupport(
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = parseWithSchema(updateSupportCaseSchema, body);
    return this.support.update(
      caseId,
      input.status,
      input.assignedToUserId,
      principal,
      request.requestId,
    );
  }

  @Post('pilot-support-cases/:caseId/resolve')
  @RequirePermissions(PERMISSIONS.SUPPORT_CASE_RESOLVE)
  @OrgScopeFromEntity('pilot-support-case', 'caseId')
  resolveSupport(
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = parseWithSchema(resolveSupportCaseSchema, body);
    return this.support.resolve(
      caseId,
      input.resolutionCode,
      input.summary,
      principal,
      request.requestId,
    );
  }

  @Get('organizations/:organizationId/support-cases')
  @RequirePermissions(PERMISSIONS.SUPPORT_CASE_READ)
  @OrgScopeFromParam()
  supportCases(
    @Param('organizationId') organizationId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.support.list(organizationId, principal);
  }

  @Post('organizations/:organizationId/support-cases')
  @RequirePermissions(PERMISSIONS.SUPPORT_CASE_CREATE)
  @OrgScopeFromParam()
  createOrganizationSupport(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.support.createForOrganization(
      organizationId,
      parseWithSchema(createSupportCaseSchema, body),
      principal,
      request.requestId,
    );
  }

  @Get('organizations/:organizationId/support-cases/:caseId')
  @RequirePermissions(PERMISSIONS.SUPPORT_CASE_READ)
  @OrgScopeFromParam()
  supportCase(
    @Param('organizationId') organizationId: string,
    @Param('caseId') caseId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.support.detail(organizationId, caseId, principal);
  }

  @Patch('organizations/:organizationId/support-cases/:caseId')
  @RequirePermissions(PERMISSIONS.SUPPORT_CASE_ASSIGN)
  @OrgScopeFromParam()
  updateOrganizationSupport(
    @Param('organizationId') organizationId: string,
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = parseWithSchema(updateSupportCaseSchema, body);
    return this.support
      .detail(organizationId, caseId, principal)
      .then(() =>
        this.support.update(
          caseId,
          input.status,
          input.assignedToUserId,
          principal,
          request.requestId,
        ),
      );
  }

  @Post('organizations/:organizationId/support-cases/:caseId/resolve')
  @RequirePermissions(PERMISSIONS.SUPPORT_CASE_RESOLVE)
  @OrgScopeFromParam()
  resolveOrganizationSupport(
    @Param('organizationId') organizationId: string,
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = parseWithSchema(resolveSupportCaseSchema, body);
    return this.support
      .detail(organizationId, caseId, principal)
      .then(() =>
        this.support.resolve(
          caseId,
          input.resolutionCode,
          input.summary,
          principal,
          request.requestId,
        ),
      );
  }

  @Post('organizations/:organizationId/support-cases/:caseId/close')
  @RequirePermissions(PERMISSIONS.SUPPORT_CASE_RESOLVE)
  @OrgScopeFromParam()
  closeOrganizationSupport(
    @Param('organizationId') organizationId: string,
    @Param('caseId') caseId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.support
      .detail(organizationId, caseId, principal)
      .then(() => this.support.close(caseId, principal, request.requestId));
  }

  @Post('organizations/:organizationId/support-cases/:caseId/reopen')
  @RequirePermissions(PERMISSIONS.SUPPORT_CASE_RESOLVE)
  @OrgScopeFromParam()
  reopenOrganizationSupport(
    @Param('organizationId') organizationId: string,
    @Param('caseId') caseId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.support
      .detail(organizationId, caseId, principal)
      .then(() => this.support.reopen(caseId, principal, request.requestId));
  }

  @Post('organizations/:organizationId/support-cases/:caseId/escalate')
  @RequirePermissions(PERMISSIONS.SUPPORT_CASE_ESCALATE)
  @OrgScopeFromParam()
  escalateOrganizationSupport(
    @Param('organizationId') organizationId: string,
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.support
      .detail(organizationId, caseId, principal)
      .then(() =>
        this.support.escalate(
          caseId,
          parseWithSchema(escalateSupportCaseSchema, body),
          principal,
          request.requestId,
        ),
      );
  }
}

@ApiTags('Public pilot feedback')
@Controller('public/pilots')
export class PublicPilotFeedbackController {
  constructor(@Inject(PilotEvidenceService) private readonly evidence: PilotEvidenceService) {}

  @Post(':publicId/feedback')
  feedback(@Param('publicId') publicId: string, @Body() body: unknown) {
    return this.evidence.submitPublicFeedback(
      publicId,
      parseWithSchema(submitPublicPilotFeedbackSchema, body),
    );
  }
}
