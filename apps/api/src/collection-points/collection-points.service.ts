import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@clycites/auth';
import type { CreateCollectionPoint, UpdateCollectionPoint } from '@clycites/contracts';
import { AuditService } from '../audit/audit.service.js';
import { DomainEventService } from '../audit/domain-event.service.js';
import { rethrowKnownConflict } from '../common/prisma-errors.js';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class CollectionPointsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DomainEventService) private readonly events: DomainEventService,
  ) {}
  async create(
    organizationId: string,
    input: CreateCollectionPoint,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    try {
      const point = await this.database.client.$transaction(async (transaction) => {
        const created = await transaction.collectionPoint.create({
          data: { organizationId, ...input },
        });
        await this.audit.create(
          {
            organizationId,
            actorUserId: principal.subjectId,
            action: 'COLLECTION_POINT_CREATED',
            entityType: 'CollectionPoint',
            entityId: created.id,
            requestId,
            metadata: { code: created.code },
          },
          transaction,
        );
        await this.events.create(
          {
            aggregateType: 'CollectionPoint',
            aggregateId: created.id,
            eventType: 'COLLECTION_POINT_CREATED',
            payload: { organizationId, collectionPointId: created.id },
          },
          transaction,
        );
        return created;
      });
      return this.serialize(point, true);
    } catch (error) {
      return rethrowKnownConflict(
        error,
        'Collection point code already exists in this organization',
      );
    }
  }
  async list(
    organizationId: string,
    page: number,
    pageSize: number,
    status?: 'ACTIVE' | 'INACTIVE' | 'CLOSED',
  ) {
    const where = { organizationId, deletedAt: null, ...(status ? { status } : {}) };
    const [items, totalItems] = await this.database.client.$transaction([
      this.database.client.collectionPoint.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.database.client.collectionPoint.count({ where }),
    ]);
    return {
      items: items.map((item) => this.serialize(item, false)),
      pagination: { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) },
    };
  }
  async get(organizationId: string, id: string) {
    const point = await this.database.client.collectionPoint.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!point) throw new NotFoundException('Collection point not found');
    return this.serialize(point, true);
  }
  async update(
    organizationId: string,
    id: string,
    input: UpdateCollectionPoint,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const current = await this.database.client.collectionPoint.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!current) throw new NotFoundException('Collection point not found');
    try {
      const point = await this.database.client.$transaction(async (transaction) => {
        const updated = await transaction.collectionPoint.update({
          where: { id },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.code !== undefined ? { code: input.code } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(input.district !== undefined ? { district: input.district } : {}),
            ...(input.subCounty !== undefined ? { subCounty: input.subCounty } : {}),
            ...(input.parish !== undefined ? { parish: input.parish } : {}),
            ...(input.village !== undefined ? { village: input.village } : {}),
            ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
            ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
            ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
          },
        });
        await this.audit.create(
          {
            organizationId,
            actorUserId: principal.subjectId,
            action: 'COLLECTION_POINT_UPDATED',
            entityType: 'CollectionPoint',
            entityId: id,
            requestId,
            metadata: { fields: Object.keys(input) },
          },
          transaction,
        );
        return updated;
      });
      return this.serialize(point, true);
    } catch (error) {
      return rethrowKnownConflict(
        error,
        'Collection point code already exists in this organization',
      );
    }
  }
  private serialize(
    point: {
      id: string;
      name: string;
      code: string;
      status: string;
      district: string;
      subCounty: string | null;
      parish: string | null;
      village: string | null;
      latitude: { toString(): string } | null;
      longitude: { toString(): string } | null;
      timezone: string;
    },
    includeCoordinates: boolean,
  ) {
    return {
      id: point.id,
      name: point.name,
      code: point.code,
      status: point.status,
      district: point.district,
      subCounty: point.subCounty,
      parish: point.parish,
      village: point.village,
      timezone: point.timezone,
      ...(includeCoordinates
        ? {
            latitude: point.latitude?.toString() ?? null,
            longitude: point.longitude?.toString() ?? null,
          }
        : {}),
    };
  }
}
