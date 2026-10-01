import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedPrincipal, Permission } from '@clycites/auth';

import type { AuthenticatedRequest } from '../observability/request-context.js';

export const REQUIRED_PERMISSIONS = 'required-permissions';
export const ORG_SCOPE = 'organization-scope';

export type ScopedEntity =
  | 'pilot'
  | 'pilot-support-case'
  | 'pilot-farmer-import'
  | 'training-assignment'
  | 'operational-incident'
  | 'data-subject-request'
  | 'data-retention-policy'
  | 'notification-delivery';

export type OrganizationScopeMetadata =
  | { readonly kind: 'param'; readonly param: string }
  | { readonly kind: 'entity'; readonly entity: ScopedEntity; readonly param: string }
  | { readonly kind: 'platform' }
  | { readonly kind: 'self-scoped-list' }
  | { readonly kind: 'subject' };

export const PLATFORM_SCOPE: OrganizationScopeMetadata = { kind: 'platform' };

export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);

/** Scope resolved from a path parameter that is itself an organization id. */
export const OrgScopeFromParam = (param = 'organizationId') =>
  SetMetadata(ORG_SCOPE, { kind: 'param', param } satisfies OrganizationScopeMetadata);

/** Scope resolved by looking the entity up and reading its organization id. */
export const OrgScopeFromEntity = (entity: ScopedEntity, param: string) =>
  SetMetadata(ORG_SCOPE, { kind: 'entity', entity, param } satisfies OrganizationScopeMetadata);

/** Route is genuinely platform-level and has no organization scope. */
export const PlatformScope = () => SetMetadata(ORG_SCOPE, PLATFORM_SCOPE);

/** Read-only collection filtered to the principal's organization memberships. */
export const SelfScopedList = () =>
  SetMetadata(ORG_SCOPE, { kind: 'self-scoped-list' } satisfies OrganizationScopeMetadata);

/** Route is scoped to the authenticated user's subject record, never an organization. */
export const SubjectScoped = () =>
  SetMetadata(ORG_SCOPE, { kind: 'subject' } satisfies OrganizationScopeMetadata);

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPrincipal =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().principal,
);
