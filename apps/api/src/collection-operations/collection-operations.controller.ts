import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedPrincipal } from '@clycites/auth';
import {
  closeCollectionSessionSchema,
  collectionSnapshotQuerySchema,
  openCollectionSessionSchema,
  registerDeviceSchema,
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
import { CollectionOperationsService } from './collection-operations.service.js';

@ApiTags('Collection operations')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, PermissionsGuard)
@OrgScopeFromParam()
@Controller('organizations/:organizationId')
export class CollectionOperationsController {
  constructor(
    @Inject(CollectionOperationsService)
    private readonly operations: CollectionOperationsService,
  ) {}

  @Get('devices')
  @RequirePermissions(PERMISSIONS.DEVICE_READ)
  listDevices(@Param('organizationId') organizationId: string) {
    return this.operations.listDevices(organizationId);
  }

  @Post('devices')
  @RequirePermissions(PERMISSIONS.DEVICE_REGISTER)
  registerDevice(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.operations.registerDevice(
      organizationId,
      parseWithSchema(registerDeviceSchema, body),
      principal,
      request.requestId,
    );
  }

  @Patch('devices/:deviceId/revoke')
  @RequirePermissions(PERMISSIONS.DEVICE_REVOKE)
  revokeDevice(
    @Param('organizationId') organizationId: string,
    @Param('deviceId') deviceId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.operations.revokeDevice(organizationId, deviceId, principal, request.requestId);
  }

  @Get('collection-sessions')
  @RequirePermissions(PERMISSIONS.COLLECTION_SESSION_READ)
  listSessions(@Param('organizationId') organizationId: string) {
    return this.operations.listSessions(organizationId);
  }

  @Post('collection-sessions')
  @RequirePermissions(PERMISSIONS.COLLECTION_SESSION_OPEN)
  openSession(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.operations.openSession(
      organizationId,
      parseWithSchema(openCollectionSessionSchema, body),
      principal,
      request.requestId,
    );
  }

  @Patch('collection-sessions/:sessionId/close')
  @RequirePermissions(PERMISSIONS.COLLECTION_SESSION_CLOSE)
  closeSession(
    @Param('organizationId') organizationId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.operations.closeSession(
      organizationId,
      sessionId,
      parseWithSchema(closeCollectionSessionSchema, body),
      principal,
      request.requestId,
    );
  }

  @Get('collection-snapshot')
  @RequirePermissions(PERMISSIONS.COLLECTION_SNAPSHOT_DOWNLOAD)
  snapshot(
    @Param('organizationId') organizationId: string,
    @Query() query: Record<string, unknown>,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.operations.snapshot(
      organizationId,
      parseWithSchema(collectionSnapshotQuerySchema, query),
      principal,
    );
  }
}
