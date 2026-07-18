import { Body, Controller, Get, Inject, Param, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedPrincipal } from '@clycites/auth';
import { updateQualityConfigurationSchema } from '@clycites/contracts';

import { parseWithSchema } from '../common/validation.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentPrincipal, RequirePermissions } from '../identity/identity.decorators.js';
import { PermissionsGuard } from '../identity/permissions.guard.js';
import type { AuthenticatedRequest } from '../observability/request-context.js';
import { CoffeeConfigurationService } from './coffee-configuration.service.js';

@ApiTags('Coffee configuration')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, PermissionsGuard)
@Controller()
export class CoffeeConfigurationController {
  constructor(
    @Inject(CoffeeConfigurationService)
    private readonly configuration: CoffeeConfigurationService,
  ) {}

  @Get('commodities')
  @RequirePermissions(PERMISSIONS.COMMODITY_READ)
  listCommodities() {
    return this.configuration.listCommodities();
  }

  @Get('organizations/:organizationId/commodity-forms/:commodityFormId/quality-definitions')
  @RequirePermissions(PERMISSIONS.QUALITY_CONFIGURATION_READ)
  listEffectiveQualityDefinitions(
    @Param('organizationId') organizationId: string,
    @Param('commodityFormId') commodityFormId: string,
  ) {
    return this.configuration.listEffectiveQualityDefinitions(organizationId, commodityFormId);
  }

  @Put('organizations/:organizationId/commodity-forms/:commodityFormId/quality-definitions')
  @RequirePermissions(PERMISSIONS.QUALITY_CONFIGURATION_MANAGE)
  replaceOrganizationQualityDefinitions(
    @Param('organizationId') organizationId: string,
    @Param('commodityFormId') commodityFormId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.configuration.replaceOrganizationQualityDefinitions(
      organizationId,
      commodityFormId,
      parseWithSchema(updateQualityConfigurationSchema, body),
      principal,
      request.requestId,
    );
  }
}
