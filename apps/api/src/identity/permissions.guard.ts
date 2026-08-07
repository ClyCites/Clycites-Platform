import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { can, canPlatform, type Permission } from '@clycites/auth';

import type { AuthenticatedRequest } from '../observability/request-context.js';
import {
  ORG_SCOPE,
  REQUIRED_PERMISSIONS,
  type OrganizationScopeMetadata,
} from './identity.decorators.js';
import { ScopeResolverService } from './scope-resolver.service.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ScopeResolverService)
    private readonly scopeResolver: Pick<ScopeResolverService, 'resolve'>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<readonly Permission[]>(REQUIRED_PERMISSIONS, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = request.principal;
    if (!principal) throw new ForbiddenException('Permission denied');
    if (!required || required.length === 0) {
      throw new ForbiddenException('Permission denied');
    }

    const scope = this.reflector.getAllAndOverride<OrganizationScopeMetadata>(ORG_SCOPE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!scope) {
      this.logger.error(`Missing organization scope metadata for ${context.getHandler().name}`);
      throw new ForbiddenException('Permission denied');
    }

    if (scope.kind === 'platform') {
      if (required.some((permission) => !canPlatform(principal, permission))) {
        throw new ForbiddenException('Permission denied');
      }
      return true;
    }

    if (scope.kind === 'self-scoped-list') {
      const readOnly = required.every((permission) => permission.endsWith('.read'));
      const permitted = required.every(
        (permission) =>
          canPlatform(principal, permission) ||
          [...principal.memberships.keys()].some((organizationId) =>
            can(principal, permission, organizationId),
          ),
      );
      if (!readOnly || !permitted) throw new ForbiddenException('Permission denied');
      return true;
    }

    const rawScopeId = request.params[scope.param];
    const scopeId = Array.isArray(rawScopeId) ? rawScopeId[0] : rawScopeId;
    if (!scopeId) throw new ForbiddenException('Permission denied');

    const resolution =
      scope.kind === 'param'
        ? { organizationId: scopeId }
        : await this.scopeResolver.resolve(scope.entity, scopeId, request);
    if (!resolution) throw new NotFoundException('Resource not found');

    const organizationId = resolution.organizationId;
    if (!organizationId) {
      if (required.some((permission) => !canPlatform(principal, permission))) {
        throw new ForbiddenException('Permission denied');
      }
      return true;
    }

    request.organizationScope = organizationId;
    if (required.some((permission) => !can(principal, permission, organizationId))) {
      throw new ForbiddenException('Permission denied');
    }
    return true;
  }
}
