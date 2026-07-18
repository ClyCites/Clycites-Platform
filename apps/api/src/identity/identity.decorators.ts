import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedPrincipal, Permission } from '@clycites/auth';

import type { AuthenticatedRequest } from '../observability/request-context.js';

export const REQUIRED_PERMISSIONS = 'required-permissions';
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPrincipal =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().principal,
);
