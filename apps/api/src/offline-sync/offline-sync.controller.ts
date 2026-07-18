import { Body, Controller, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedPrincipal } from '@clycites/auth';
import { offlineSyncBatchSchema } from '@clycites/contracts';

import { parseWithSchema } from '../common/validation.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentPrincipal, RequirePermissions } from '../identity/identity.decorators.js';
import { PermissionsGuard } from '../identity/permissions.guard.js';
import type { AuthenticatedRequest } from '../observability/request-context.js';
import { OfflineSyncService } from './offline-sync.service.js';

@ApiTags('Offline synchronization')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('organizations/:organizationId/offline-sync')
export class OfflineSyncController {
  constructor(@Inject(OfflineSyncService) private readonly sync: OfflineSyncService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.OFFLINE_SYNC)
  synchronize(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.sync.synchronize(
      organizationId,
      parseWithSchema(offlineSyncBatchSchema, body),
      principal,
      request.requestId,
    );
  }
}
