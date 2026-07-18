import { Body, Controller, Get, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedPrincipal } from '@clycites/auth';
import { createUserSchema, updateUserStatusSchema } from '@clycites/contracts';

import { parseWithSchema } from '../common/validation.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentPrincipal, RequirePermissions } from '../identity/identity.decorators.js';
import { PermissionsGuard } from '../identity/permissions.guard.js';
import type { AuthenticatedRequest } from '../observability/request-context.js';
import { UsersService } from './users.service.js';

@ApiTags('Platform administration')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSIONS.ORGANIZATION_CREATE)
@Controller('admin/users')
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Post()
  create(
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.users.create(parseWithSchema(createUserSchema, body), principal, request.requestId);
  }

  @Get()
  list() {
    return this.users.list();
  }

  @Get(':userId')
  get(@Param('userId') userId: string) {
    return this.users.get(userId);
  }

  @Patch(':userId/status')
  updateStatus(
    @Param('userId') userId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.users.updateStatus(
      userId,
      parseWithSchema(updateUserStatusSchema, body),
      principal,
      request.requestId,
    );
  }
}
