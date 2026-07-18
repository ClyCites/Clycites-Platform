import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@clycites/auth';
import type {
  CloseCollectionSession,
  OpenCollectionSession,
  RegisterDevice,
} from '@clycites/contracts';

import { AuditService } from '../audit/audit.service.js';
import { DomainEventService } from '../audit/domain-event.service.js';
import { rethrowKnownConflict } from '../common/prisma-errors.js';
import { DatabaseService } from '../database/database.service.js';

interface SnapshotQuery {
  collectionPointId: string;
  deviceId: string;
  collectionSessionId: string;
  updatedSince?: string | undefined;
}

@Injectable()
export class CollectionOperationsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DomainEventService) private readonly events: DomainEventService,
  ) {}

  async listDevices(organizationId: string) {
    const devices = await this.database.client.registeredDevice.findMany({
      where: { organizationId },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
    return devices.map((device) => this.serializeDevice(device));
  }

  async registerDevice(
    organizationId: string,
    input: RegisterDevice,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const device = await this.database.client.$transaction(async (transaction) => {
      const membership = await transaction.organizationMembership.findFirst({
        where: { organizationId, userId: input.assignedUserId, status: 'ACTIVE' },
      });
      if (!membership) throw new NotFoundException('Active assigned user membership not found');
      const created = await transaction.registeredDevice.create({
        data: {
          organizationId,
          assignedUserId: input.assignedUserId,
          devicePublicId: `dev_${randomUUID()}`,
          name: input.name,
          platform: input.platform,
        },
      });
      await this.audit.create(
        {
          organizationId,
          actorUserId: principal.subjectId,
          action: 'DEVICE_REGISTERED',
          entityType: 'RegisteredDevice',
          entityId: created.id,
          requestId,
          metadata: { assignedUserId: input.assignedUserId },
        },
        transaction,
      );
      await this.events.create(
        {
          aggregateType: 'RegisteredDevice',
          aggregateId: created.id,
          eventType: 'DEVICE_REGISTERED',
          payload: { organizationId, deviceId: created.id, assignedUserId: input.assignedUserId },
        },
        transaction,
      );
      return created;
    });
    return this.serializeDevice(device);
  }

  async revokeDevice(
    organizationId: string,
    deviceId: string,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const revokedAt = new Date();
    const device = await this.database.client.$transaction(async (transaction) => {
      const existing = await transaction.registeredDevice.findFirst({
        where: { id: deviceId, organizationId },
      });
      if (!existing) throw new NotFoundException('Device not found');
      if (existing.status !== 'ACTIVE') return existing;
      await transaction.collectionSession.updateMany({
        where: { deviceId, status: 'OPEN' },
        data: { status: 'SUSPENDED', closedAt: revokedAt },
      });
      const updated = await transaction.registeredDevice.update({
        where: { id: deviceId },
        data: { status: 'REVOKED', revokedAt },
      });
      await this.audit.create(
        {
          organizationId,
          actorUserId: principal.subjectId,
          action: 'DEVICE_REVOKED',
          entityType: 'RegisteredDevice',
          entityId: deviceId,
          requestId,
        },
        transaction,
      );
      await this.events.create(
        {
          aggregateType: 'RegisteredDevice',
          aggregateId: deviceId,
          eventType: 'DEVICE_REVOKED',
          payload: { organizationId, deviceId },
        },
        transaction,
      );
      return updated;
    });
    return this.serializeDevice(device);
  }

  async listSessions(organizationId: string) {
    const sessions = await this.database.client.collectionSession.findMany({
      where: { organizationId },
      orderBy: { openedAt: 'desc' },
      take: 100,
    });
    return sessions.map((session) => this.serializeSession(session));
  }

  async openSession(
    organizationId: string,
    input: OpenCollectionSession,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    try {
      const session = await this.database.client.$transaction(async (transaction) => {
        const [device, collectionPoint, existingSession] = await Promise.all([
          transaction.registeredDevice.findFirst({
            where: {
              id: input.deviceId,
              organizationId,
              assignedUserId: principal.subjectId,
              status: 'ACTIVE',
            },
          }),
          transaction.collectionPoint.findFirst({
            where: {
              id: input.collectionPointId,
              organizationId,
              status: 'ACTIVE',
              deletedAt: null,
            },
          }),
          transaction.collectionSession.findFirst({
            where: {
              organizationId,
              collectionPointId: input.collectionPointId,
              agentUserId: principal.subjectId,
              deviceId: input.deviceId,
              status: 'OPEN',
            },
          }),
        ]);
        if (!device) throw new ForbiddenException('Active assigned device required');
        if (!collectionPoint) throw new NotFoundException('Active collection point not found');
        if (existingSession) return existingSession;
        const created = await transaction.collectionSession.create({
          data: {
            organizationId,
            collectionPointId: input.collectionPointId,
            agentUserId: principal.subjectId,
            deviceId: input.deviceId,
            businessDate: new Date(`${input.businessDate}T00:00:00.000Z`),
            ...(input.notes ? { notes: input.notes } : {}),
          },
        });
        await this.audit.create(
          {
            organizationId,
            actorUserId: principal.subjectId,
            action: 'COLLECTION_SESSION_OPENED',
            entityType: 'CollectionSession',
            entityId: created.id,
            requestId,
          },
          transaction,
        );
        await this.events.create(
          {
            aggregateType: 'CollectionSession',
            aggregateId: created.id,
            eventType: 'COLLECTION_SESSION_OPENED',
            payload: {
              organizationId,
              collectionPointId: input.collectionPointId,
              deviceId: input.deviceId,
            },
          },
          transaction,
        );
        return created;
      });
      return this.serializeSession(session);
    } catch (error) {
      return rethrowKnownConflict(
        error,
        'An open collection session already exists for this device and collection point',
      );
    }
  }

  async closeSession(
    organizationId: string,
    sessionId: string,
    input: CloseCollectionSession,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const session = await this.database.client.$transaction(async (transaction) => {
      const existing = await transaction.collectionSession.findFirst({
        where: { id: sessionId, organizationId },
      });
      if (!existing) throw new NotFoundException('Collection session not found');
      if (existing.status !== 'OPEN') throw new ConflictException('Collection session is not open');
      const updated = await transaction.collectionSession.update({
        where: { id: sessionId },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          ...(input.notes ? { notes: input.notes } : {}),
        },
      });
      await this.audit.create(
        {
          organizationId,
          actorUserId: principal.subjectId,
          action: 'COLLECTION_SESSION_CLOSED',
          entityType: 'CollectionSession',
          entityId: sessionId,
          requestId,
        },
        transaction,
      );
      await this.events.create(
        {
          aggregateType: 'CollectionSession',
          aggregateId: sessionId,
          eventType: 'COLLECTION_SESSION_CLOSED',
          payload: { organizationId, collectionSessionId: sessionId },
        },
        transaction,
      );
      return updated;
    });
    return this.serializeSession(session);
  }

  async snapshot(organizationId: string, query: SnapshotQuery, principal: AuthenticatedPrincipal) {
    const since = query.updatedSince ? new Date(query.updatedSince) : undefined;
    const [point, session] = await Promise.all([
      this.database.client.collectionPoint.findFirst({
        where: { id: query.collectionPointId, organizationId, status: 'ACTIVE', deletedAt: null },
      }),
      this.database.client.collectionSession.findFirst({
        where: {
          id: query.collectionSessionId,
          organizationId,
          collectionPointId: query.collectionPointId,
          deviceId: query.deviceId,
          agentUserId: principal.subjectId,
          status: 'OPEN',
          device: { status: 'ACTIVE', assignedUserId: principal.subjectId },
        },
      }),
    ]);
    if (!point) throw new NotFoundException('Active collection point not found');
    if (!session) throw new ForbiddenException('Active assigned device and open session required');

    const membershipWhere = {
      organizationId,
      registeredAtCollectionPointId: query.collectionPointId,
      ...(since ? { updatedAt: { gt: since } } : {}),
    };
    const [memberships, qrIdentities, farms, commodities, definitions] = await Promise.all([
      this.database.client.farmerOrganizationMembership.findMany({
        where: membershipWhere,
        include: { farmer: true },
      }),
      this.database.client.farmerQrIdentity.findMany({
        where: {
          organizationId,
          farmer: {
            organizationMemberships: {
              some: { registeredAtCollectionPointId: query.collectionPointId },
            },
          },
          ...(since ? { updatedAt: { gt: since } } : {}),
        },
      }),
      this.database.client.farm.findMany({
        where: {
          organizationId,
          farmer: {
            organizationMemberships: {
              some: { registeredAtCollectionPointId: query.collectionPointId },
            },
          },
          ...(since ? { updatedAt: { gt: since } } : {}),
        },
      }),
      this.database.client.commodity.findMany({
        where: { status: 'ACTIVE' },
        include: { forms: { where: { status: 'ACTIVE' }, orderBy: { name: 'asc' } } },
        orderBy: { name: 'asc' },
      }),
      this.database.client.qualityAttributeDefinition.findMany({
        where: { status: 'ACTIVE', OR: [{ organizationId: null }, { organizationId }] },
        orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
      }),
    ]);
    const serverTime = new Date().toISOString();
    const effectiveDefinitions = new Map<string, (typeof definitions)[number]>();
    for (const definition of definitions) {
      const key = `${definition.commodityFormId}:${definition.code}`;
      if (!effectiveDefinitions.has(key) || definition.organizationId === organizationId) {
        effectiveDefinitions.set(key, definition);
      }
    }
    return {
      organizationId,
      collectionPoint: { id: point.id, name: point.name, code: point.code, status: point.status },
      farmers: memberships
        .filter(
          (membership) => membership.status === 'ACTIVE' && membership.farmer.status === 'ACTIVE',
        )
        .map((membership) => ({
          id: membership.farmer.id,
          farmerNumber: membership.farmer.farmerNumber,
          displayName: [
            membership.farmer.firstName,
            membership.farmer.middleName,
            membership.farmer.lastName,
          ]
            .filter(Boolean)
            .join(' '),
          membershipId: membership.id,
          membershipNumber: membership.membershipNumber,
          membershipStatus: membership.status,
          updatedAt: membership.updatedAt.toISOString(),
        })),
      qrIdentities: qrIdentities
        .filter((identity) => identity.status === 'ACTIVE')
        .map((identity) => ({
          publicId: identity.publicId,
          farmerId: identity.farmerId,
          status: identity.status,
          updatedAt: identity.updatedAt.toISOString(),
        })),
      farms: farms
        .filter((farm) => farm.status === 'ACTIVE' && !farm.deletedAt)
        .map((farm) => ({
          id: farm.id,
          farmerId: farm.farmerId,
          name: farm.name,
          district: farm.district,
          village: farm.village,
          status: farm.status,
          updatedAt: farm.updatedAt.toISOString(),
        })),
      commodities: commodities.map((commodity) => ({
        id: commodity.id,
        code: commodity.code,
        name: commodity.name,
        description: commodity.description,
        status: commodity.status,
        forms: commodity.forms.map((form) => ({
          id: form.id,
          commodityId: form.commodityId,
          code: form.code,
          name: form.name,
          description: form.description,
          defaultUnit: form.defaultUnit,
          status: form.status,
        })),
      })),
      qualityDefinitions: [...effectiveDefinitions.values()].map((definition) => ({
        id: definition.id,
        commodityFormId: definition.commodityFormId,
        organizationId: definition.organizationId,
        code: definition.code,
        name: definition.name,
        description: definition.description,
        dataType: definition.dataType,
        unit: definition.unit,
        required: definition.required,
        minimumValue: definition.minimumValue?.toString() ?? null,
        maximumValue: definition.maximumValue?.toString() ?? null,
        allowedValues: Array.isArray(definition.allowedValues) ? definition.allowedValues : null,
        displayOrder: definition.displayOrder,
        status: definition.status,
      })),
      tombstones: [
        ...memberships
          .filter(
            (membership) => membership.status !== 'ACTIVE' || membership.farmer.status !== 'ACTIVE',
          )
          .map((membership) => ({
            entityType: 'FARMER_MEMBERSHIP' as const,
            entityId: membership.id,
            status: membership.status,
            updatedAt: membership.updatedAt.toISOString(),
          })),
        ...qrIdentities
          .filter((identity) => identity.status !== 'ACTIVE')
          .map((identity) => ({
            entityType: 'QR_IDENTITY' as const,
            entityId: identity.publicId,
            status: identity.status,
            updatedAt: identity.updatedAt.toISOString(),
          })),
        ...farms
          .filter((farm) => farm.status !== 'ACTIVE' || farm.deletedAt)
          .map((farm) => ({
            entityType: 'FARM' as const,
            entityId: farm.id,
            status: farm.status,
            updatedAt: farm.updatedAt.toISOString(),
          })),
      ],
      serverTime,
      dataVersion: serverTime,
      nextCursor: serverTime,
    };
  }

  private serializeDevice(device: {
    id: string;
    organizationId: string;
    assignedUserId: string;
    devicePublicId: string;
    name: string;
    platform: string;
    status: 'ACTIVE' | 'REVOKED' | 'LOST' | 'REPLACED';
    lastSeenAt: Date | null;
    registeredAt: Date;
    revokedAt: Date | null;
  }) {
    return {
      ...device,
      lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
      registeredAt: device.registeredAt.toISOString(),
      revokedAt: device.revokedAt?.toISOString() ?? null,
    };
  }

  private serializeSession(session: {
    id: string;
    organizationId: string;
    collectionPointId: string;
    agentUserId: string;
    deviceId: string;
    businessDate: Date;
    status: 'OPEN' | 'CLOSED' | 'SUSPENDED';
    openedAt: Date;
    closedAt: Date | null;
    notes: string | null;
  }) {
    return {
      ...session,
      businessDate: session.businessDate.toISOString().slice(0, 10),
      openedAt: session.openedAt.toISOString(),
      closedAt: session.closedAt?.toISOString() ?? null,
    };
  }
}
