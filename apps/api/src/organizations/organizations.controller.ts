import { Body, Controller, Get, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedPrincipal } from '@clycites/auth';
import { createOrganizationSchema, updateOrganizationSchema } from '@clycites/contracts';

import { parseWithSchema } from '../common/validation.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentPrincipal, RequirePermissions } from '../identity/identity.decorators.js';
import { PermissionsGuard } from '../identity/permissions.guard.js';
import type { AuthenticatedRequest } from '../observability/request-context.js';
import { OrganizationsService } from './organizations.service.js';

@ApiTags('Organizations')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(@Inject(OrganizationsService) private readonly organizations: OrganizationsService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.ORGANIZATION_CREATE)
  create(
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.organizations.create(
      parseWithSchema(createOrganizationSchema, body),
      principal,
      request.requestId,
    );
  }

  @Get()
  @RequirePermissions(PERMISSIONS.ORGANIZATION_READ)
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.organizations.list(principal);
  }

  @Get(':organizationId')
  @RequirePermissions(PERMISSIONS.ORGANIZATION_READ)
  get(@Param('organizationId') organizationId: string) {
    return this.organizations.get(organizationId);
  }

  @Patch(':organizationId')
  @RequirePermissions(PERMISSIONS.ORGANIZATION_UPDATE)
  update(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.organizations.update(
      organizationId,
      parseWithSchema(updateOrganizationSchema, body),
      principal,
      request.requestId,
    );
  }
}
