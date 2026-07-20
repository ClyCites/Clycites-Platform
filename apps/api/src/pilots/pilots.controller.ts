import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedPrincipal } from '@clycites/auth';
import {
  createPilotSchema,
  pilotConfigurationSchema,
  transitionPilotSchema,
} from '@clycites/contracts';

import { parseWithSchema } from '../common/validation.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentPrincipal, RequirePermissions } from '../identity/identity.decorators.js';
import { PermissionsGuard } from '../identity/permissions.guard.js';
import type { AuthenticatedRequest } from '../observability/request-context.js';
import { PilotsService } from './pilots.service.js';

@ApiTags('Controlled pilots')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('pilots')
export class PilotsController {
  constructor(@Inject(PilotsService) private readonly pilots: PilotsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PILOT_READ)
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.pilots.list(principal);
  }

  @Get(':pilotId')
  @RequirePermissions(PERMISSIONS.PILOT_READ)
  get(@Param('pilotId') pilotId: string, @CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.pilots.get(pilotId, principal);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PILOT_CREATE)
  create(
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.pilots.create(
      parseWithSchema(createPilotSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post(':pilotId/transitions')
  @RequirePermissions(PERMISSIONS.PILOT_UPDATE)
  transition(
    @Param('pilotId') pilotId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.pilots.transition(
      pilotId,
      parseWithSchema(transitionPilotSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post(':pilotId/configuration')
  @RequirePermissions(PERMISSIONS.PILOT_UPDATE)
  configure(
    @Param('pilotId') pilotId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.pilots.configure(
      pilotId,
      parseWithSchema(pilotConfigurationSchema, body),
      principal,
      request.requestId,
    );
  }
}
