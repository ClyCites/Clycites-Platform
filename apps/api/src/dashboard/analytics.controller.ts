import { Body, Controller, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@clycites/auth';
import { analyticsFilterSchema } from '@clycites/contracts';

import { parseWithSchema } from '../common/validation.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { AnalyticsService } from './analytics.service.js';
import { RequireTenantPermissions } from './tenant.decorators.js';
import { TenantPermissionsGuard } from './tenant-permissions.guard.js';

@ApiTags('Dashboard analytics')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, TenantPermissionsGuard)
@Controller('organizations/:organizationId/analytics')
export class AnalyticsController {
  constructor(@Inject(AnalyticsService) private readonly analytics: AnalyticsService) {}

  @Post('overview')
  @RequireTenantPermissions(PERMISSIONS.ANALYTICS_READ)
  overview(@Param('organizationId') organizationId: string, @Body() body: unknown) {
    return this.analytics.overview(organizationId, parseWithSchema(analyticsFilterSchema, body));
  }

  @Post('finance')
  @RequireTenantPermissions(PERMISSIONS.ANALYTICS_FINANCE_READ)
  finance(@Param('organizationId') organizationId: string, @Body() body: unknown) {
    return this.analytics.finance(organizationId, parseWithSchema(analyticsFilterSchema, body));
  }
}
