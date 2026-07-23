import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@clycites/auth';

import {
  REQUIRED_TENANT_PERMISSIONS,
  type TenantScopedRequest,
} from './tenant.decorators.js';
import { TenantContextService } from './tenant-context.service.js';

/**
 * Resolves and enforces tenant-scoped authorization. Must run after AuthGuard so
 * that `request.principal` is populated. It reads the `:organizationId` route
 * parameter, resolves the caller's effective permissions within that tenant, and
 * rejects the request when any required permission is missing.
 */
@Injectable()
export class TenantPermissionsGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(TenantContextService) private readonly tenants: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TenantScopedRequest>();
    const principal = request.principal;
    if (!principal) throw new BadRequestException('Authentication required');

    const rawOrganizationId = request.params.organizationId;
    const organizationId = Array.isArray(rawOrganizationId)
      ? rawOrganizationId[0]
      : rawOrganizationId;
    if (!organizationId) {
      throw new BadRequestException('organizationId route parameter is required');
    }

    const tenant = await this.tenants.resolve(principal, organizationId);
    request.tenant = tenant;

    const required = this.reflector.getAllAndOverride<readonly Permission[]>(
      REQUIRED_TENANT_PERMISSIONS,
      [context.getHandler(), context.getClass()],
    );
    if (required && required.length > 0) {
      this.tenants.assertPermissions(tenant, required);
    }
    return true;
  }
}
