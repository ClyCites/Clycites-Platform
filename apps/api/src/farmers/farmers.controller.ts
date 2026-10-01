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
  createFarmerSchema,
  farmerStatusSchema,
  paginationQuerySchema,
  updateFarmerSchema,
  updateFarmerStatusSchema,
} from '@clycites/contracts';
import { parseWithSchema } from '../common/validation.js';
import { CredentialLifecycleService } from '../auth/credential-lifecycle.service.js';
import { AuthGuard } from '../identity/auth.guard.js';
import {
  CurrentPrincipal,
  OrgScopeFromParam,
  RequirePermissions,
} from '../identity/identity.decorators.js';
import { PermissionsGuard } from '../identity/permissions.guard.js';
import type { AuthenticatedRequest } from '../observability/request-context.js';
import { FarmersService } from './farmers.service.js';

@ApiTags('Farmers')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, PermissionsGuard)
@OrgScopeFromParam()
@Controller('organizations/:organizationId/farmers')
export class FarmersController {
  constructor(
    @Inject(FarmersService) private readonly farmers: FarmersService,
    @Inject(CredentialLifecycleService)
    private readonly credentials: CredentialLifecycleService,
  ) {}
  @Post()
  @RequirePermissions(PERMISSIONS.FARMER_CREATE)
  create(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.farmers.create(
      organizationId,
      parseWithSchema(createFarmerSchema, body),
      principal,
      request.requestId,
    );
  }
  @Get()
  @RequirePermissions(PERMISSIONS.FARMER_READ)
  list(@Param('organizationId') organizationId: string, @Query() query: Record<string, unknown>) {
    const pagination = parseWithSchema(paginationQuerySchema, query);
    const parsedStatus = query.status ? farmerStatusSchema.safeParse(query.status) : undefined;
    return this.farmers.list(
      organizationId,
      pagination.page,
      pagination.pageSize,
      typeof query.search === 'string' ? query.search.trim().slice(0, 100) : undefined,
      parsedStatus?.success ? parsedStatus.data : undefined,
    );
  }
  @Get(':farmerId')
  @RequirePermissions(PERMISSIONS.FARMER_READ)
  get(@Param('organizationId') organizationId: string, @Param('farmerId') farmerId: string) {
    return this.farmers.get(organizationId, farmerId);
  }
  @Patch(':farmerId')
  @RequirePermissions(PERMISSIONS.FARMER_UPDATE)
  update(
    @Param('organizationId') organizationId: string,
    @Param('farmerId') farmerId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.farmers.update(
      organizationId,
      farmerId,
      parseWithSchema(updateFarmerSchema, body),
      principal,
      request.requestId,
    );
  }
  @Patch(':farmerId/status')
  @RequirePermissions(PERMISSIONS.FARMER_SUSPEND)
  updateStatus(
    @Param('organizationId') organizationId: string,
    @Param('farmerId') farmerId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.farmers.updateStatus(
      organizationId,
      farmerId,
      parseWithSchema(updateFarmerStatusSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post(':farmerId/account')
  @RequirePermissions(PERMISSIONS.ORGANIZATION_MEMBERS_INVITE)
  createAccount(
    @Param('organizationId') organizationId: string,
    @Param('farmerId') farmerId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.credentials.issueFarmerInvitation(
      organizationId,
      farmerId,
      principal.subjectId,
      request.requestId,
    );
  }

  @Post(':farmerId/account-reset')
  @RequirePermissions(PERMISSIONS.FARMER_ACCOUNT_RESET)
  initiateAccountReset(
    @Param('organizationId') organizationId: string,
    @Param('farmerId') farmerId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.credentials.initiateFarmerAccountReset(
      organizationId,
      farmerId,
      principal.subjectId,
      request.requestId,
    );
  }
}
