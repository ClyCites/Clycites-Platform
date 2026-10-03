import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { hash } from 'argon2';
import { ConflictException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createDatabaseClient } from '@clycites/database';
import type { AuthenticatedPrincipal } from '@clycites/auth';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { MembershipsService } from '../src/memberships/memberships.service.js';
import { AdministrationService } from '../src/dashboard/administration.service.js';
import { UsersService } from '../src/users/users.service.js';

const database = createDatabaseClient();
const organizationId = randomUUID();
const userIds = [randomUUID(), randomUUID()];
const membershipIds: string[] = [];
const actor: AuthenticatedPrincipal = {
  subjectId: '00000000-0000-4000-8000-000000000101',
  sessionId: randomUUID(),
  platformRole: 'PLATFORM_ADMIN',
  memberships: new Map(),
};

describe.sequential('administrator lifecycle concurrency', () => {
  let app: INestApplication;
  let memberships: MembershipsService;
  let users: UsersService;
  let administration: AdministrationService;
  beforeAll(async () => {
    await database.organization.create({
      data: {
        id: organizationId,
        name: 'Identity admin race fixture',
        slug: `identity-admin-${organizationId}`,
        type: 'COOPERATIVE',
        status: 'ACTIVE',
      },
    });
    const passwordHash = await hash('Identity-administration-2026!');
    for (const id of userIds) {
      await database.user.create({
        data: {
          id,
          email: `${id}@identity.test`,
          firstName: 'Admin',
          lastName: 'Regression',
          passwordHash,
          status: 'ACTIVE',
          accountClass: 'STAFF',
        },
      });
      const membership = await database.organizationMembership.create({
        data: { userId: id, organizationId, role: 'COOPERATIVE_ADMIN', status: 'ACTIVE' },
      });
      membershipIds.push(membership.id);
    }
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    memberships = app.get(MembershipsService);
    users = app.get(UsersService);
    administration = app.get(AdministrationService);
  });
  afterAll(async () => {
    if (app) await app.close();
    await database.organizationMembership.deleteMany({ where: { organizationId } });
    await database.auditEvent.deleteMany({
      where: { OR: [{ organizationId }, { entityId: { in: userIds } }] },
    });
    await database.customRole.deleteMany({ where: { organizationId } });
    await database.organization.deleteMany({ where: { id: organizationId } });
    await database.user.deleteMany({ where: { id: { in: userIds } } });
    await database.$disconnect();
  });
  it('cannot remove both remaining administrators concurrently', async () => {
    const results = await Promise.allSettled(
      membershipIds.map((id) => memberships.remove(organizationId, id, actor, randomUUID())),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.status === 'rejected' ? rejected.reason : undefined).toBeInstanceOf(
      ConflictException,
    );
    expect(
      await database.organizationMembership.count({
        where: { organizationId, role: 'COOPERATIVE_ADMIN', status: 'ACTIVE' },
      }),
    ).toBe(1);
  });
  it('does not disable the last organization administrator or leave a partial account update', async () => {
    const remaining = await database.organizationMembership.findFirstOrThrow({
      where: { organizationId, status: 'ACTIVE' },
    });
    await expect(
      users.updateStatus(remaining.userId, { status: 'SUSPENDED' }, actor, randomUUID()),
    ).rejects.toThrow(ConflictException);
    expect(
      (await database.user.findUniqueOrThrow({ where: { id: remaining.userId } })).status,
    ).toBe('ACTIVE');
  });
  it('does not count a suspended account as a usable replacement administrator', async () => {
    const remaining = await database.organizationMembership.findFirstOrThrow({
      where: { organizationId, status: 'ACTIVE' },
    });
    const other = userIds.find((id) => id !== remaining.userId)!;
    await database.organizationMembership.updateMany({
      where: { organizationId, userId: other },
      data: { status: 'ACTIVE' },
    });
    await database.user.update({ where: { id: other }, data: { status: 'SUSPENDED' } });
    await expect(
      memberships.update(organizationId, remaining.id, { role: 'VIEWER' }, actor, randomUUID()),
    ).rejects.toThrow(ConflictException);
    await database.user.update({ where: { id: other }, data: { status: 'ACTIVE' } });
  });
  it('rejects competing custom-role updates at the same version without mixing permission sets', async () => {
    const role = await administration.createCustomRole(
      organizationId,
      { name: 'Identity version fixture', permissions: ['device.read'] },
      actor.subjectId,
      randomUUID(),
    );
    const results = await Promise.allSettled(
      ['device.read', 'farmer.read'].map((permission) =>
        administration.updateCustomRole(
          organizationId,
          role.id,
          { version: role.version, permissions: [permission] },
          actor.subjectId,
          randomUUID(),
        ),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.status === 'rejected' ? rejected.reason : undefined).toBeInstanceOf(
      ConflictException,
    );
    const current = await database.customRole.findUniqueOrThrow({
      where: { id: role.id },
      include: { permissions: true },
    });
    expect(current.version).toBe(role.version + 1);
    expect(current.permissions).toHaveLength(1);
  });
  it('reports no effective permissions for an inactive membership', async () => {
    await database.organizationMembership.update({
      where: { id: membershipIds[0]! },
      data: { status: 'SUSPENDED' },
    });
    const result = await administration.effectivePermissions(organizationId, membershipIds[0]!);
    expect(result.permissions).toEqual([]);
    expect(result.customRoleIds).toEqual([]);
  });
  it('preserves one active platform administrator during competing account suspensions', async () => {
    // Only this isolated test database is changed; restore seeded platform accounts afterwards.
    const existing = await database.user.findMany({
      where: { platformRole: 'PLATFORM_ADMIN' },
      select: { id: true, status: true },
    });
    await database.user.updateMany({
      where: { id: { in: userIds } },
      data: { platformRole: 'PLATFORM_ADMIN' },
    });
    await database.organizationMembership.updateMany({
      where: { organizationId },
      data: { role: 'VIEWER' },
    });
    try {
      await database.user.updateMany({
        where: { id: { in: existing.map((user) => user.id) } },
        data: { status: 'SUSPENDED' },
      });
      const results = await Promise.allSettled(
        userIds.map((id, index) =>
          users.updateStatus(
            id,
            { status: 'SUSPENDED' },
            { ...actor, subjectId: userIds[1 - index]! },
            randomUUID(),
          ),
        ),
      );
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find((result) => result.status === 'rejected');
      expect(rejected?.status === 'rejected' ? rejected.reason : undefined).toBeInstanceOf(
        ConflictException,
      );
      expect(
        await database.user.count({
          where: { id: { in: userIds }, status: 'ACTIVE', platformRole: 'PLATFORM_ADMIN' },
        }),
      ).toBe(1);
    } finally {
      for (const user of existing)
        await database.user.update({ where: { id: user.id }, data: { status: user.status } });
    }
  });
});
