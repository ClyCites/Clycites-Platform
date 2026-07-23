import {
  createParamDecorator,
  SetMetadata,
  type ExecutionContext,
} from '@nestjs/common';
import type { Permission } from '@clycites/auth';

import type { AuthenticatedRequest } from '../observability/request-context.js';
import type { ResolvedTenant } from './tenant-context.service.js';

export const REQUIRED_TENANT_PERMISSIONS = 'required-tenant-permissions';

export interface TenantScopedRequest extends AuthenticatedRequest {
  tenant?: ResolvedTenant;
}

/**
 * Declares the tenant-scoped permissions required for a route. The
 * TenantPermissionsGuard resolves the caller's effective permissions within the
 * organization identified by the `:organizationId` route parameter (base role +
 * custom roles) and enforces them.
 */
export const RequireTenantPermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_TENANT_PERMISSIONS, permissions);

export const ActiveTenant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ResolvedTenant => {
    const request = context.switchToHttp().getRequest<TenantScopedRequest>();
    if (!request.tenant) {
      throw new Error('Tenant context is not resolved; is TenantPermissionsGuard applied?');
    }
    return request.tenant;
  },
);
