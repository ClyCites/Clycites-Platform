import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedPrincipal } from '@clycites/auth';
import {
  createCooperativeLotSchema,
  createCustodyTransferSchema,
  createQualityInspectionSchema,
  publishTraceabilitySchema,
  receiveCustodyTransferSchema,
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
import { LotsService } from './lots.service.js';

@ApiTags('Cooperative lots')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, PermissionsGuard)
@OrgScopeFromParam()
@Controller('organizations/:organizationId')
export class LotsController {
  constructor(@Inject(LotsService) private readonly lots: LotsService) {}

  @Get('lots')
  @RequirePermissions(PERMISSIONS.LOT_READ)
  list(@Param('organizationId') organizationId: string) {
    return this.lots.list(organizationId);
  }
  @Post('lots')
  @RequirePermissions(PERMISSIONS.LOT_CREATE)
  create(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.lots.create(
      organizationId,
      parseWithSchema(createCooperativeLotSchema, body),
      principal,
      request.requestId,
    );
  }
  @Get('lots/:lotId')
  @RequirePermissions(PERMISSIONS.LOT_READ)
  get(@Param('organizationId') organizationId: string, @Param('lotId') lotId: string) {
    return this.lots.get(organizationId, lotId);
  }
  @Get('lots/:lotId/lineage')
  @RequirePermissions(PERMISSIONS.TRACEABILITY_READ)
  lineage(@Param('organizationId') organizationId: string, @Param('lotId') lotId: string) {
    return this.lots.lineage(organizationId, lotId);
  }
  @Post('lots/:lotId/inspections')
  @RequirePermissions(PERMISSIONS.QUALITY_INSPECT)
  inspect(
    @Param('organizationId') organizationId: string,
    @Param('lotId') lotId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.lots.inspect(
      organizationId,
      lotId,
      parseWithSchema(createQualityInspectionSchema, body),
      principal,
      request.requestId,
    );
  }
  @Post('lots/:lotId/approve')
  @RequirePermissions(PERMISSIONS.LOT_APPROVE)
  approve(
    @Param('organizationId') organizationId: string,
    @Param('lotId') lotId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.lots.approve(organizationId, lotId, principal, request.requestId);
  }
  @Post('lots/:lotId/custody-transfers')
  @RequirePermissions(PERMISSIONS.CUSTODY_TRANSFER_INITIATE)
  transfer(
    @Param('organizationId') organizationId: string,
    @Param('lotId') lotId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.lots.createTransfer(
      organizationId,
      lotId,
      parseWithSchema(createCustodyTransferSchema, body),
      principal,
      request.requestId,
    );
  }
  @Post('lots/:lotId/publish')
  @RequirePermissions(PERMISSIONS.TRACEABILITY_PUBLISH)
  publish(
    @Param('organizationId') organizationId: string,
    @Param('lotId') lotId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.lots.publish(
      organizationId,
      lotId,
      parseWithSchema(publishTraceabilitySchema, body),
      principal,
      request.requestId,
    );
  }
  @Get('custody-transfers')
  @RequirePermissions(PERMISSIONS.CUSTODY_TRANSFER_READ)
  transfers(@Param('organizationId') organizationId: string) {
    return this.lots.listTransfers(organizationId);
  }
  @Post('custody-transfers/:transferId/dispatch')
  @RequirePermissions(PERMISSIONS.CUSTODY_TRANSFER_INITIATE)
  dispatch(
    @Param('organizationId') organizationId: string,
    @Param('transferId') transferId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.lots.dispatchTransfer(organizationId, transferId, principal, request.requestId);
  }
  @Post('custody-transfers/:transferId/receive')
  @RequirePermissions(PERMISSIONS.CUSTODY_TRANSFER_RECEIVE)
  receive(
    @Param('organizationId') organizationId: string,
    @Param('transferId') transferId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = parseWithSchema(receiveCustodyTransferSchema, body);
    return this.lots.receiveTransfer(
      organizationId,
      transferId,
      input.accepted,
      input.notes,
      principal,
      request.requestId,
    );
  }
}
