import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedPrincipal } from '@clycites/auth';
import { issueQrIdentitySchema } from '@clycites/contracts';
import { parseWithSchema } from '../common/validation.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentPrincipal, RequirePermissions } from '../identity/identity.decorators.js';
import { PermissionsGuard } from '../identity/permissions.guard.js';
import type { AuthenticatedRequest } from '../observability/request-context.js';
import { FarmerQrService } from './farmer-qr.service.js';

@ApiTags('Farmer QR identities')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('organizations/:organizationId')
export class FarmerQrController {
  constructor(@Inject(FarmerQrService) private readonly qr: FarmerQrService) {}
  @Post('farmers/:farmerId/qr-identities')
  @RequirePermissions(PERMISSIONS.FARMER_QR_ISSUE)
  issue(
    @Param('organizationId') organizationId: string,
    @Param('farmerId') farmerId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.qr.issue(
      organizationId,
      farmerId,
      parseWithSchema(issueQrIdentitySchema, body),
      principal,
      request.requestId,
    );
  }
  @Get('farmers/:farmerId/qr-identities')
  @RequirePermissions(PERMISSIONS.FARMER_READ)
  list(@Param('organizationId') organizationId: string, @Param('farmerId') farmerId: string) {
    return this.qr.list(organizationId, farmerId);
  }
  @Post('farmers/:farmerId/qr-identities/:qrIdentityId/revoke')
  @RequirePermissions(PERMISSIONS.FARMER_QR_REVOKE)
  revoke(
    @Param('organizationId') organizationId: string,
    @Param('farmerId') farmerId: string,
    @Param('qrIdentityId') identityId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.qr.revoke(organizationId, farmerId, identityId, principal, request.requestId);
  }
  @Post('farmers/:farmerId/qr-identities/:qrIdentityId/replace')
  @RequirePermissions(PERMISSIONS.FARMER_QR_ISSUE, PERMISSIONS.FARMER_QR_REVOKE)
  replace(
    @Param('organizationId') organizationId: string,
    @Param('farmerId') farmerId: string,
    @Param('qrIdentityId') identityId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.qr.replace(
      organizationId,
      farmerId,
      identityId,
      parseWithSchema(issueQrIdentitySchema, body),
      principal,
      request.requestId,
    );
  }
  @Get('farmer-lookup/:publicId')
  @RequirePermissions(PERMISSIONS.FARMER_READ)
  lookup(
    @Param('organizationId') organizationId: string,
    @Param('publicId') publicId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.qr.lookup(organizationId, publicId, principal, request.requestId);
  }
}
