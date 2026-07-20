import { Body, Controller, Get, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedPrincipal } from '@clycites/auth';
import {
  createDataSubjectRequestSchema,
  createOperationalIncidentSchema,
  createPilotReadinessGateSchema,
  createRetentionPolicySchema,
  recordBackupVerificationSchema,
  setFeatureFlagSchema,
  transitionPilotReadinessGateSchema,
  updateDataSubjectRequestSchema,
  updateOperationalIncidentSchema,
} from '@clycites/contracts';

import { parseWithSchema } from '../common/validation.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentPrincipal, RequirePermissions } from '../identity/identity.decorators.js';
import { PermissionsGuard } from '../identity/permissions.guard.js';
import type { AuthenticatedRequest } from '../observability/request-context.js';
import { OperationsService } from './operations.service.js';

@ApiTags('Pilot operations')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('operations')
export class OperationsController {
  constructor(@Inject(OperationsService) private readonly operations: OperationsService) {}

  @Get('overview')
  @RequirePermissions(PERMISSIONS.OPERATIONS_READ)
  overview(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.operations.overview(principal);
  }

  @Get('readiness-gates')
  @RequirePermissions(PERMISSIONS.PILOT_READINESS_READ)
  readinessGates() {
    return this.operations.listReadinessGates();
  }

  @Post('readiness-gates')
  @RequirePermissions(PERMISSIONS.PILOT_READINESS_MANAGE)
  createReadinessGate(
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.operations.createReadinessGate(
      parseWithSchema(createPilotReadinessGateSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('readiness-gates/:gateId/transitions')
  @RequirePermissions(PERMISSIONS.PILOT_READINESS_MANAGE)
  transitionReadinessGate(
    @Param('gateId') gateId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.operations.transitionReadinessGate(
      gateId,
      parseWithSchema(transitionPilotReadinessGateSchema, body),
      principal,
      request.requestId,
    );
  }

  @Get('incidents')
  @RequirePermissions(PERMISSIONS.INCIDENT_READ)
  incidents(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.operations.listIncidents(principal);
  }

  @Post('incidents')
  @RequirePermissions(PERMISSIONS.INCIDENT_MANAGE)
  createIncident(
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.operations.createIncident(
      parseWithSchema(createOperationalIncidentSchema, body),
      principal,
      request.requestId,
    );
  }

  @Patch('incidents/:incidentId')
  @RequirePermissions(PERMISSIONS.INCIDENT_MANAGE)
  updateIncident(
    @Param('incidentId') incidentId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.operations.updateIncident(
      incidentId,
      parseWithSchema(updateOperationalIncidentSchema, body),
      principal,
      request.requestId,
    );
  }

  @Get('privacy-requests')
  @RequirePermissions(PERMISSIONS.PRIVACY_REQUEST_READ)
  privacyRequests(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.operations.listPrivacyRequests(principal);
  }

  @Post('privacy-requests')
  @RequirePermissions(PERMISSIONS.PRIVACY_REQUEST_MANAGE)
  createPrivacyRequest(
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.operations.createPrivacyRequest(
      parseWithSchema(createDataSubjectRequestSchema, body),
      principal,
      request.requestId,
    );
  }

  @Patch('privacy-requests/:privacyRequestId')
  @RequirePermissions(PERMISSIONS.PRIVACY_REQUEST_MANAGE)
  updatePrivacyRequest(
    @Param('privacyRequestId') privacyRequestId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.operations.updatePrivacyRequest(
      privacyRequestId,
      parseWithSchema(updateDataSubjectRequestSchema, body),
      principal,
      request.requestId,
    );
  }

  @Get('retention-policies')
  @RequirePermissions(PERMISSIONS.RETENTION_POLICY_READ)
  retentionPolicies(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.operations.listRetentionPolicies(principal);
  }

  @Post('retention-policies')
  @RequirePermissions(PERMISSIONS.RETENTION_POLICY_MANAGE)
  createRetentionPolicy(
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.operations.createRetentionPolicy(
      parseWithSchema(createRetentionPolicySchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('retention-policies/:policyId/dry-runs')
  @RequirePermissions(PERMISSIONS.RETENTION_DRY_RUN)
  retentionDryRun(
    @Param('policyId') policyId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.operations.retentionDryRun(policyId, principal, request.requestId);
  }

  @Get('backups')
  @RequirePermissions(PERMISSIONS.BACKUP_VERIFICATION_READ)
  backups() {
    return this.operations.listBackups();
  }

  @Post('backups')
  @RequirePermissions(PERMISSIONS.BACKUP_VERIFICATION_MANAGE)
  recordBackup(
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.operations.recordBackup(
      parseWithSchema(recordBackupVerificationSchema, body),
      principal,
      request.requestId,
    );
  }

  @Get('feature-flags')
  @RequirePermissions(PERMISSIONS.FEATURE_FLAG_READ)
  featureFlags(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.operations.listFeatureFlags(principal);
  }

  @Post('feature-flags')
  @RequirePermissions(PERMISSIONS.FEATURE_FLAG_MANAGE)
  setFeatureFlag(
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.operations.setFeatureFlag(
      parseWithSchema(setFeatureFlagSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('notifications/:notificationId/retry')
  @RequirePermissions(PERMISSIONS.NOTIFICATION_MANAGE)
  retryNotification(
    @Param('notificationId') notificationId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.operations.retryNotification(notificationId, principal, request.requestId);
  }
}
