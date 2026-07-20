import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedPrincipal } from '@clycites/auth';
import {
  confirmPilotFarmerImportSchema,
  confirmPilotFarmerImportUploadSchema,
  createPilotFarmerImportSchema,
} from '@clycites/contracts';

import { parseWithSchema } from '../common/validation.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentPrincipal, RequirePermissions } from '../identity/identity.decorators.js';
import { PermissionsGuard } from '../identity/permissions.guard.js';
import type { AuthenticatedRequest } from '../observability/request-context.js';
import { PilotImportService } from './pilot-import.service.js';

@ApiTags('Pilot farmer imports')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, PermissionsGuard)
@Controller()
export class PilotImportController {
  constructor(@Inject(PilotImportService) private readonly imports: PilotImportService) {}

  @Get('pilots/:pilotId/farmer-imports')
  @RequirePermissions(PERMISSIONS.PILOT_IMPORT_READ)
  list(@Param('pilotId') pilotId: string, @CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.imports.list(pilotId, principal);
  }

  @Post('pilots/:pilotId/farmer-imports')
  @RequirePermissions(PERMISSIONS.PILOT_IMPORT_CREATE)
  create(
    @Param('pilotId') pilotId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.imports.create(
      pilotId,
      parseWithSchema(createPilotFarmerImportSchema, body),
      principal,
      request.requestId,
    );
  }

  @Get('pilots/:pilotId/farmer-imports/:importId')
  @RequirePermissions(PERMISSIONS.PILOT_IMPORT_READ)
  detail(
    @Param('pilotId') pilotId: string,
    @Param('importId') importId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.imports.detail(pilotId, importId, principal);
  }

  @Post('pilots/:pilotId/farmer-imports/:importId/validate')
  @RequirePermissions(PERMISSIONS.PILOT_IMPORT_CONFIRM_UPLOAD)
  validate(
    @Param('pilotId') pilotId: string,
    @Param('importId') importId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = parseWithSchema(confirmPilotFarmerImportUploadSchema, body);
    return this.imports
      .detail(pilotId, importId, principal)
      .then(() =>
        this.imports.confirmUpload(importId, input.checksum, principal, request.requestId),
      );
  }

  @Post('pilots/:pilotId/farmer-imports/:importId/confirm')
  @RequirePermissions(PERMISSIONS.PILOT_IMPORT_CONFIRM)
  confirmForPilot(
    @Param('pilotId') pilotId: string,
    @Param('importId') importId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = parseWithSchema(confirmPilotFarmerImportSchema, body);
    return this.imports
      .detail(pilotId, importId, principal)
      .then(() =>
        this.imports.confirm(importId, input.expectedRowCount, principal, request.requestId),
      );
  }

  @Post('pilots/:pilotId/farmer-imports/:importId/cancel')
  @RequirePermissions(PERMISSIONS.PILOT_IMPORT_CONFIRM)
  cancel(
    @Param('pilotId') pilotId: string,
    @Param('importId') importId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.imports
      .detail(pilotId, importId, principal)
      .then(() => this.imports.cancel(importId, principal, request.requestId));
  }

  @Post('pilot-farmer-imports/:importId/confirm-upload')
  @RequirePermissions(PERMISSIONS.PILOT_IMPORT_CONFIRM_UPLOAD)
  confirmUpload(
    @Param('importId') importId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = parseWithSchema(confirmPilotFarmerImportUploadSchema, body);
    return this.imports.confirmUpload(importId, input.checksum, principal, request.requestId);
  }

  @Post('pilot-farmer-imports/:importId/confirm')
  @RequirePermissions(PERMISSIONS.PILOT_IMPORT_CONFIRM)
  confirm(
    @Param('importId') importId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = parseWithSchema(confirmPilotFarmerImportSchema, body);
    return this.imports.confirm(importId, input.expectedRowCount, principal, request.requestId);
  }
}
