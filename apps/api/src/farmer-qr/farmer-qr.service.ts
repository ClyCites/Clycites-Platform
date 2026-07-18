import { randomBytes } from 'node:crypto';

import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedPrincipal } from '@clycites/auth';
import type { IssueQrIdentity } from '@clycites/contracts';

import { AuditService } from '../audit/audit.service.js';
import { DomainEventService } from '../audit/domain-event.service.js';
import { rethrowKnownConflict } from '../common/prisma-errors.js';
import type { ApiEnvironment } from '../config/environment.js';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class FarmerQrService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ConfigService) private readonly config: ConfigService<ApiEnvironment, true>,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DomainEventService) private readonly events: DomainEventService,
  ) {}

  async issue(
    organizationId: string,
    farmerId: string,
    input: IssueQrIdentity,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    await this.assertFarmer(organizationId, farmerId);
    try {
      const identity = await this.database.client.$transaction(async (transaction) => {
        const created = await transaction.farmerQrIdentity.create({
          data: {
            farmerId,
            organizationId,
            publicId: this.publicId(),
            issuedByUserId: principal.subjectId,
            ...(input.expiresAt ? { expiresAt: new Date(input.expiresAt) } : {}),
          },
        });
        await this.audit.create(
          {
            organizationId,
            actorUserId: principal.subjectId,
            action: 'FARMER_QR_ISSUED',
            entityType: 'FarmerQrIdentity',
            entityId: created.id,
            requestId,
          },
          transaction,
        );
        await this.events.create(
          {
            aggregateType: 'Farmer',
            aggregateId: farmerId,
            eventType: 'FARMER_QR_ISSUED',
            payload: { organizationId, farmerId, qrIdentityId: created.id },
          },
          transaction,
        );
        return created;
      });
      return this.serialize(identity);
    } catch (error) {
      return rethrowKnownConflict(error, 'An active QR identity already exists for this farmer');
    }
  }

  async list(organizationId: string, farmerId: string) {
    await this.assertFarmer(organizationId, farmerId);
    const identities = await this.database.client.farmerQrIdentity.findMany({
      where: { organizationId, farmerId },
      orderBy: { issuedAt: 'desc' },
    });
    return identities.map((identity) => this.serialize(identity));
  }

  async revoke(
    organizationId: string,
    farmerId: string,
    identityId: string,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const identity = await this.find(organizationId, farmerId, identityId);
    if (identity.status !== 'ACTIVE') throw new ConflictException('QR identity is not active');
    const updated = await this.database.client.$transaction(async (transaction) => {
      const revoked = await transaction.farmerQrIdentity.update({
        where: { id: identityId },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });
      await this.audit.create(
        {
          organizationId,
          actorUserId: principal.subjectId,
          action: 'FARMER_QR_REVOKED',
          entityType: 'FarmerQrIdentity',
          entityId: identityId,
          requestId,
        },
        transaction,
      );
      await this.events.create(
        {
          aggregateType: 'Farmer',
          aggregateId: farmerId,
          eventType: 'FARMER_QR_REVOKED',
          payload: { organizationId, farmerId, qrIdentityId: identityId },
        },
        transaction,
      );
      return revoked;
    });
    return this.serialize(updated);
  }

  async replace(
    organizationId: string,
    farmerId: string,
    identityId: string,
    input: IssueQrIdentity,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const identity = await this.find(organizationId, farmerId, identityId);
    if (identity.status !== 'ACTIVE') throw new ConflictException('QR identity is not active');
    const replacement = await this.database.client.$transaction(async (transaction) => {
      await transaction.farmerQrIdentity.update({
        where: { id: identityId },
        data: { status: 'REPLACED', revokedAt: new Date() },
      });
      const created = await transaction.farmerQrIdentity.create({
        data: {
          farmerId,
          organizationId,
          publicId: this.publicId(),
          issuedByUserId: principal.subjectId,
          ...(input.expiresAt ? { expiresAt: new Date(input.expiresAt) } : {}),
        },
      });
      await transaction.farmerQrIdentity.update({
        where: { id: identityId },
        data: { replacedById: created.id },
      });
      await this.audit.create(
        {
          organizationId,
          actorUserId: principal.subjectId,
          action: 'FARMER_QR_REPLACED',
          entityType: 'FarmerQrIdentity',
          entityId: identityId,
          requestId,
          metadata: { replacementIdentityId: created.id },
        },
        transaction,
      );
      await this.events.create(
        {
          aggregateType: 'Farmer',
          aggregateId: farmerId,
          eventType: 'FARMER_QR_REPLACED',
          payload: {
            organizationId,
            farmerId,
            previousQrIdentityId: identityId,
            qrIdentityId: created.id,
          },
        },
        transaction,
      );
      return created;
    });
    return this.serialize(replacement);
  }

  async lookup(
    organizationId: string,
    publicId: string,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const identity = await this.database.client.farmerQrIdentity.findFirst({
      where: { organizationId, publicId },
      include: { farmer: true },
    });
    if (
      !identity ||
      identity.status !== 'ACTIVE' ||
      identity.revokedAt ||
      (identity.expiresAt && identity.expiresAt <= new Date()) ||
      identity.farmer.deletedAt
    )
      throw new NotFoundException('Active farmer identity not found');
    const membership = await this.database.client.farmerOrganizationMembership.findUnique({
      where: { farmerId_organizationId: { farmerId: identity.farmerId, organizationId } },
    });
    if (!membership || membership.status !== 'ACTIVE')
      throw new NotFoundException('Active farmer identity not found');
    await this.audit.create({
      organizationId,
      actorUserId: principal.subjectId,
      action: 'FARMER_QR_LOOKUP_PERFORMED',
      entityType: 'Farmer',
      entityId: identity.farmerId,
      requestId,
      metadata: { qrIdentityId: identity.id },
    });
    return {
      farmerId: identity.farmer.id,
      farmerNumber: identity.farmer.farmerNumber,
      displayName: `${identity.farmer.preferredName ?? identity.farmer.firstName} ${identity.farmer.lastName}`,
      membershipNumber: membership.membershipNumber,
      status: identity.farmer.status,
      district: identity.farmer.district,
      village: identity.farmer.village,
    };
  }

  private async find(organizationId: string, farmerId: string, id: string) {
    const identity = await this.database.client.farmerQrIdentity.findFirst({
      where: { id, organizationId, farmerId },
    });
    if (!identity) throw new NotFoundException('QR identity not found');
    return identity;
  }
  private async assertFarmer(organizationId: string, farmerId: string): Promise<void> {
    const membership = await this.database.client.farmerOrganizationMembership.findFirst({
      where: { organizationId, farmerId, farmer: { deletedAt: null } },
    });
    if (!membership) throw new NotFoundException('Farmer not found');
  }
  private publicId(): string {
    return `fq1_${randomBytes(24).toString('base64url')}`;
  }
  private payload(publicId: string): string {
    return `${this.config.get('QR_PUBLIC_BASE_URL', { infer: true })}/farmer-card/v1/${publicId}`;
  }
  private serialize(identity: {
    id: string;
    publicId: string;
    status: string;
    issuedAt: Date;
    expiresAt: Date | null;
    revokedAt: Date | null;
  }) {
    return {
      id: identity.id,
      publicId: identity.publicId,
      status: identity.status,
      issuedAt: identity.issuedAt.toISOString(),
      expiresAt: identity.expiresAt?.toISOString() ?? null,
      revokedAt: identity.revokedAt?.toISOString() ?? null,
      payload: this.payload(identity.publicId),
    };
  }
}
