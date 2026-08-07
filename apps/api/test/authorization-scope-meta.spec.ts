import 'reflect-metadata';

import { GUARDS_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { MetadataScanner, Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { ORG_SCOPE, REQUIRED_PERMISSIONS } from '../src/identity/identity.decorators.js';
import { PermissionsGuard } from '../src/identity/permissions.guard.js';

describe('permissioned route scope metadata', () => {
  it('requires permissions and an explicit scope on every PermissionsGuard route', () => {
    const reflector = new Reflector();
    const scanner = new MetadataScanner();
    const failures: string[] = [];

    for (const controller of registeredControllers(AppModule)) {
      const prototype = controller.prototype as object;
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

        const targets = [handler, controller];
        if (!reflector.getAllAndOverride(REQUIRED_PERMISSIONS, targets)) {
          failures.push(`${controller.name}.${methodName}: missing permissions`);
        }
        if (!reflector.getAllAndOverride(ORG_SCOPE, targets)) {
          failures.push(`${controller.name}.${methodName}: missing scope`);
        }
      }
    }

    expect(failures).toEqual([]);
  });
});

type ModuleClass = abstract new (...args: never[]) => object;
type ControllerClass = new (...args: never[]) => object;

const registeredControllers = (rootModule: ModuleClass): ControllerClass[] => {
  const controllers: ControllerClass[] = [];
  const visited = new Set<ModuleClass>();

  const visit = (moduleClass: ModuleClass): void => {
    if (visited.has(moduleClass)) return;
    visited.add(moduleClass);

    const moduleControllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, moduleClass) as
      ControllerClass[] | undefined;
    controllers.push(...(moduleControllers ?? []));

    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, moduleClass) as
      readonly unknown[] | undefined;
    for (const imported of imports ?? []) {
      if (typeof imported === 'function') {
        visit(imported as ModuleClass);
      } else if (
        imported !== null &&
        typeof imported === 'object' &&
        'module' in imported &&
        typeof imported.module === 'function'
      ) {
        visit(imported.module as ModuleClass);
      }
    }
  };

  visit(rootModule);
  return controllers;
};
