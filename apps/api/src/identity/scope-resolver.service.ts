import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';
import type { AuthenticatedRequest } from '../observability/request-context.js';
import type { ScopedEntity } from './identity.decorators.js';

export interface ScopeResolution {
  readonly organizationId: string | null;
}

@Injectable()
export class ScopeResolverService {
  private readonly resolvers: Record<
    ScopedEntity,
    (entityId: string) => Promise<ScopeResolution | null>
  >;

  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {
    this.resolvers = {
      pilot: (entityId) =>
        this.database.client.pilot.findUnique({
          where: { id: entityId },
          select: { organizationId: true },
        }),
      'pilot-support-case': (entityId) =>
        this.database.client.pilotSupportCase.findUnique({
          where: { id: entityId },
          select: { organizationId: true },
        }),
      'pilot-farmer-import': async (entityId) =>
        (
          await this.database.client.pilotFarmerImport.findUnique({
            where: { id: entityId },
            select: { pilot: { select: { organizationId: true } } },
          })
        )?.pilot ?? null,
      'training-assignment': async (entityId) =>
        (
          await this.database.client.trainingAssignment.findUnique({
            where: { id: entityId },
            select: { pilot: { select: { organizationId: true } } },
          })
        )?.pilot ?? null,
      'operational-incident': (entityId) =>
        this.database.client.operationalIncident.findUnique({
          where: { id: entityId },
          select: { organizationId: true },
        }),
      'data-subject-request': (entityId) =>
        this.database.client.dataSubjectRequest.findUnique({
          where: { id: entityId },
          select: { organizationId: true },
        }),
      'data-retention-policy': (entityId) =>
        this.database.client.dataRetentionPolicy.findUnique({
          where: { id: entityId },
          select: { organizationId: true },
        }),
      'notification-delivery': (entityId) =>
        this.database.client.notificationDelivery.findUnique({
          where: { id: entityId },
          select: { organizationId: true },
        }),
    };
  }

  supports(entity: ScopedEntity): boolean {
    return Object.hasOwn(this.resolvers, entity);
  }

  async resolve(
    entity: ScopedEntity,
    entityId: string,
    request: AuthenticatedRequest,
  ): Promise<ScopeResolution | null> {
    const cache = (request.organizationScopeCache ??= new Map());
    const cacheKey = `${entity}:${entityId}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

    const resolution = await this.resolvers[entity](entityId);
    cache.set(cacheKey, resolution);
    return resolution;
  }
}
