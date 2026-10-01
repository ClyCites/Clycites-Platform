import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedPrincipal } from '@clycites/auth';
import {
  assignCustomRoleSchema,
  auditFilterSchema,
  createCustomRoleSchema,
  setOrganizationFeatureSchema,
  updateCustomRoleSchema,
  upsertBrandingSchema,
  upsertSavedViewSchema,
} from '@clycites/contracts';

import { parseWithSchema } from '../common/validation.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentPrincipal } from '../identity/identity.decorators.js';
import type { AuthenticatedRequest } from '../observability/request-context.js';
import { AdministrationService } from './administration.service.js';
import { RequireTenantPermissions } from './tenant.decorators.js';
import { TenantPermissionsGuard } from './tenant-permissions.guard.js';

@ApiTags('Dashboard administration')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, TenantPermissionsGuard)
@Controller('organizations/:organizationId')
export class AdministrationController {
  constructor(
    @Inject(AdministrationService) private readonly administration: AdministrationService,
  ) {}

  // -- Branding -------------------------------------------------------------

  @Get('branding')
  @RequireTenantPermissions(PERMISSIONS.BRANDING_READ)
  getBranding(@Param('organizationId') organizationId: string) {
    return this.administration.getBranding(organizationId);
  }

  @Put('branding')
  @RequireTenantPermissions(PERMISSIONS.BRANDING_MANAGE)
  upsertBranding(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.administration.upsertBranding(
      organizationId,
      parseWithSchema(upsertBrandingSchema, body),
      principal.subjectId,
      request.requestId,
    );
  }

  // -- Features -------------------------------------------------------------

  @Get('feature-definitions')
  @RequireTenantPermissions(PERMISSIONS.FEATURE_DEFINITION_READ)
  featureDefinitions() {
    return this.administration.listFeatureDefinitions();
  }

  @Get('features')
  @RequireTenantPermissions(PERMISSIONS.ORGANIZATION_FEATURE_READ)
  features(@Param('organizationId') organizationId: string) {
    return this.administration.listOrganizationFeatures(organizationId);
  }

  @Put('features')
  @RequireTenantPermissions(PERMISSIONS.ORGANIZATION_FEATURE_MANAGE)
  setFeature(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.administration.setOrganizationFeature(
      organizationId,
      parseWithSchema(setOrganizationFeatureSchema, body),
      principal.subjectId,
      request.requestId,
    );
  }

  // -- Custom roles ---------------------------------------------------------

  @Get('roles')
  @RequireTenantPermissions(PERMISSIONS.CUSTOM_ROLE_READ)
  roles(@Param('organizationId') organizationId: string) {
    return this.administration.listCustomRoles(organizationId);
  }

  @Post('roles')
  @RequireTenantPermissions(PERMISSIONS.CUSTOM_ROLE_MANAGE)
  createRole(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.administration.createCustomRole(
      organizationId,
      parseWithSchema(createCustomRoleSchema, body),
      principal.subjectId,
      request.requestId,
    );
  }

  @Patch('roles/:roleId')
  @RequireTenantPermissions(PERMISSIONS.CUSTOM_ROLE_MANAGE)
  updateRole(
    @Param('organizationId') organizationId: string,
    @Param('roleId') roleId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.administration.updateCustomRole(
      organizationId,
      roleId,
      parseWithSchema(updateCustomRoleSchema, body),
      principal.subjectId,
      request.requestId,
    );
  }

  @Post('role-assignments')
  @RequireTenantPermissions(PERMISSIONS.CUSTOM_ROLE_MANAGE)
  assignRole(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = parseWithSchema(assignCustomRoleSchema, body);
    return this.administration.assignCustomRole(
      organizationId,
      input.membershipId,
      input.customRoleId,
      principal.subjectId,
      request.requestId,
    );
  }

  @Delete('memberships/:membershipId/roles/:customRoleId')
  @RequireTenantPermissions(PERMISSIONS.CUSTOM_ROLE_MANAGE)
  unassignRole(
    @Param('organizationId') organizationId: string,
    @Param('membershipId') membershipId: string,
    @Param('customRoleId') customRoleId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.administration.unassignCustomRole(
      organizationId,
      membershipId,
      customRoleId,
      principal.subjectId,
      request.requestId,
    );
  }

  @Get('memberships/:membershipId/effective-permissions')
  @RequireTenantPermissions(PERMISSIONS.CUSTOM_ROLE_READ)
  effectivePermissions(
    @Param('organizationId') organizationId: string,
    @Param('membershipId') membershipId: string,
  ) {
    return this.administration.effectivePermissions(organizationId, membershipId);
  }

  // -- Saved views ----------------------------------------------------------

  @Get('saved-views')
  @RequireTenantPermissions(PERMISSIONS.SAVED_VIEW_READ)
  savedViews(
    @Param('organizationId') organizationId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.administration.listSavedViews(organizationId, principal.subjectId);
  }

  @Put('saved-views')
  @RequireTenantPermissions(PERMISSIONS.SAVED_VIEW_MANAGE)
  upsertSavedView(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.administration.upsertSavedView(
      organizationId,
      principal.subjectId,
      parseWithSchema(upsertSavedViewSchema, body),
    );
  }

  @Delete('saved-views/:viewId')
  @RequireTenantPermissions(PERMISSIONS.SAVED_VIEW_MANAGE)
  async deleteSavedView(
    @Param('organizationId') organizationId: string,
    @Param('viewId') viewId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    await this.administration.deleteSavedView(organizationId, principal.subjectId, viewId);
    return { deleted: true };
  }

  // -- Audit + operations ---------------------------------------------------

  @Post('audit/search')
  @RequireTenantPermissions(PERMISSIONS.AUDIT_READ)
  audit(@Param('organizationId') organizationId: string, @Body() body: unknown) {
    return this.administration.listAudit(organizationId, parseWithSchema(auditFilterSchema, body));
  }

  @Get('operations/summary')
  @RequireTenantPermissions(PERMISSIONS.OPERATIONS_READ)
  operations(@Param('organizationId') organizationId: string) {
    return this.administration.operationsSummary(organizationId);
  }
}
