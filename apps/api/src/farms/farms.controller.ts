import { Body, Controller, Get, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedPrincipal } from '@clycites/auth';
import { createFarmSchema, updateFarmSchema, updateFarmStatusSchema } from '@clycites/contracts';
import { parseWithSchema } from '../common/validation.js';
import { AuthGuard } from '../identity/auth.guard.js';
import {
  CurrentPrincipal,
  OrgScopeFromParam,
  RequirePermissions,
} from '../identity/identity.decorators.js';
import { PermissionsGuard } from '../identity/permissions.guard.js';
import type { AuthenticatedRequest } from '../observability/request-context.js';
import { FarmsService } from './farms.service.js';

@ApiTags('Farms')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, PermissionsGuard)
@OrgScopeFromParam()
@Controller('organizations/:organizationId/farmers/:farmerId/farms')
export class FarmsController {
  constructor(@Inject(FarmsService) private readonly farms: FarmsService) {}
  @Post()
  @RequirePermissions(PERMISSIONS.FARM_CREATE)
  create(
    @Param('organizationId') organizationId: string,
    @Param('farmerId') farmerId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.farms.create(
      organizationId,
      farmerId,
      parseWithSchema(createFarmSchema, body),
      principal,
      request.requestId,
    );
  }
  @Get()
  @RequirePermissions(PERMISSIONS.FARM_READ)
  list(@Param('organizationId') organizationId: string, @Param('farmerId') farmerId: string) {
    return this.farms.list(organizationId, farmerId);
  }
  @Get(':farmId')
  @RequirePermissions(PERMISSIONS.FARM_READ)
  get(
    @Param('organizationId') organizationId: string,
    @Param('farmerId') farmerId: string,
    @Param('farmId') farmId: string,
  ) {
    return this.farms.get(organizationId, farmerId, farmId);
  }
  @Patch(':farmId')
  @RequirePermissions(PERMISSIONS.FARM_UPDATE)
  update(
    @Param('organizationId') organizationId: string,
    @Param('farmerId') farmerId: string,
    @Param('farmId') farmId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.farms.update(
      organizationId,
      farmerId,
      farmId,
      parseWithSchema(updateFarmSchema, body),
      principal,
      request.requestId,
    );
  }
  @Patch(':farmId/status')
  @RequirePermissions(PERMISSIONS.FARM_ARCHIVE)
  updateStatus(
    @Param('organizationId') organizationId: string,
    @Param('farmerId') farmerId: string,
    @Param('farmId') farmId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.farms.updateStatus(
      organizationId,
      farmerId,
      farmId,
      parseWithSchema(updateFarmStatusSchema, body),
      principal,
      request.requestId,
    );
  }
}
