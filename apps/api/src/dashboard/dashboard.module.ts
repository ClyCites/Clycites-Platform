import { Module } from '@nestjs/common';

import { AdministrationController } from './administration.controller.js';
import { AdministrationService } from './administration.service.js';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';
import { MeController } from './me.controller.js';
import { PublicBrandingController } from './public-branding.controller.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
import { TenantContextService } from './tenant-context.service.js';
import { TenantPermissionsGuard } from './tenant-permissions.guard.js';

@Module({
  controllers: [
    MeController,
    PublicBrandingController,
    AdministrationController,
    AnalyticsController,
    ReportsController,
  ],
  providers: [
    TenantContextService,
    TenantPermissionsGuard,
    AdministrationService,
    AnalyticsService,
    ReportsService,
  ],
  exports: [TenantContextService, AdministrationService],
})
export class DashboardModule {}
