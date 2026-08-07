import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedPrincipal } from '@clycites/auth';
import { grantConsentSchema, withdrawConsentSchema } from '@clycites/contracts';
import { parseWithSchema } from '../common/validation.js';
import { AuthGuard } from '../identity/auth.guard.js';
import {
  CurrentPrincipal,
  OrgScopeFromParam,
  RequirePermissions,
} from '../identity/identity.decorators.js';
import { PermissionsGuard } from '../identity/permissions.guard.js';
import type { AuthenticatedRequest } from '../observability/request-context.js';
import { ConsentsService } from './consents.service.js';

@ApiTags('Farmer consent')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, PermissionsGuard)
@OrgScopeFromParam()
@Controller('organizations/:organizationId/farmers/:farmerId/consents')
export class ConsentsController {
  constructor(@Inject(ConsentsService) private readonly consents: ConsentsService) {}
  @Post()
  @RequirePermissions(PERMISSIONS.FARMER_CONSENT_RECORD)
  grant(
    @Param('organizationId') organizationId: string,
    @Param('farmerId') farmerId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.consents.grant(
      organizationId,
      farmerId,
      parseWithSchema(grantConsentSchema, body),
      principal,
      request.requestId,
    );
  }
  @Get()
  @RequirePermissions(PERMISSIONS.FARMER_READ)
  list(@Param('organizationId') organizationId: string, @Param('farmerId') farmerId: string) {
    return this.consents.list(organizationId, farmerId);
  }
  @Post(':consentId/withdraw')
  @RequirePermissions(PERMISSIONS.FARMER_CONSENT_RECORD)
  withdraw(
    @Param('organizationId') organizationId: string,
    @Param('farmerId') farmerId: string,
    @Param('consentId') consentId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.consents.withdraw(
      organizationId,
      farmerId,
      consentId,
      parseWithSchema(withdrawConsentSchema, body),
      principal,
      request.requestId,
    );
  }
}
