import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedPrincipal } from '@clycites/auth';
import { createBatchTransformationSchema } from '@clycites/contracts';

import { parseWithSchema } from '../common/validation.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentPrincipal, RequirePermissions } from '../identity/identity.decorators.js';
import { PermissionsGuard } from '../identity/permissions.guard.js';
import type { AuthenticatedRequest } from '../observability/request-context.js';
import { TransformationsService } from './transformations.service.js';

@ApiTags('Batch transformations')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('organizations/:organizationId/batch-transformations')
export class TransformationsController {
  constructor(
    @Inject(TransformationsService) private readonly transformations: TransformationsService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.BATCH_READ)
  list(@Param('organizationId') organizationId: string) {
    return this.transformations.list(organizationId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.BATCH_TRANSFORM)
  create(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.transformations.create(
      organizationId,
      parseWithSchema(createBatchTransformationSchema, body),
      principal,
      request.requestId,
    );
  }

  @Get(':transformationId')
  @RequirePermissions(PERMISSIONS.BATCH_READ)
  get(
    @Param('organizationId') organizationId: string,
    @Param('transformationId') transformationId: string,
  ) {
    return this.transformations.get(organizationId, transformationId);
  }
}
