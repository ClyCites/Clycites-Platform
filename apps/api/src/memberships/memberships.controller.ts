import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedPrincipal } from '@clycites/auth';
import {
  createOrganizationMembershipSchema,
  issueUserInvitationSchema,
  updateOrganizationMembershipSchema,
} from '@clycites/contracts';
import { CredentialLifecycleService } from '../auth/credential-lifecycle.service.js';
import { parseWithSchema } from '../common/validation.js';
import { AuthGuard } from '../identity/auth.guard.js';
import {
  CurrentPrincipal,
  OrgScopeFromParam,
  RequirePermissions,
} from '../identity/identity.decorators.js';
import { PermissionsGuard } from '../identity/permissions.guard.js';
import type { AuthenticatedRequest } from '../observability/request-context.js';
import { MembershipsService } from './memberships.service.js';

@ApiTags('Organization memberships')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, PermissionsGuard)
@OrgScopeFromParam()
@Controller('organizations/:organizationId/members')
export class MembershipsController {
  constructor(
    @Inject(MembershipsService) private readonly memberships: MembershipsService,
    @Inject(CredentialLifecycleService) private readonly credentials: CredentialLifecycleService,
  ) {}
  @Get()
  @RequirePermissions(PERMISSIONS.ORGANIZATION_MEMBERS_READ)
  list(@Param('organizationId') organizationId: string) {
    return this.memberships.list(organizationId);
  }
  @Post()
  @RequirePermissions(PERMISSIONS.ORGANIZATION_MEMBERS_INVITE)
  create(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.memberships.create(
      organizationId,
      parseWithSchema(createOrganizationMembershipSchema, body),
      principal,
      request.requestId,
    );
  }
  @Post('invitations')
  @RequirePermissions(PERMISSIONS.ORGANIZATION_MEMBERS_INVITE)
  invite(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.credentials.issueInvitation(
      organizationId,
      parseWithSchema(issueUserInvitationSchema, body),
      principal.subjectId,
      request.requestId,
    );
  }
  @Post('invitations/:invitationId/reinvite')
  @RequirePermissions(PERMISSIONS.ORGANIZATION_MEMBERS_INVITE)
  reinvite(
    @Param('organizationId') organizationId: string,
    @Param('invitationId') invitationId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.credentials.reinvite(
      organizationId,
      invitationId,
      principal.subjectId,
      request.requestId,
    );
  }
  @Patch(':membershipId')
  @RequirePermissions(PERMISSIONS.ORGANIZATION_MEMBERS_UPDATE)
  update(
    @Param('organizationId') organizationId: string,
    @Param('membershipId') membershipId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.memberships.update(
      organizationId,
      membershipId,
      parseWithSchema(updateOrganizationMembershipSchema, body),
      principal,
      request.requestId,
    );
  }
  @Delete(':membershipId')
  @RequirePermissions(PERMISSIONS.ORGANIZATION_MEMBERS_UPDATE)
  remove(
    @Param('organizationId') organizationId: string,
    @Param('membershipId') membershipId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.memberships.remove(organizationId, membershipId, principal, request.requestId);
  }
}
