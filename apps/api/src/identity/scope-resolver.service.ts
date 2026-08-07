import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';
import type { AuthenticatedRequest } from '../observability/request-context.js';
import type { ScopedEntity } from './identity.decorators.js';

export interface ScopeResolution {
  readonly organizationId: string | null;
}

@Injectable()
export class ScopeResolverService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async resolve(
    entity: ScopedEntity,
    entityId: string,
    request: AuthenticatedRequest,
  ): Promise<ScopeResolution | null> {
    const cache = (request.organizationScopeCache ??= new Map());
    const cacheKey = `${entity}:${entityId}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

    const resolution = await this.resolveFromDatabase(entity, entityId);
    cache.set(cacheKey, resolution);
    return resolution;
  }

  private async resolveFromDatabase(
    entity: ScopedEntity,
    entityId: string,
  ): Promise<ScopeResolution | null> {
    switch (entity) {
      case 'pilot':
        return this.database.client.pilot.findUnique({
          where: { id: entityId },
          select: { organizationId: true },
        });
      case 'pilot-support-case':
        return this.database.client.pilotSupportCase.findUnique({
          where: { id: entityId },
          select: { organizationId: true },
        });
      case 'pilot-farmer-import':
        return (
          (
            await this.database.client.pilotFarmerImport.findUnique({
              where: { id: entityId },
              select: { pilot: { select: { organizationId: true } } },
            })
          )?.pilot ?? null
        );
      case 'training-assignment':
        return (
          (
            await this.database.client.trainingAssignment.findUnique({
              where: { id: entityId },
              select: { pilot: { select: { organizationId: true } } },
            })
          )?.pilot ?? null
        );
      case 'operational-incident':
        return this.database.client.operationalIncident.findUnique({
          where: { id: entityId },
          select: { organizationId: true },
        });
      case 'data-subject-request':
        return this.database.client.dataSubjectRequest.findUnique({
          where: { id: entityId },
          select: { organizationId: true },
        });
      case 'data-retention-policy':
        return this.database.client.dataRetentionPolicy.findUnique({
          where: { id: entityId },
          select: { organizationId: true },
        });
      case 'notification-delivery':
        return this.database.client.notificationDelivery.findUnique({
          where: { id: entityId },
          select: { organizationId: true },
        });
    }
  }
}
