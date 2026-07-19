import { Body, Controller, Get, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedPrincipal } from '@clycites/auth';
import { reconciliationCommandSchema } from '@clycites/contracts';

import { parseWithSchema } from '../common/validation.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentPrincipal, RequirePermissions } from '../identity/identity.decorators.js';
import { PermissionsGuard } from '../identity/permissions.guard.js';
import type { AuthenticatedRequest } from '../observability/request-context.js';
import { HederaAdminService } from './hedera-admin.service.js';

@ApiTags('Hedera administration')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('admin/hedera')
export class HederaAdminController {
  constructor(@Inject(HederaAdminService) private readonly hedera: HederaAdminService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get credential-safe Hedera system status' })
  @RequirePermissions(PERMISSIONS.HEDERA_STATUS_READ)
  status() {
    return this.hedera.status();
  }

  @Get('failures')
  @ApiOperation({ summary: 'List cross-organization anchor failures and mismatches' })
  @RequirePermissions(PERMISSIONS.ANCHOR_FAILURE_READ)
  failures() {
    return this.hedera.failures();
  }

  @Get('topics')
  @ApiOperation({ summary: 'List configured topic reconciliation checkpoints' })
  @RequirePermissions(PERMISSIONS.HEDERA_STATUS_READ)
  topics() {
    return this.hedera.topics();
  }

  @Get('reconciliation')
  @ApiOperation({ summary: 'List recent bounded reconciliation jobs' })
  @RequirePermissions(PERMISSIONS.HEDERA_STATUS_READ)
  reconciliation() {
    return this.hedera.reconciliation();
  }

  @Post(['reconcile', 'reconciliation/run'])
  @ApiOperation({ summary: 'Queue platform topic reconciliation' })
  @RequirePermissions(PERMISSIONS.HEDERA_RECONCILIATION_RUN)
  reconcile(
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.hedera.reconcile(
      parseWithSchema(reconciliationCommandSchema, body).limit,
      principal.subjectId,
      request.requestId,
    );
  }
}
