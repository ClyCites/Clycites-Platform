import { Controller, Get, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedPrincipal } from '@clycites/auth';
import { anchorListQuerySchema } from '@clycites/contracts';

import { parseWithSchema } from '../common/validation.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentPrincipal, RequirePermissions } from '../identity/identity.decorators.js';
import { PermissionsGuard } from '../identity/permissions.guard.js';
import type { AuthenticatedRequest } from '../observability/request-context.js';
import { AnchorVerificationService } from './anchor-verification.service.js';

@ApiTags('Hedera anchors')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('organizations/:organizationId')
export class AnchorsController {
  constructor(
    @Inject(AnchorVerificationService) private readonly anchors: AnchorVerificationService,
  ) {}

  @Get('verification/dashboard')
  @ApiOperation({ summary: 'Get organization anchor verification metrics' })
  @RequirePermissions(PERMISSIONS.TRACEABILITY_VERIFICATION_READ)
  dashboard(@Param('organizationId') organizationId: string) {
    return this.anchors.dashboard(organizationId);
  }

  @Get('anchors')
  @ApiOperation({ summary: 'List and filter organization-scoped anchors' })
  @RequirePermissions(PERMISSIONS.ANCHOR_READ)
  list(@Param('organizationId') organizationId: string, @Query() query: unknown) {
    return this.anchors.list(organizationId, parseWithSchema(anchorListQuerySchema, query));
  }

  @Get('anchors/:anchorId')
  @ApiOperation({ summary: 'Get anchor consensus and hash evidence' })
  @RequirePermissions(PERMISSIONS.ANCHOR_READ)
  get(@Param('organizationId') organizationId: string, @Param('anchorId') anchorId: string) {
    return this.anchors.get(organizationId, anchorId);
  }

  @Get('anchors/:anchorId/attempts')
  @ApiOperation({ summary: 'List append-only anchor worker attempts' })
  @RequirePermissions(PERMISSIONS.ANCHOR_READ)
  attempts(@Param('organizationId') organizationId: string, @Param('anchorId') anchorId: string) {
    return this.anchors.attempts(organizationId, anchorId);
  }

  @Post('anchors/:anchorId/verify')
  @ApiOperation({ summary: 'Recompute private payload and chain verification' })
  @RequirePermissions(PERMISSIONS.ANCHOR_VERIFY)
  verify(
    @Param('organizationId') organizationId: string,
    @Param('anchorId') anchorId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.anchors.verify(organizationId, anchorId, principal, request.requestId);
  }

  @Post('anchors/:anchorId/retry')
  @ApiOperation({ summary: 'Retry an eligible transient anchor failure' })
  @RequirePermissions(PERMISSIONS.ANCHOR_RETRY)
  retry(
    @Param('organizationId') organizationId: string,
    @Param('anchorId') anchorId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.anchors.retry(organizationId, anchorId, principal, request.requestId);
  }

  @Post('anchors/:anchorId/reconcile')
  @ApiOperation({ summary: 'Queue bounded Mirror Node reconciliation' })
  @RequirePermissions(PERMISSIONS.ANCHOR_RECONCILE)
  reconcile(
    @Param('organizationId') organizationId: string,
    @Param('anchorId') anchorId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.anchors.reconcile(organizationId, anchorId, principal, request.requestId);
  }

  @Get(['deliveries/:entityId/verification', 'verification/deliveries/:entityId'])
  @ApiOperation({ summary: 'Get delivery verification summary' })
  @RequirePermissions(PERMISSIONS.TRACEABILITY_VERIFICATION_READ)
  delivery(@Param('organizationId') organizationId: string, @Param('entityId') entityId: string) {
    return this.anchors.entity(organizationId, 'DELIVERY', entityId);
  }

  @Get(['batches/:entityId/verification', 'verification/batches/:entityId'])
  @ApiOperation({ summary: 'Get batch verification summary' })
  @RequirePermissions(PERMISSIONS.TRACEABILITY_VERIFICATION_READ)
  batch(@Param('organizationId') organizationId: string, @Param('entityId') entityId: string) {
    return this.anchors.entity(organizationId, 'BATCH', entityId);
  }

  @Get(['lots/:entityId/verification', 'verification/lots/:entityId'])
  @ApiOperation({ summary: 'Get lot and lineage verification summary' })
  @RequirePermissions(PERMISSIONS.TRACEABILITY_VERIFICATION_READ)
  lot(@Param('organizationId') organizationId: string, @Param('entityId') entityId: string) {
    return this.anchors.entity(organizationId, 'LOT', entityId);
  }
}
