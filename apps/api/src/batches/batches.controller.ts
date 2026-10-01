import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedPrincipal } from '@clycites/auth';
import {
  addBatchContributionSchema,
  createBatchSchema,
  createStorageLocationSchema,
} from '@clycites/contracts';

import { parseWithSchema } from '../common/validation.js';
import { AuthGuard } from '../identity/auth.guard.js';
import {
  CurrentPrincipal,
  OrgScopeFromParam,
  RequirePermissions,
} from '../identity/identity.decorators.js';
import { PermissionsGuard } from '../identity/permissions.guard.js';
import type { AuthenticatedRequest } from '../observability/request-context.js';
import { BatchesService } from './batches.service.js';

@ApiTags('Produce batches')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, PermissionsGuard)
@OrgScopeFromParam()
@Controller('organizations/:organizationId')
export class BatchesController {
  constructor(@Inject(BatchesService) private readonly batches: BatchesService) {}

  @Get('storage-locations')
  @RequirePermissions(PERMISSIONS.STORAGE_LOCATION_READ)
  locations(@Param('organizationId') organizationId: string) {
    return this.batches.listStorageLocations(organizationId);
  }

  @Post('storage-locations')
  @RequirePermissions(PERMISSIONS.STORAGE_LOCATION_MANAGE)
  createLocation(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.batches.createStorageLocation(
      organizationId,
      parseWithSchema(createStorageLocationSchema, body),
      principal,
      request.requestId,
    );
  }

  @Get('batches')
  @RequirePermissions(PERMISSIONS.BATCH_READ)
  list(@Param('organizationId') organizationId: string) {
    return this.batches.list(organizationId);
  }

  @Get('batches/available-deliveries')
  @RequirePermissions(PERMISSIONS.BATCH_READ)
  availableDeliveries(@Param('organizationId') organizationId: string) {
    return this.batches.availableDeliveries(organizationId);
  }

  @Post('batches')
  @RequirePermissions(PERMISSIONS.BATCH_CREATE)
  create(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.batches.create(
      organizationId,
      parseWithSchema(createBatchSchema, body),
      principal,
      request.requestId,
    );
  }

  @Get('batches/:batchId')
  @RequirePermissions(PERMISSIONS.BATCH_READ)
  get(@Param('organizationId') organizationId: string, @Param('batchId') batchId: string) {
    return this.batches.get(organizationId, batchId);
  }

  @Post('batches/:batchId/contributions')
  @RequirePermissions(PERMISSIONS.BATCH_CONTRIBUTE)
  contribute(
    @Param('organizationId') organizationId: string,
    @Param('batchId') batchId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.batches.contribute(
      organizationId,
      batchId,
      parseWithSchema(addBatchContributionSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('batches/:batchId/seal')
  @RequirePermissions(PERMISSIONS.BATCH_SEAL)
  seal(
    @Param('organizationId') organizationId: string,
    @Param('batchId') batchId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.batches.seal(organizationId, batchId, principal, request.requestId);
  }
}
