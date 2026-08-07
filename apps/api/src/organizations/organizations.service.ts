import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ROLES, type AuthenticatedPrincipal } from '@clycites/auth';
import type { CreateOrganization, UpdateOrganization } from '@clycites/contracts';

import { AuditService } from '../audit/audit.service.js';
import { DomainEventService } from '../audit/domain-event.service.js';
import { rethrowKnownConflict } from '../common/prisma-errors.js';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class OrganizationsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DomainEventService) private readonly events: DomainEventService,
  ) {}

  async create(input: CreateOrganization, principal: AuthenticatedPrincipal, requestId: string) {
    try {
      const organization = await this.database.client.$transaction(async (transaction) => {
        if (input.initialAdministratorUserId) {
          const administrator = await transaction.user.findFirst({
            where: { id: input.initialAdministratorUserId, status: 'ACTIVE', deletedAt: null },
          });
          if (!administrator) throw new NotFoundException('Initial administrator user not found');
        }
        const created = await transaction.organization.create({
          data: {
            name: input.name,
            slug: input.slug,
            type: input.type,
            status: input.status,
            registrationNumber: input.registrationNumber,
            phone: input.phone,
            email: input.email,
            district: input.district,
            subCounty: input.subCounty,
            address: input.address,
          },
        });
        if (input.initialAdministratorUserId) {
          await transaction.organizationMembership.create({
            data: {
              organizationId: created.id,
              userId: input.initialAdministratorUserId,
              role: 'COOPERATIVE_ADMIN',
              status: 'ACTIVE',
              invitedByUserId: principal.subjectId,
              joinedAt: new Date(),
            },
          });
        }
        await this.audit.create(
          {
            organizationId: created.id,
            actorUserId: principal.subjectId,
            action: 'ORGANIZATION_CREATED',
            entityType: 'Organization',
            entityId: created.id,
            requestId,
            metadata: { type: created.type },
          },
          transaction,
        );
        await this.events.create(
          {
            aggregateType: 'Organization',
            aggregateId: created.id,
            eventType: 'ORGANIZATION_CREATED',
            payload: { organizationId: created.id, type: created.type },
          },
          transaction,
        );
        return created;
      });
      return this.serialize(organization);
    } catch (error) {
      return rethrowKnownConflict(error, 'Organization slug or membership already exists');
    }
  }

  async list(principal: AuthenticatedPrincipal) {
    const platformAdmin = principal.platformRole === ROLES.PLATFORM_ADMIN;
    const allowedIds = [...principal.memberships.keys()];
    const organizations = await this.database.client.organization.findMany({
      where: { deletedAt: null, ...(!platformAdmin ? { id: { in: allowedIds } } : {}) },
      orderBy: { name: 'asc' },
    });
    return organizations.map((organization) => this.serialize(organization));
  }

  async get(organizationId: string) {
    const organization = await this.database.client.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
    });
    if (!organization) throw new NotFoundException('Organization not found');
    return this.serialize(organization);
  }

  async update(
    organizationId: string,
    input: UpdateOrganization,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const current = await this.database.client.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
    });
    if (!current) throw new NotFoundException('Organization not found');
    try {
      const updated = await this.database.client.$transaction(async (transaction) => {
        const organization = await transaction.organization.update({
          where: { id: organizationId },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.slug !== undefined ? { slug: input.slug } : {}),
            ...(input.type !== undefined ? { type: input.type } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(input.registrationNumber !== undefined
              ? { registrationNumber: input.registrationNumber }
              : {}),
            ...(input.phone !== undefined ? { phone: input.phone } : {}),
            ...(input.email !== undefined ? { email: input.email } : {}),
            ...(input.district !== undefined ? { district: input.district } : {}),
            ...(input.subCounty !== undefined ? { subCounty: input.subCounty } : {}),
            ...(input.address !== undefined ? { address: input.address } : {}),
          },
        });
        await this.audit.create(
          {
            organizationId,
            actorUserId: principal.subjectId,
            action: 'ORGANIZATION_UPDATED',
            entityType: 'Organization',
            entityId: organizationId,
            requestId,
            metadata: { fields: Object.keys(input) },
          },
          transaction,
        );
        return organization;
      });
      return this.serialize(updated);
    } catch (error) {
      return rethrowKnownConflict(error, 'Organization slug already exists');
    }
  }

  private serialize(organization: {
    id: string;
    name: string;
    slug: string;
    type: string;
    status: string;
    registrationNumber: string | null;
    phone: string | null;
    email: string | null;
    district: string | null;
    subCounty: string | null;
    address: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      ...organization,
      createdAt: organization.createdAt.toISOString(),
      updatedAt: organization.updatedAt.toISOString(),
    };
  }
}
