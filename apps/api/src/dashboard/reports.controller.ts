import { Body, Controller, Get, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedPrincipal } from '@clycites/auth';
import {
  createReportDefinitionSchema,
  requestReportExportSchema,
  updateReportDefinitionSchema,
} from '@clycites/contracts';

import { parseWithSchema } from '../common/validation.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentPrincipal } from '../identity/identity.decorators.js';
import type { AuthenticatedRequest } from '../observability/request-context.js';
import { ReportsService } from './reports.service.js';
import { RequireTenantPermissions } from './tenant.decorators.js';
import { TenantPermissionsGuard } from './tenant-permissions.guard.js';

@ApiTags('Dashboard reports')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, TenantPermissionsGuard)
@Controller('organizations/:organizationId/reports')
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

  @Get('definitions')
  @RequireTenantPermissions(PERMISSIONS.REPORT_READ)
  listDefinitions(@Param('organizationId') organizationId: string) {
    return this.reports.listDefinitions(organizationId);
  }

  @Post('definitions')
  @RequireTenantPermissions(PERMISSIONS.REPORT_MANAGE)
  createDefinition(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.reports.createDefinition(
      organizationId,
      parseWithSchema(createReportDefinitionSchema, body),
      principal.subjectId,
      request.requestId,
    );
  }

  @Patch('definitions/:definitionId')
  @RequireTenantPermissions(PERMISSIONS.REPORT_MANAGE)
  updateDefinition(
    @Param('organizationId') organizationId: string,
    @Param('definitionId') definitionId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.reports.updateDefinition(
      organizationId,
      definitionId,
      parseWithSchema(updateReportDefinitionSchema, body),
      principal.subjectId,
      request.requestId,
    );
  }

  @Get('exports')
  @RequireTenantPermissions(PERMISSIONS.REPORT_READ)
  listExports(@Param('organizationId') organizationId: string) {
    return this.reports.listExports(organizationId);
  }

  @Post('exports')
  @RequireTenantPermissions(PERMISSIONS.REPORT_EXPORT)
  requestExport(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.reports.requestExport(
      organizationId,
      parseWithSchema(requestReportExportSchema, body),
      principal.subjectId,
      request.requestId,
    );
  }

  @Get('exports/:exportId')
  @RequireTenantPermissions(PERMISSIONS.REPORT_READ)
  getExport(
    @Param('organizationId') organizationId: string,
    @Param('exportId') exportId: string,
  ) {
    return this.reports.getExport(organizationId, exportId);
  }
}
