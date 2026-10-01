import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedPrincipal } from '@clycites/auth';

import { AuthGuard } from '../identity/auth.guard.js';
import {
  CurrentPrincipal,
  RequirePermissions,
  SubjectScoped,
} from '../identity/identity.decorators.js';
import { PermissionsGuard } from '../identity/permissions.guard.js';
import type { AuthenticatedRequest } from '../observability/request-context.js';
import { FarmerSelfServiceService } from './farmer-self-service.service.js';

@ApiTags('Farmer self-service')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, PermissionsGuard)
@SubjectScoped()
@Controller('me')
export class FarmerSelfServiceController {
  constructor(
    @Inject(FarmerSelfServiceService)
    private readonly selfService: FarmerSelfServiceService,
  ) {}

  @Get('profile')
  @RequirePermissions(PERMISSIONS.FARMER_SELF_PROFILE_READ)
  profile(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.selfService.profile(this.farmerId(principal), principal.subjectId);
  }

  @Get('deliveries')
  @RequirePermissions(PERMISSIONS.FARMER_SELF_DELIVERY_READ)
  deliveries(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.selfService.deliveries(this.farmerId(principal));
  }

  @Get('deliveries/:deliveryId')
  @RequirePermissions(PERMISSIONS.FARMER_SELF_DELIVERY_READ)
  delivery(
    @Param('deliveryId') deliveryId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return this.selfService.delivery(this.farmerId(principal), deliveryId);
  }

  @Get('settlements')
  @RequirePermissions(PERMISSIONS.FARMER_SELF_SETTLEMENT_READ)
  settlements(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.selfService.settlements(this.farmerId(principal));
  }

  @Get('statements')
  @RequirePermissions(PERMISSIONS.FARMER_SELF_STATEMENT_READ)
  statements(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.selfService.statements(this.farmerId(principal));
  }

  @Get('farms')
  @RequirePermissions(PERMISSIONS.FARMER_SELF_FARM_READ)
  farms(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.selfService.farms(this.farmerId(principal));
  }

  @Get('qr-identities')
  @RequirePermissions(PERMISSIONS.FARMER_SELF_QR_READ)
  qrIdentities(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.selfService.qrIdentities(this.farmerId(principal));
  }

  @Get('consents')
  @RequirePermissions(PERMISSIONS.FARMER_SELF_CONSENT_READ)
  consents(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.selfService.consents(this.farmerId(principal));
  }

  @Post('consents/:consentId/withdraw')
  @RequirePermissions(PERMISSIONS.FARMER_SELF_CONSENT_WITHDRAW)
  withdrawConsent(
    @Param('consentId') consentId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.selfService.withdrawConsent(
      this.farmerId(principal),
      consentId,
      principal.subjectId,
      request.requestId,
    );
  }

  @Post('privacy-requests')
  @RequirePermissions(PERMISSIONS.FARMER_SELF_PRIVACY_REQUEST_CREATE)
  createPrivacyRequest(
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.selfService.createPrivacyRequest(
      this.farmerId(principal),
      body,
      principal.subjectId,
      request.requestId,
    );
  }

  private farmerId(principal: AuthenticatedPrincipal): string {
    if (!principal.farmerId) throw new Error('Subject guard did not bind a farmer');
    return principal.farmerId;
  }
}
