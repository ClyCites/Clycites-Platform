import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@clycites/auth';
import type { GrantConsent, WithdrawConsent } from '@clycites/contracts';

import { AuditService } from '../audit/audit.service.js';
import { DomainEventService } from '../audit/domain-event.service.js';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class ConsentsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DomainEventService) private readonly events: DomainEventService,
  ) {}

  async grant(
    organizationId: string,
    farmerId: string,
    input: GrantConsent,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    await this.assertFarmer(organizationId, farmerId);
    const consent = await this.database.client.$transaction(async (transaction) => {
      const record = await transaction.farmerConsent.create({
        data: {
          farmerId,
          organizationId,
          consentType: input.consentType,
          policyVersion: input.policyVersion,
          status: 'GRANTED',
          capturedByUserId: principal.subjectId,
          captureMethod: input.captureMethod,
          ...(input.notes ? { notes: input.notes } : {}),
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
      return record;
    });
    return this.serialize(consent);
  }

  async list(organizationId: string, farmerId: string) {
    await this.assertFarmer(organizationId, farmerId);
    const records = await this.database.client.farmerConsent.findMany({
      where: { organizationId, farmerId },
      orderBy: { capturedAt: 'desc' },
    });
    return records.map((record) => this.serialize(record));
  }

  async withdraw(
    organizationId: string,
    farmerId: string,
    consentId: string,
    input: WithdrawConsent,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const consent = await this.database.client.farmerConsent.findFirst({
      where: { id: consentId, organizationId, farmerId },
    });
    if (!consent) throw new NotFoundException('Consent record not found');
    if (consent.status !== 'GRANTED' || consent.withdrawnAt)
      throw new ConflictException('Consent is not active');
    const withdrawal = await this.database.client.$transaction(async (transaction) => {
      const now = new Date();
      await transaction.farmerConsent.update({
        where: { id: consentId },
        data: { withdrawnAt: now },
      });
      const record = await transaction.farmerConsent.create({
        data: {
          farmerId,
          organizationId,
          consentType: consent.consentType,
          policyVersion: consent.policyVersion,
          status: 'WITHDRAWN',
          capturedByUserId: principal.subjectId,
          captureMethod: consent.captureMethod,
          capturedAt: now,
          withdrawnAt: now,
          ...(input.notes ? { notes: input.notes } : {}),
        },
      });
      await this.audit.create(
        {
          organizationId,
          actorUserId: principal.subjectId,
          action: 'FARMER_CONSENT_WITHDRAWN',
          entityType: 'FarmerConsent',
          entityId: record.id,
          requestId,
          metadata: { consentType: record.consentType, grantRecordId: consent.id },
        },
        transaction,
      );
      await this.events.create(
        {
          aggregateType: 'Farmer',
          aggregateId: farmerId,
          eventType: 'FARMER_CONSENT_WITHDRAWN',
          payload: { organizationId, farmerId, consentType: record.consentType },
        },
        transaction,
      );
      return record;
    });
    return this.serialize(withdrawal);
  }

  private async assertFarmer(organizationId: string, farmerId: string): Promise<void> {
    const membership = await this.database.client.farmerOrganizationMembership.findFirst({
      where: { organizationId, farmerId, farmer: { deletedAt: null } },
    });
    if (!membership) throw new NotFoundException('Farmer not found');
  }
  private serialize(record: {
    id: string;
    consentType: string;
    policyVersion: string;
    status: string;
    captureMethod: string;
    capturedAt: Date;
    withdrawnAt: Date | null;
    notes: string | null;
  }) {
    return {
      ...record,
      capturedAt: record.capturedAt.toISOString(),
      withdrawnAt: record.withdrawnAt?.toISOString() ?? null,
    };
  }
}
