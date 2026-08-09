import 'reflect-metadata';

import type { INestApplication } from '@nestjs/common';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import {
  ORG_SCOPE,
  REQUIRED_PERMISSIONS,
  type OrganizationScopeMetadata,
} from '../src/identity/identity.decorators.js';
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
        const guarded = [...(classGuards ?? []), ...(handlerGuards ?? [])].includes(
          PermissionsGuard,
        );
        if (!guarded) continue;

        const route = `${controller.name}.${methodName}`;
        guardedRoutes.push(route);
        const targets = [handler, controller];
        if (!reflector.getAllAndOverride(REQUIRED_PERMISSIONS, targets)) {
          failures.push(`${route}: missing permissions`);
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
