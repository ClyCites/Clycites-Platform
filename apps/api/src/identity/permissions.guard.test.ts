import { ForbiddenException, NotFoundException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host.js';
import { PERMISSIONS, ROLES, type AuthenticatedPrincipal } from '@clycites/auth';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedRequest } from '../observability/request-context.js';
import {
  ORG_SCOPE,
  PLATFORM_SCOPE,
  REQUIRED_PERMISSIONS,
  type OrganizationScopeMetadata,
} from './identity.decorators.js';
import { PermissionsGuard } from './permissions.guard.js';
import type { ScopeResolverService } from './scope-resolver.service.js';

const principal = (platformAdmin = false): AuthenticatedPrincipal => {
  const platformRole: { platformRole: typeof ROLES.PLATFORM_ADMIN } | Record<string, never> =
    platformAdmin ? { platformRole: ROLES.PLATFORM_ADMIN } : {};
  return {
    subjectId: 'user-1',
    sessionId: 'session-1',
    ...platformRole,
    memberships: new Map([['organization-a', ROLES.COOPERATIVE_ADMIN]]),
  };
};

const executionContext = (
  request: AuthenticatedRequest,
  permissions?: readonly (typeof PERMISSIONS)[keyof typeof PERMISSIONS][],
  scope?: OrganizationScopeMetadata,
): ExecutionContext => {
  class TestController {}
  const handler = (): void => undefined;
  if (permissions) Reflect.defineMetadata(REQUIRED_PERMISSIONS, permissions, handler);
  if (scope) Reflect.defineMetadata(ORG_SCOPE, scope, handler);

  const context = new ExecutionContextHost([request], TestController, handler);
  context.setType('http');
  return context;
};

const requestFor = (authenticatedPrincipal: AuthenticatedPrincipal): AuthenticatedRequest =>
  ({
    principal: authenticatedPrincipal,
    params: {},
  }) as AuthenticatedRequest;

describe('PermissionsGuard', () => {
  it('denies a guarded route with missing permission metadata', async () => {
    const resolver: Pick<ScopeResolverService, 'resolve'> = { resolve: vi.fn() };
    const guard = new PermissionsGuard(new Reflector(), resolver);
    const context = executionContext(requestFor(principal()));

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies a permissioned route with missing scope metadata', async () => {
    const resolver: Pick<ScopeResolverService, 'resolve'> = { resolve: vi.fn() };
    const guard = new PermissionsGuard(new Reflector(), resolver);
    const context = executionContext(requestFor(principal()), [PERMISSIONS.PILOT_READ]);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns not found when an entity scope cannot be resolved', async () => {
    const resolver: Pick<ScopeResolverService, 'resolve'> = {
      resolve: vi.fn().mockResolvedValue(null),
    };
    const guard = new PermissionsGuard(new Reflector(), resolver);
    const request = requestFor(principal());
    request.params = { pilotId: 'missing-pilot' };
    const context = executionContext(request, [PERMISSIONS.PILOT_READ], {
      kind: 'entity',
      entity: 'pilot',
      param: 'pilotId',
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('authorizes an explicit platform scope with platform permissions', async () => {
    const resolver: Pick<ScopeResolverService, 'resolve'> = { resolve: vi.fn() };
    const guard = new PermissionsGuard(new Reflector(), resolver);
    const context = executionContext(
      requestFor(principal(true)),
      [PERMISSIONS.HEDERA_STATUS_READ],
      PLATFORM_SCOPE,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
