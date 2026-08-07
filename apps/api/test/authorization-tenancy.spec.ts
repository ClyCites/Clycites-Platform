import { ForbiddenException } from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host.js';
import { Reflector } from '@nestjs/core';
import { ROLES, type AuthenticatedPrincipal } from '@clycites/auth';
import { describe, expect, it, vi } from 'vitest';

import { HederaAdminController } from '../src/anchoring/hedera-admin.controller.js';
import { CoffeeConfigurationController } from '../src/coffee-configuration/coffee-configuration.controller.js';
import { PermissionsGuard } from '../src/identity/permissions.guard.js';
import type { ScopeResolverService } from '../src/identity/scope-resolver.service.js';
import { OperationsController } from '../src/operations/operations.controller.js';
import { OrganizationsController } from '../src/organizations/organizations.controller.js';
import { PilotEvaluationController } from '../src/pilots/pilot-evaluation.controller.js';
import { PilotEvidenceController } from '../src/pilots/pilot-evidence.controller.js';
import { PilotImportController } from '../src/pilots/pilot-import.controller.js';
import { PilotParticipantsController } from '../src/pilots/pilot-participants.controller.js';
import { PilotsController } from '../src/pilots/pilots.controller.js';
import type { AuthenticatedRequest } from '../src/observability/request-context.js';
import { UsersController } from '../src/users/users.controller.js';

type ControllerClass = new (...args: never[]) => object;

const organizationA = '00000000-0000-4000-8000-00000000000a';
const organizationB = '00000000-0000-4000-8000-00000000000b';

const principal: AuthenticatedPrincipal = {
  subjectId: '00000000-0000-4000-8000-000000000001',
  sessionId: 'session-1',
  memberships: new Map([[organizationA, ROLES.COOPERATIVE_ADMIN]]),
};

const cases: readonly {
  readonly name: string;
  readonly controller: ControllerClass;
  readonly method: string;
  readonly params: Record<string, string>;
}[] = [
  { name: 'pilots', controller: PilotsController, method: 'get', params: { pilotId: 'pilot-b' } },
  {
    name: 'pilot evaluation',
    controller: PilotEvaluationController,
    method: 'evaluation',
    params: { pilotId: 'pilot-b' },
  },
  {
    name: 'pilot imports',
    controller: PilotImportController,
    method: 'list',
    params: { pilotId: 'pilot-b' },
  },
  {
    name: 'pilot evidence',
    controller: PilotEvidenceController,
    method: 'overview',
    params: { pilotId: 'pilot-b' },
  },
  {
    name: 'pilot participants',
    controller: PilotParticipantsController,
    method: 'list',
    params: { pilotId: 'pilot-b' },
  },
  {
    name: 'coffee configuration',
    controller: CoffeeConfigurationController,
    method: 'listEffectiveQualityDefinitions',
    params: { organizationId: organizationB },
  },
  {
    name: 'operations',
    controller: OperationsController,
    method: 'updateIncident',
    params: { incidentId: 'incident-b' },
  },
  {
    name: 'organizations',
    controller: OrganizationsController,
    method: 'get',
    params: { organizationId: organizationB },
  },
  { name: 'admin users', controller: UsersController, method: 'get', params: { userId: 'user-b' } },
  { name: 'admin Hedera', controller: HederaAdminController, method: 'status', params: {} },
];

describe('cross-organization authorization', () => {
  for (const testCase of cases) {
    it(`denies an org A cooperative administrator in ${testCase.name}`, async () => {
      const resolver: Pick<ScopeResolverService, 'resolve'> = {
        resolve: vi.fn().mockResolvedValue({ organizationId: organizationB }),
      };
      const guard = new PermissionsGuard(new Reflector(), resolver);
      const request = {
        principal,
        params: testCase.params,
      } as AuthenticatedRequest;
      const handler = Reflect.get(testCase.controller.prototype, testCase.method) as (
        ...args: never[]
      ) => unknown;
      const context = new ExecutionContextHost([request], testCase.controller, handler);
      context.setType('http');

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    });
  }
});
