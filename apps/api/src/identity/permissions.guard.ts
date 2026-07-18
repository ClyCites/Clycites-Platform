import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermission, ROLES, type AuthenticatedPrincipal, type Permission } from '@clycites/auth';

import type { AuthenticatedRequest } from '../observability/request-context.js';
import { REQUIRED_PERMISSIONS } from './identity.decorators.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<readonly Permission[]>(REQUIRED_PERMISSIONS, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = request.principal;
    if (!principal) throw new ForbiddenException('Permission denied');
    if (required?.some((permission) => !hasPermission(principal, permission))) {
      throw new ForbiddenException('Permission denied');
    }

    const rawOrganizationId = request.params.organizationId;
    const organizationId = Array.isArray(rawOrganizationId)
      ? rawOrganizationId[0]
      : rawOrganizationId;
    if (organizationId && !this.canAccessOrganization(principal, organizationId)) {
      throw new ForbiddenException('Permission denied');
    }
    return true;
  }

  private canAccessOrganization(
    principal: AuthenticatedPrincipal,
    organizationId: string,
  ): boolean {
    if (principal.roles.includes(ROLES.PLATFORM_ADMIN)) return true;
    return (
      principal.organizations?.some(
        (organization) => organization.organizationId === organizationId,
      ) ?? false
    );
  }
}
