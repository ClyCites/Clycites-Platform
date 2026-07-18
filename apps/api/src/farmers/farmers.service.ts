import { randomBytes } from 'node:crypto';

import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@clycites/database';
import type { AuthenticatedPrincipal } from '@clycites/auth';
import type { CreateFarmer, UpdateFarmer, UpdateFarmerStatus } from '@clycites/contracts';

import { AuditService } from '../audit/audit.service.js';
import { DomainEventService } from '../audit/domain-event.service.js';
import { rethrowKnownConflict } from '../common/prisma-errors.js';
import type { ApiEnvironment } from '../config/environment.js';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class FarmersService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ConfigService) private readonly config: ConfigService<ApiEnvironment, true>,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DomainEventService) private readonly events: DomainEventService,
  ) {}

  async create(
    organizationId: string,
    input: CreateFarmer,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    try {
      const farmerId = crypto.randomUUID();
      await this.database.client.$transaction(async (transaction) => {
        if (input.registeredAtCollectionPointId) {
          const point = await transaction.collectionPoint.findFirst({
            where: {
              id: input.registeredAtCollectionPointId,
              organizationId,
              status: 'ACTIVE',
              deletedAt: null,
            },
          });
          if (!point) throw new NotFoundException('Collection point not found');
        }
        await transaction.farmer.create({
          data: {
            id: farmerId,
            farmerNumber: input.farmerNumber,
            firstName: input.firstName,
            ...(input.middleName ? { middleName: input.middleName } : {}),
            lastName: input.lastName,
            ...(input.preferredName ? { preferredName: input.preferredName } : {}),
            ...(input.gender ? { gender: input.gender } : {}),
            ...(input.dateOfBirth
              ? { dateOfBirth: new Date(`${input.dateOfBirth}T00:00:00.000Z`) }
              : {}),
            ...(input.primaryPhone ? { primaryPhone: input.primaryPhone } : {}),
            ...(input.alternativePhone ? { alternativePhone: input.alternativePhone } : {}),
            ...(input.email ? { email: input.email } : {}),
            district: input.district,
            ...(input.subCounty ? { subCounty: input.subCounty } : {}),
            ...(input.parish ? { parish: input.parish } : {}),
            ...(input.village ? { village: input.village } : {}),
            status: 'ACTIVE',
            registeredByUserId: principal.subjectId,
          },
        });
        await transaction.farmerOrganizationMembership.create({
          data: {
            farmerId,
            organizationId,
            ...(input.membershipNumber ? { membershipNumber: input.membershipNumber } : {}),
            status: 'ACTIVE',
            joinedAt: new Date(),
            ...(input.registeredAtCollectionPointId
              ? { registeredAtCollectionPointId: input.registeredAtCollectionPointId }
              : {}),
          },
        });

        if (input.initialFarm) {
          const initialFarm = input.initialFarm;
          const farm = await transaction.farm.create({
            data: {
              farmerId,
              organizationId,
              name: initialFarm.name,
              district: initialFarm.district,
              ...(initialFarm.subCounty ? { subCounty: initialFarm.subCounty } : {}),
              ...(initialFarm.parish ? { parish: initialFarm.parish } : {}),
              ...(initialFarm.village ? { village: initialFarm.village } : {}),
              ...(initialFarm.latitude ? { latitude: initialFarm.latitude } : {}),
              ...(initialFarm.longitude ? { longitude: initialFarm.longitude } : {}),
              totalArea: initialFarm.totalArea,
              areaUnit: initialFarm.areaUnit,
              ...(initialFarm.ownershipType ? { ownershipType: initialFarm.ownershipType } : {}),
              ...(initialFarm.waterSource ? { waterSource: initialFarm.waterSource } : {}),
            },
          });
          await this.audit.create(
            {
              organizationId,
              actorUserId: principal.subjectId,
              action: 'FARM_CREATED',
              entityType: 'Farm',
              entityId: farm.id,
              requestId,
            },
            transaction,
          );
          await this.events.create(
            {
              aggregateType: 'Farm',
              aggregateId: farm.id,
              eventType: 'FARM_REGISTERED',
              payload: { organizationId, farmerId, farmId: farm.id },
            },
            transaction,
          );
        }
        for (const consent of input.initialConsents ?? []) {
          const record = await transaction.farmerConsent.create({
            data: {
              farmerId,
              organizationId,
              consentType: consent.consentType,
              policyVersion: consent.policyVersion,
              captureMethod: consent.captureMethod,
              ...(consent.notes ? { notes: consent.notes } : {}),
              status: 'GRANTED',
              capturedByUserId: principal.subjectId,
            },
          });
          await this.audit.create(
            {
              organizationId,
              actorUserId: principal.subjectId,
              action: 'FARMER_CONSENT_GRANTED',
              entityType: 'FarmerConsent',
              entityId: record.id,
              requestId,
              metadata: { consentType: record.consentType, policyVersion: record.policyVersion },
            },
            transaction,
          );
          await this.events.create(
            {
              aggregateType: 'Farmer',
              aggregateId: farmerId,
              eventType: 'FARMER_CONSENT_GRANTED',
              payload: {
                organizationId,
                farmerId,
                consentType: record.consentType,
                policyVersion: record.policyVersion,
              },
            },
            transaction,
          );
        }
        if (input.issueQrIdentity) {
          const qr = await transaction.farmerQrIdentity.create({
            data: {
              farmerId,
              organizationId,
              publicId: this.publicId(),
              issuedByUserId: principal.subjectId,
            },
          });
          await this.audit.create(
            {
              organizationId,
              actorUserId: principal.subjectId,
              action: 'FARMER_QR_ISSUED',
              entityType: 'FarmerQrIdentity',
              entityId: qr.id,
              requestId,
            },
            transaction,
          );
          await this.events.create(
            {
              aggregateType: 'Farmer',
              aggregateId: farmerId,
              eventType: 'FARMER_QR_ISSUED',
              payload: { organizationId, farmerId, qrIdentityId: qr.id },
            },
            transaction,
          );
        }
        await this.audit.create(
          {
            organizationId,
            actorUserId: principal.subjectId,
            action: 'FARMER_REGISTERED',
            entityType: 'Farmer',
            entityId: farmerId,
            requestId,
          },
          transaction,
        );
        await this.events.create(
          {
            aggregateType: 'Farmer',
            aggregateId: farmerId,
            eventType: 'FARMER_REGISTERED',
            payload: { organizationId, farmerId },
          },
          transaction,
        );
      });
      return this.get(organizationId, farmerId);
    } catch (error) {
      return rethrowKnownConflict(
        error,
        'Farmer number, membership, or active QR identity already exists',
      );
    }
  }

  async list(
    organizationId: string,
    page: number,
    pageSize: number,
    search?: string,
    status?: 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'INACTIVE' | 'DECEASED',
  ) {
    const farmerSearch: Prisma.FarmerWhereInput[] = search
      ? [
          { farmerNumber: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { primaryPhone: { endsWith: search } },
        ]
      : [];
    const farmerScope: Prisma.FarmerWhereInput = { deletedAt: null, ...(status ? { status } : {}) };
    const where: Prisma.FarmerOrganizationMembershipWhereInput = {
      organizationId,
      farmer: farmerScope,
      ...(search
        ? {
            OR: [
              { membershipNumber: { contains: search, mode: 'insensitive' } },
              { farmer: { ...farmerScope, OR: farmerSearch } },
            ],
          }
        : {}),
    };
    const [memberships, totalItems] = await this.database.client.$transaction([
      this.database.client.farmerOrganizationMembership.findMany({
        where,
        include: { farmer: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.database.client.farmerOrganizationMembership.count({ where }),
    ]);
    return {
      items: memberships.map((membership) =>
        this.listItem(membership.farmer, membership.membershipNumber),
      ),
      pagination: { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) },
    };
  }

  async get(organizationId: string, farmerId: string) {
    const membership = await this.database.client.farmerOrganizationMembership.findFirst({
      where: { farmerId, organizationId },
      include: { farmer: true },
    });
    if (!membership || membership.farmer.deletedAt) throw new NotFoundException('Farmer not found');
    const farmer = membership.farmer;
    return {
      ...this.listItem(farmer, membership.membershipNumber),
      firstName: farmer.firstName,
      middleName: farmer.middleName,
      lastName: farmer.lastName,
      preferredName: farmer.preferredName,
      gender: farmer.gender,
      dateOfBirth: farmer.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      primaryPhone: farmer.primaryPhone,
      alternativePhone: farmer.alternativePhone,
      email: farmer.email,
      subCounty: farmer.subCounty,
      parish: farmer.parish,
    };
  }

  async update(
    organizationId: string,
    farmerId: string,
    input: UpdateFarmer,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    await this.get(organizationId, farmerId);
    const data = {
      ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
      ...(input.middleName !== undefined ? { middleName: input.middleName } : {}),
      ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
      ...(input.preferredName !== undefined ? { preferredName: input.preferredName } : {}),
      ...(input.gender !== undefined ? { gender: input.gender } : {}),
      ...(input.dateOfBirth !== undefined
        ? { dateOfBirth: new Date(`${input.dateOfBirth}T00:00:00.000Z`) }
        : {}),
      ...(input.primaryPhone !== undefined ? { primaryPhone: input.primaryPhone } : {}),
      ...(input.alternativePhone !== undefined ? { alternativePhone: input.alternativePhone } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.district !== undefined ? { district: input.district } : {}),
      ...(input.subCounty !== undefined ? { subCounty: input.subCounty } : {}),
      ...(input.parish !== undefined ? { parish: input.parish } : {}),
      ...(input.village !== undefined ? { village: input.village } : {}),
    };
    await this.database.client.$transaction(async (transaction) => {
      await transaction.farmer.update({ where: { id: farmerId }, data });
      await this.audit.create(
        {
          organizationId,
          actorUserId: principal.subjectId,
          action: 'FARMER_UPDATED',
          entityType: 'Farmer',
          entityId: farmerId,
          requestId,
          metadata: { fields: Object.keys(data) },
        },
        transaction,
      );
      await this.events.create(
        {
          aggregateType: 'Farmer',
          aggregateId: farmerId,
          eventType: 'FARMER_UPDATED',
          payload: { organizationId, farmerId, fields: Object.keys(data) },
        },
        transaction,
      );
    });
    return this.get(organizationId, farmerId);
  }

  async updateStatus(
    organizationId: string,
    farmerId: string,
    input: UpdateFarmerStatus,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const current = await this.get(organizationId, farmerId);
    await this.database.client.$transaction(async (transaction) => {
      await transaction.farmer.update({ where: { id: farmerId }, data: { status: input.status } });
      await this.audit.create(
        {
          organizationId,
          actorUserId: principal.subjectId,
          action: 'FARMER_STATUS_CHANGED',
          entityType: 'Farmer',
          entityId: farmerId,
          requestId,
          metadata: { previousStatus: current.status, status: input.status },
        },
        transaction,
      );
    });
    return this.get(organizationId, farmerId);
  }

  private listItem(
    farmer: {
      id: string;
      farmerNumber: string;
      firstName: string;
      preferredName: string | null;
      lastName: string;
      district: string;
      village: string | null;
      status: string;
    },
    membershipNumber: string | null,
  ) {
    return {
      id: farmer.id,
      farmerNumber: farmer.farmerNumber,
      displayName: `${farmer.preferredName ?? farmer.firstName} ${farmer.lastName}`,
      district: farmer.district,
      village: farmer.village,
      status: farmer.status,
      membershipNumber,
    };
  }
  private publicId(): string {
    return `fq1_${randomBytes(24).toString('base64url')}`;
  }
  qrPayload(publicId: string): string {
    return `${this.config.get('QR_PUBLIC_BASE_URL', { infer: true })}/farmer-card/v1/${publicId}`;
  }
}
