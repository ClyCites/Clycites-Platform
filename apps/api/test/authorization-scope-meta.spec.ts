import 'reflect-metadata';

import type { INestApplication } from '@nestjs/common';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { FARMER_SELF_PERMISSIONS, isPermissionCode, type Permission } from '@clycites/auth';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import {
  ORG_SCOPE,
  REQUIRED_PERMISSIONS,
  type OrganizationScopeMetadata,
} from '../src/identity/identity.decorators.js';
import { AuthGuard } from '../src/identity/auth.guard.js';
import { TenantPermissionsGuard } from '../src/dashboard/tenant-permissions.guard.js';
import { REQUIRED_TENANT_PERMISSIONS } from '../src/dashboard/tenant.decorators.js';
import { PermissionsGuard } from '../src/identity/permissions.guard.js';
import { ScopeResolverService } from '../src/identity/scope-resolver.service.js';

const minimumPermissionedRouteCount = 100;

describe('permissioned route scope metadata', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule, DiscoveryModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires permissions and an explicit scope on every PermissionsGuard route', () => {
    const discovery = app.get(DiscoveryService);
    const reflector = app.get(Reflector);
    const resolver = app.get(ScopeResolverService);
    const scanner = app.get(MetadataScanner);
    const failures: string[] = [];
    const guardedRoutes: string[] = [];
    const tenantRoutes: string[] = [];
    const unresolvedControllers: string[] = [];

    for (const wrapper of discovery.getControllers()) {
      const controller = wrapper.metatype;
      const instance = wrapper.instance;
      if (!controller || !instance) {
        unresolvedControllers.push(wrapper.name);
        continue;
      }
      const prototype = Object.getPrototypeOf(instance) as object;
      const classGuards = Reflect.getMetadata(GUARDS_METADATA, controller) as
        readonly unknown[] | undefined;
      for (const methodName of scanner.getAllMethodNames(prototype)) {
        const handler = Reflect.get(prototype, methodName) as
          ((...args: never[]) => unknown) | undefined;
        if (!handler || Reflect.getMetadata(PATH_METADATA, handler) === undefined) continue;

        const handlerGuards = Reflect.getMetadata(GUARDS_METADATA, handler) as
          readonly unknown[] | undefined;
        const guards = [...(classGuards ?? []), ...(handlerGuards ?? [])];
        const route = `${controller.name}.${methodName}`;
        if (guards.includes(TenantPermissionsGuard)) {
          tenantRoutes.push(route);
          const permissions = reflector.getAllAndOverride<readonly Permission[]>(
            REQUIRED_TENANT_PERMISSIONS,
            [handler, controller],
          );
          if (
            !permissions?.length ||
            permissions.some((permission) => !isPermissionCode(permission))
          )
            failures.push(`${route}: missing or invalid tenant permissions`);
          if (!pathParameters(controller, handler).has('organizationId'))
            failures.push(`${route}: tenant scope requires :organizationId`);
          if (!guards.includes(AuthGuard))
            failures.push(`${route}: tenant permissions require authentication`);
        }
        if (!guards.includes(PermissionsGuard)) continue;
        if (!guards.includes(AuthGuard))
          failures.push(`${route}: scoped permissions require authentication`);
        guardedRoutes.push(route);
        const targets = [handler, controller];
        const permissions = reflector.getAllAndOverride<readonly Permission[]>(
          REQUIRED_PERMISSIONS,
          targets,
        );
        if (
          !permissions?.length ||
          permissions.some((permission) => !isPermissionCode(permission))
        ) {
          failures.push(`${route}: missing or invalid permissions`);
        }
        const declaredScopes = targets
          .map((target) => Reflect.getOwnMetadata(ORG_SCOPE, target) as OrganizationScopeMetadata)
          .filter(Boolean);
        if (declaredScopes.length !== 1) {
          failures.push(`${route}: expected exactly one scope, found ${declaredScopes.length}`);
          continue;
        }
        const scope = declaredScopes[0];
        if (!scope) continue;
        if (
          scope.kind === 'subject' &&
          permissions?.some((permission) => !FARMER_SELF_PERMISSIONS.includes(permission))
        ) {
          failures.push(`${route}: subject scope requires only farmer-self permissions`);
        }
        if (scope.kind === 'param' || scope.kind === 'entity') {
          const routeParameters = pathParameters(controller, handler);
          if (!routeParameters.has(scope.param)) {
            failures.push(`${route}: scope parameter :${scope.param} is not in the route path`);
          }
        }
        if (scope.kind === 'entity' && !resolver.supports(scope.entity)) {
          failures.push(`${route}: no resolver registered for ${scope.entity}`);
        }
      }
    }

    expect(unresolvedControllers).toEqual([]);
    expect(guardedRoutes.length).toBeGreaterThanOrEqual(minimumPermissionedRouteCount);
    expect(tenantRoutes.length).toBeGreaterThanOrEqual(20);
    expect(failures).toEqual([]);
  });
});

const pathParameters = (controller: object, handler: object): Set<string> => {
  const paths = [controller, handler].flatMap(routePaths);
  return new Set(
    paths.flatMap((path) =>
      [...path.matchAll(/:([A-Za-z0-9_]+)/g)]
        .map((match) => match[1])
        .filter((parameter): parameter is string => parameter !== undefined),
    ),
  );
};

const routePaths = (target: object): string[] => {
  const metadata: unknown = Reflect.getMetadata(PATH_METADATA, target);
  if (typeof metadata === 'string') return [metadata];
  if (!Array.isArray(metadata)) return [];
  return metadata.filter((path): path is string => typeof path === 'string');
};
