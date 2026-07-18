import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@clycites/auth';
import type {
  CreateOrganizationMembership,
  UpdateOrganizationMembership,
} from '@clycites/contracts';

import { AuditService } from '../audit/audit.service.js';
import { rethrowKnownConflict } from '../common/prisma-errors.js';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class MembershipsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(organizationId: string) {
    const memberships = await this.database.client.organizationMembership.findMany({
      where: { organizationId },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });
    return memberships.map((membership) => ({
      id: membership.id,
      userId: membership.userId,
      role: membership.role,
      status: membership.status,
      joinedAt: membership.joinedAt?.toISOString() ?? null,
      user: {
        firstName: membership.user.firstName,
        lastName: membership.user.lastName,
        email: membership.user.email,
      },
    }));
  }

  async create(
    organizationId: string,
    input: CreateOrganizationMembership,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const user = await this.database.client.user.findFirst({
      where: { id: input.userId, status: 'ACTIVE', deletedAt: null },
    });
    if (!user) throw new NotFoundException('User not found');
    try {
      return await this.database.client.$transaction(async (transaction) => {
        const membership = await transaction.organizationMembership.create({
          data: {
            organizationId,
            userId: input.userId,
            role: input.role,
            status: input.status,
            invitedByUserId: principal.subjectId,
            ...(input.status === 'ACTIVE' ? { joinedAt: new Date() } : {}),
          },
        });
        await this.audit.create(
          {
            organizationId,
            actorUserId: principal.subjectId,
            action: 'ORGANIZATION_MEMBERSHIP_ADDED',
            entityType: 'OrganizationMembership',
            entityId: membership.id,
            requestId,
            metadata: { role: membership.role, status: membership.status },
          },
          transaction,
        );
        return membership;
      });
    } catch (error) {
      return rethrowKnownConflict(error, 'User is already a member of this organization');
    }
  }

  async update(
    organizationId: string,
    membershipId: string,
    input: UpdateOrganizationMembership,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const membership = await this.find(organizationId, membershipId);
    if (
      membership.role === 'COOPERATIVE_ADMIN' &&
      ((input.role && input.role !== 'COOPERATIVE_ADMIN') ||
        (input.status && input.status !== 'ACTIVE'))
    )
      await this.assertAnotherAdmin(organizationId, membership.id);
    return this.database.client.$transaction(async (transaction) => {
      const updated = await transaction.organizationMembership.update({
        where: { id: membershipId },
        data: {
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.status === 'ACTIVE' && !membership.joinedAt ? { joinedAt: new Date() } : {}),
        },
      });
      await this.audit.create(
        {
          organizationId,
          actorUserId: principal.subjectId,
          action:
            membership.role !== updated.role
              ? 'ORGANIZATION_MEMBERSHIP_ROLE_CHANGED'
              : 'ORGANIZATION_MEMBERSHIP_UPDATED',
          entityType: 'OrganizationMembership',
          entityId: membershipId,
          requestId,
          metadata: {
            previousRole: membership.role,
            role: updated.role,
            previousStatus: membership.status,
            status: updated.status,
          },
        },
        transaction,
      );
      return updated;
    });
  }

  async remove(
    organizationId: string,
    membershipId: string,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const membership = await this.find(organizationId, membershipId);
    if (membership.role === 'COOPERATIVE_ADMIN' && membership.status === 'ACTIVE')
      await this.assertAnotherAdmin(organizationId, membership.id);
    return this.database.client.$transaction(async (transaction) => {
      const removed = await transaction.organizationMembership.update({
        where: { id: membershipId },
        data: { status: 'REMOVED' },
      });
      await this.audit.create(
        {
          organizationId,
          actorUserId: principal.subjectId,
          action: 'ORGANIZATION_MEMBERSHIP_REMOVED',
          entityType: 'OrganizationMembership',
          entityId: membershipId,
          requestId,
          metadata: { role: membership.role },
        },
        transaction,
      );
      return removed;
    });
  }

  private async find(organizationId: string, id: string) {
    const membership = await this.database.client.organizationMembership.findFirst({
      where: { id, organizationId },
    });
    if (!membership) throw new NotFoundException('Membership not found');
    return membership;
  }

  private async assertAnotherAdmin(organizationId: string, excludingId: string): Promise<void> {
    const count = await this.database.client.organizationMembership.count({
      where: {
        organizationId,
        id: { not: excludingId },
        role: 'COOPERATIVE_ADMIN',
        status: 'ACTIVE',
      },
    });
    if (count === 0)
      throw new ConflictException('Assign another active cooperative administrator first');
  }
}
