import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedPrincipal } from '@clycites/auth';

import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentPrincipal } from '../identity/identity.decorators.js';
import { TenantContextService } from './tenant-context.service.js';

@ApiTags('Tenant context')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard)
@Controller('me')
export class MeController {
  constructor(@Inject(TenantContextService) private readonly tenants: TenantContextService) {}

  @Get('context')
  context(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.tenants.context(principal);
  }
}
