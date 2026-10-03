import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host.js';
import { describe, expect, it, vi } from 'vitest';
import { TenantPermissionsGuard } from './tenant-permissions.guard.js';
import type { TenantContextService } from './tenant-context.service.js';
import { REQUIRED_TENANT_PERMISSIONS } from './tenant.decorators.js';

describe('tenant permissions fail closed', () => {
  const context = (required?: string[]) => {
    class Controller {}
    const handler = () => undefined;
    if (required) Reflect.defineMetadata(REQUIRED_TENANT_PERMISSIONS, required, handler);
    return new ExecutionContextHost(
      [{ principal: { subjectId: 'user' }, params: { organizationId: 'org' } }],
      Controller,
      handler,
    );
  };
  it.each([undefined, []])(
    'rejects absent or empty permission metadata before tenant lookup (%s)',
    async (required) => {
      const tenants = { resolve: vi.fn(), assertPermissions: vi.fn() };
      const guard = new TenantPermissionsGuard(
        new Reflector(),
        tenants as unknown as TenantContextService,
      );
      await expect(guard.canActivate(context(required))).rejects.toThrow(ForbiddenException);
      expect(tenants.resolve).not.toHaveBeenCalled();
    },
  );
  it('enforces the required permissions against the resolved tenant', async () => {
    const tenant = { organizationId: 'org' };
    const tenants = {
      resolve: vi.fn().mockResolvedValue(tenant),
      assertPermissions: vi.fn(() => {
        throw new ForbiddenException();
      }),
    };
    const guard = new TenantPermissionsGuard(
      new Reflector(),
      tenants as unknown as TenantContextService,
    );
    await expect(guard.canActivate(context(['analytics.read']))).rejects.toThrow(
      ForbiddenException,
    );
    expect(tenants.assertPermissions).toHaveBeenCalledWith(tenant, ['analytics.read']);
  });
});
