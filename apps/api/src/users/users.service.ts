import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { argon2id, hash } from 'argon2';
import type { AuthenticatedPrincipal } from '@clycites/auth';
import type { CreateUser, UpdateUserStatus } from '@clycites/contracts';

import {
  assertAnotherOrganizationAdmin,
  lockOrganizationAdministration,
} from '../identity/administration-locks.js';
import { AuditService } from '../audit/audit.service.js';
import { rethrowKnownConflict } from '../common/prisma-errors.js';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class UsersService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async create(input: CreateUser, principal: AuthenticatedPrincipal, requestId: string) {
    try {
      const user = await this.database.client.$transaction(async (transaction) => {
        const created = await transaction.user.create({
          data: {
            email: input.email,
            ...(input.phone ? { phone: input.phone } : {}),
            passwordHash: (await hash(input.password, { type: argon2id })) as string,
            firstName: input.firstName,
            lastName: input.lastName,
            status: 'ACTIVE',
            ...(input.platformRole ? { platformRole: input.platformRole } : {}),
          },
        });
        await this.audit.create(
          {
            actorUserId: principal.subjectId,
            action: 'USER_CREATED',
            entityType: 'User',
            entityId: created.id,
            requestId,
          },
          transaction,
        );
        return created;
      });
      return this.serialize(user);
    } catch (error) {
      return rethrowKnownConflict(error, 'A user with that email already exists');
    }
  }

  async list() {
    const users = await this.database.client.user.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return users.map((user) => this.serialize(user));
  }

  async get(userId: string) {
    const user = await this.database.client.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.serialize(user);
  }

  async updateStatus(
    userId: string,
    input: UpdateUserStatus,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    if (userId === principal.subjectId && input.status !== 'ACTIVE')
      throw new ConflictException('You cannot disable your own account');
    const updated = await this.database.client.$transaction(async (transaction) => {
      // Shared platform lock prevents two administrators disabling each other concurrently.
      await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('identity:account-status', 0)) IS NULL AS locked`;
      const current = await transaction.user.findFirst({ where: { id: userId, deletedAt: null } });
      if (!current) throw new NotFoundException('User not found');
      if (current.status === 'ACTIVE' && input.status !== 'ACTIVE') {
        if (current.platformRole === 'PLATFORM_ADMIN') {
          const others = await transaction.user.count({
            where: {
              id: { not: userId },
              platformRole: 'PLATFORM_ADMIN',
              status: 'ACTIVE',
              deletedAt: null,
            },
          });
          if (others === 0)
            throw new ConflictException('Assign another active platform administrator first');
        }
        const memberships = await transaction.organizationMembership.findMany({
          where: { userId, role: 'COOPERATIVE_ADMIN', status: 'ACTIVE' },
          orderBy: { organizationId: 'asc' },
        });
        for (const membership of memberships) {
          await lockOrganizationAdministration(transaction, membership.organizationId);
          await assertAnotherOrganizationAdmin(transaction, membership.organizationId, { userId });
        }
      }
      const user = await transaction.user.update({
        where: { id: userId },
        data: { status: input.status },
      });
      if (input.status !== 'ACTIVE')
        await transaction.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      await this.audit.create(
        {
          actorUserId: principal.subjectId,
          action: 'USER_STATUS_CHANGED',
          entityType: 'User',
          entityId: userId,
          requestId,
          metadata: { previousStatus: current.status, status: input.status },
        },
        transaction,
      );
      return user;
    });
    return this.serialize(updated);
  }

  private serialize(user: {
    id: string;
    email: string | null;
    phone: string | null;
    firstName: string;
    lastName: string;
    status: string;
    platformRole: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      platformRole: user.platformRole,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }
}
