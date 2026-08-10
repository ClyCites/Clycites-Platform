import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@clycites/auth';
import type { CreateFarm, CreateFarmPlot, UpdateFarm, UpdateFarmStatus } from '@clycites/contracts';

import { AuditService } from '../audit/audit.service.js';
import { DomainEventService } from '../audit/domain-event.service.js';
import { DatabaseService } from '../database/database.service.js';
import {
  declaredHectares,
  isAreaDiscrepancyFlagged,
  validateFarmPlotBoundary,
} from '../location/location-provenance.service.js';

@Injectable()
export class FarmsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DomainEventService) private readonly events: DomainEventService,
  ) {}

  async create(
    organizationId: string,
    farmerId: string,
    input: CreateFarm,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    await this.assertFarmer(organizationId, farmerId);
    const farm = await this.database.client.$transaction(async (transaction) => {
      const created = await transaction.farm.create({
        data: {
          farmerId,
          organizationId,
          name: input.name,
          district: input.district,
          ...(input.subCounty ? { subCounty: input.subCounty } : {}),
          ...(input.parish ? { parish: input.parish } : {}),
          ...(input.village ? { village: input.village } : {}),
          latitude: input.latitude,
          longitude: input.longitude,
          locationMethod: input.locationMethod,
          locatedByUserId: principal.subjectId,
          ...(input.locationAccuracyMeters !== undefined
            ? { locationAccuracyMeters: input.locationAccuracyMeters }
            : {}),
          locatedAt: input.locatedAt ? new Date(input.locatedAt) : new Date(),
          totalArea: input.totalArea,
          areaUnit: input.areaUnit,
          ...(input.ownershipType ? { ownershipType: input.ownershipType } : {}),
          ...(input.waterSource ? { waterSource: input.waterSource } : {}),
        },
      });
      await this.audit.create(
        {
          organizationId,
          actorUserId: principal.subjectId,
          action: 'FARM_CREATED',
          entityType: 'Farm',
          entityId: created.id,
          requestId,
        },
        transaction,
      );
      await this.events.create(
        {
          aggregateType: 'Farm',
          aggregateId: created.id,
          eventType: 'FARM_REGISTERED',
          payload: { organizationId, farmerId, farmId: created.id },
        },
        transaction,
      );
      return created;
    });
    return this.serialize(farm);
  }

  async list(organizationId: string, farmerId: string) {
    await this.assertFarmer(organizationId, farmerId);
    const farms = await this.database.client.farm.findMany({
      where: { farmerId, organizationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return farms.map((farm) => this.serialize(farm));
  }

  async get(organizationId: string, farmerId: string, farmId: string) {
    const farm = await this.database.client.farm.findFirst({
      where: { id: farmId, farmerId, organizationId, deletedAt: null },
    });
    if (!farm) throw new NotFoundException('Farm not found');
    return this.serialize(farm);
  }

  async update(
    organizationId: string,
    farmerId: string,
    farmId: string,
    input: UpdateFarm,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    await this.get(organizationId, farmerId, farmId);
    const data = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.district !== undefined ? { district: input.district } : {}),
      ...(input.subCounty !== undefined ? { subCounty: input.subCounty } : {}),
      ...(input.parish !== undefined ? { parish: input.parish } : {}),
      ...(input.village !== undefined ? { village: input.village } : {}),
      ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
      ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
      ...(input.locationAccuracyMeters !== undefined
        ? { locationAccuracyMeters: input.locationAccuracyMeters }
        : {}),
      ...(input.locationMethod !== undefined ? { locationMethod: input.locationMethod } : {}),
      ...(input.locatedAt !== undefined
        ? { locatedAt: new Date(input.locatedAt) }
        : input.latitude !== undefined || input.longitude !== undefined
          ? { locatedAt: new Date() }
          : {}),
      ...(input.latitude !== undefined || input.longitude !== undefined
        ? { locatedByUserId: principal.subjectId }
        : {}),
      ...(input.totalArea !== undefined ? { totalArea: input.totalArea } : {}),
      ...(input.areaUnit !== undefined ? { areaUnit: input.areaUnit } : {}),
      ...(input.ownershipType !== undefined ? { ownershipType: input.ownershipType } : {}),
      ...(input.waterSource !== undefined ? { waterSource: input.waterSource } : {}),
    };
    const farm = await this.database.client.$transaction(async (transaction) => {
      const updated = await transaction.farm.update({ where: { id: farmId }, data });
      await this.audit.create(
        {
          organizationId,
          actorUserId: principal.subjectId,
          action: 'FARM_UPDATED',
          entityType: 'Farm',
          entityId: farmId,
          requestId,
          metadata: { fields: Object.keys(data) },
        },
        transaction,
      );
      return updated;
    });
    return this.serialize(farm);
  }

  async createPlot(
    organizationId: string,
    farmerId: string,
    farmId: string,
    input: CreateFarmPlot,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const farm = await this.database.client.farm.findFirst({
      where: { id: farmId, farmerId, organizationId, deletedAt: null },
      select: { totalArea: true, areaUnit: true },
    });
    if (!farm) throw new NotFoundException('Farm not found');
    const geometry = validateFarmPlotBoundary(input.boundary);
    const areaDiscrepancyFlagged = isAreaDiscrepancyFlagged(
      geometry.computedHectares,
      declaredHectares(farm.totalArea.toString(), farm.areaUnit),
    );
    const plot = await this.database.client.$transaction(async (transaction) => {
      const created = await transaction.farmPlot.create({
        data: {
          farmId,
          plotNumber: input.plotNumber,
          boundary: geometry.boundary,
          vertexCount: geometry.vertexCount,
          centroidLatitude: geometry.centroidLatitude,
          centroidLongitude: geometry.centroidLongitude,
          computedHectares: geometry.computedHectares,
          surveyMethod: input.surveyMethod,
          ...(input.surveyAccuracyMeters !== undefined
            ? { surveyAccuracyMeters: input.surveyAccuracyMeters }
            : {}),
          surveyedAt: new Date(input.surveyedAt),
          surveyedByUserId: principal.subjectId,
          areaDiscrepancyFlagged,
        },
      });
      await this.audit.create(
        {
          organizationId,
          actorUserId: principal.subjectId,
          action: 'FARM_PLOT_CREATED',
          entityType: 'FarmPlot',
          entityId: created.id,
          requestId,
          metadata: { farmerId, farmId, areaDiscrepancyFlagged },
        },
        transaction,
      );
      return created;
    });
    return this.serializePlot(plot);
  }

  async listPlots(organizationId: string, farmerId: string, farmId: string) {
    await this.get(organizationId, farmerId, farmId);
    const plots = await this.database.client.farmPlot.findMany({
      where: { farmId, deletedAt: null },
      orderBy: { plotNumber: 'asc' },
    });
    return plots.map((plot) => this.serializePlot(plot));
  }

  async updateStatus(
    organizationId: string,
    farmerId: string,
    farmId: string,
    input: UpdateFarmStatus,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    await this.get(organizationId, farmerId, farmId);
    const farm = await this.database.client.$transaction(async (transaction) => {
      const updated = await transaction.farm.update({
        where: { id: farmId },
        data: { status: input.status },
      });
      await this.audit.create(
        {
          organizationId,
          actorUserId: principal.subjectId,
          action: 'FARM_STATUS_CHANGED',
          entityType: 'Farm',
          entityId: farmId,
          requestId,
          metadata: { status: input.status },
        },
        transaction,
      );
      return updated;
    });
    return this.serialize(farm);
  }

  private async assertFarmer(organizationId: string, farmerId: string): Promise<void> {
    const membership = await this.database.client.farmerOrganizationMembership.findFirst({
      where: {
        organizationId,
        farmerId,
        status: { in: ['ACTIVE', 'SUSPENDED'] },
        farmer: { deletedAt: null },
      },
    });
    if (!membership) throw new NotFoundException('Farmer not found');
  }

  private serialize(farm: {
    id: string;
    farmerId: string;
    name: string;
    district: string;
    subCounty: string | null;
    parish: string | null;
    village: string | null;
    latitude: { toString(): string } | null;
    longitude: { toString(): string } | null;
    locationAccuracyMeters: number | null;
    locationMethod: string | null;
    locatedAt: Date | null;
    totalArea: { toString(): string };
    areaUnit: string;
    ownershipType: string | null;
    waterSource: string | null;
    status: string;
  }) {
    return {
      id: farm.id,
      farmerId: farm.farmerId,
      name: farm.name,
      district: farm.district,
      subCounty: farm.subCounty,
      parish: farm.parish,
      village: farm.village,
      latitude: farm.latitude?.toString() ?? null,
      longitude: farm.longitude?.toString() ?? null,
      locationAccuracyMeters: farm.locationAccuracyMeters,
      locationMethod: farm.locationMethod,
      locatedAt: farm.locatedAt?.toISOString() ?? null,
      totalArea: farm.totalArea.toString(),
      areaUnit: farm.areaUnit,
      ownershipType: farm.ownershipType,
      waterSource: farm.waterSource,
      status: farm.status,
    };
  }

  private serializePlot(plot: {
    id: string;
    farmId: string;
    plotNumber: string;
    boundary: unknown;
    vertexCount: number;
    centroidLatitude: { toString(): string };
    centroidLongitude: { toString(): string };
    computedHectares: { toString(): string };
    surveyMethod: string;
    surveyAccuracyMeters: number | null;
    surveyedAt: Date;
    areaDiscrepancyFlagged: boolean;
  }) {
    return {
      id: plot.id,
      farmId: plot.farmId,
      plotNumber: plot.plotNumber,
      boundary: plot.boundary,
      vertexCount: plot.vertexCount,
      centroidLatitude: plot.centroidLatitude.toString(),
      centroidLongitude: plot.centroidLongitude.toString(),
      computedHectares: plot.computedHectares.toString(),
      surveyMethod: plot.surveyMethod,
      surveyAccuracyMeters: plot.surveyAccuracyMeters,
      surveyedAt: plot.surveyedAt.toISOString(),
      areaDiscrepancyFlagged: plot.areaDiscrepancyFlagged,
    };
  }
}
