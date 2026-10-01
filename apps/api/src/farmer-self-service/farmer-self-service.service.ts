import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { dataSubjectRequestTypeSchema } from '@clycites/contracts';
import { z } from 'zod';

import { AuditService } from '../audit/audit.service.js';
import { parseWithSchema } from '../common/validation.js';
import { DatabaseService } from '../database/database.service.js';

const privacyRequestSchema = z
  .object({
    requestType: dataSubjectRequestTypeSchema,
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

const selfServiceConsentTypes = new Set([
  'TRACEABILITY',
  'MARKETPLACE_VISIBILITY',
  'SMS_NOTIFICATIONS',
]);

@Injectable()
export class FarmerSelfServiceService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async profile(farmerId: string, userId: string) {
    const farmer = await this.database.client.farmer.findFirst({
      where: { id: farmerId, status: 'ACTIVE', deletedAt: null },
      include: {
        organizationMemberships: {
          where: { status: 'ACTIVE' },
          include: { organization: { select: { id: true, name: true } } },
        },
      },
    });
    if (!farmer) throw new NotFoundException('Farmer profile not found');
    const notifications = await this.database.client.notificationDelivery.findMany({
      where: {
        recipientType: 'USER',
        recipientReference: userId,
        channel: 'IN_APP',
        templateCode: 'FARMER_ACCOUNT_RESET',
      },
      select: { id: true, parameters: true, deliveredAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return {
      id: farmer.id,
      farmerNumber: farmer.farmerNumber,
      firstName: farmer.firstName,
      middleName: farmer.middleName,
      lastName: farmer.lastName,
      preferredName: farmer.preferredName,
      gender: farmer.gender,
      dateOfBirth: farmer.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      primaryPhone: farmer.primaryPhone,
      alternativePhone: farmer.alternativePhone,
      email: farmer.email,
      district: farmer.district,
      subCounty: farmer.subCounty,
      parish: farmer.parish,
      village: farmer.village,
      organizations: farmer.organizationMemberships.map((membership) => ({
        id: membership.organization.id,
        name: membership.organization.name,
        membershipNumber: membership.membershipNumber,
      })),
      notifications: notifications.map((notification) => ({
        id: notification.id,
        parameters: notification.parameters,
        deliveredAt: notification.deliveredAt?.toISOString() ?? null,
        createdAt: notification.createdAt.toISOString(),
      })),
    };
  }

  async deliveries(farmerId: string) {
    const deliveries = await this.database.client.delivery.findMany({
      where: { farmerId },
      include: {
        organization: { select: { id: true, name: true } },
        commodity: { select: { name: true } },
        commodityForm: { select: { name: true } },
        measurements: true,
        pricing: true,
      },
      orderBy: { serverReceivedAt: 'desc' },
    });
    return deliveries.map((delivery) => this.serializeDelivery(delivery));
  }

  async delivery(farmerId: string, deliveryId: string) {
    const delivery = await this.database.client.delivery.findFirst({
      where: { id: deliveryId, farmerId },
      include: {
        organization: { select: { id: true, name: true } },
        commodity: { select: { name: true } },
        commodityForm: { select: { name: true } },
        measurements: true,
        pricing: true,
      },
    });
    if (!delivery) throw new NotFoundException('Delivery not found');
    return this.serializeDelivery(delivery);
  }

  async settlements(farmerId: string) {
    const settlements = await this.database.client.farmerSettlement.findMany({
      where: { farmerId },
      include: { organization: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return settlements.map((settlement) => ({
      id: settlement.id,
      publicId: settlement.publicId,
      settlementNumber: settlement.farmerSettlementNumber,
      organization: settlement.organization,
      status: settlement.status,
      paymentStatus: settlement.paymentStatus,
      currency: settlement.currency,
      grossEntitlementMinor: settlement.grossEntitlementMinor.toString(),
      deductionsTotalMinor: settlement.deductionsTotalMinor.toString(),
      adjustmentsTotalMinor: settlement.adjustmentsTotalMinor.toString(),
      netEntitlementMinor: settlement.netEntitlementMinor.toString(),
      approvedAt: settlement.approvedAt?.toISOString() ?? null,
      createdAt: settlement.createdAt.toISOString(),
    }));
  }

  async statements(farmerId: string) {
    const statements = await this.database.client.farmerStatement.findMany({
      where: { farmerSettlement: { farmerId } },
      include: {
        farmerSettlement: {
          select: {
            farmerSettlementNumber: true,
            organization: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { issuedAt: 'desc' },
    });
    return statements.map((statement) => ({
      id: statement.id,
      publicId: statement.publicId,
      statementNumber: statement.statementNumber,
      settlementNumber: statement.farmerSettlement.farmerSettlementNumber,
      organization: statement.farmerSettlement.organization,
      version: statement.version,
      status: statement.status,
      issuedAt: statement.issuedAt.toISOString(),
      checksum: statement.checksum,
    }));
  }

  async farms(farmerId: string) {
    const farms = await this.database.client.farm.findMany({
      where: { farmerId, deletedAt: null },
      include: { organization: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return farms.map((farm) => ({
      id: farm.id,
      organization: farm.organization,
      name: farm.name,
      district: farm.district,
      subCounty: farm.subCounty,
      parish: farm.parish,
      village: farm.village,
      totalArea: farm.totalArea.toString(),
      areaUnit: farm.areaUnit,
      ownershipType: farm.ownershipType,
      waterSource: farm.waterSource,
      status: farm.status,
    }));
  }

  async qrIdentities(farmerId: string) {
    const identities = await this.database.client.farmerQrIdentity.findMany({
      where: { farmerId },
      include: { organization: { select: { id: true, name: true } } },
      orderBy: { issuedAt: 'desc' },
    });
    return identities.map((identity) => ({
      id: identity.id,
      publicId: identity.publicId,
      organization: identity.organization,
      status: identity.status,
      issuedAt: identity.issuedAt.toISOString(),
      expiresAt: identity.expiresAt?.toISOString() ?? null,
      revokedAt: identity.revokedAt?.toISOString() ?? null,
    }));
  }

  async consents(farmerId: string) {
    const consents = await this.database.client.farmerConsent.findMany({
      where: { farmerId },
      include: { organization: { select: { id: true, name: true } } },
      orderBy: { capturedAt: 'desc' },
    });
    return consents.map((consent) => this.serializeConsent(consent));
  }

  async withdrawConsent(farmerId: string, consentId: string, userId: string, requestId: string) {
    const consent = await this.database.client.farmerConsent.findFirst({
      where: { id: consentId, farmerId },
    });
    if (!consent) throw new NotFoundException('Consent record not found');
    if (!selfServiceConsentTypes.has(consent.consentType)) {
      throw new ConflictException('Contact your cooperative to withdraw this consent');
    }
    if (consent.status !== 'GRANTED' || consent.withdrawnAt) {
      throw new ConflictException('Consent is not active');
    }
    const record = await this.database.client.$transaction(async (transaction) => {
      const now = new Date();
      await transaction.farmerConsent.update({
        where: { id: consent.id },
        data: { withdrawnAt: now },
      });
      const withdrawal = await transaction.farmerConsent.create({
        data: {
          farmerId,
          organizationId: consent.organizationId,
          consentType: consent.consentType,
          policyVersion: consent.policyVersion,
          status: 'WITHDRAWN',
          capturedByUserId: userId,
          captureMethod: 'SELF_SERVICE',
          capturedAt: now,
          withdrawnAt: now,
        },
      });
      await this.audit.create(
        {
          organizationId: consent.organizationId,
          actorUserId: userId,
          action: 'FARMER_CONSENT_WITHDRAWN',
          entityType: 'FarmerConsent',
          entityId: withdrawal.id,
          requestId,
          metadata: { consentType: consent.consentType, grantRecordId: consent.id },
        },
        transaction,
      );
      return withdrawal;
    });
    return this.serializeConsent(record);
  }

  async createPrivacyRequest(farmerId: string, body: unknown, userId: string, requestId: string) {
    const input = parseWithSchema(privacyRequestSchema, body);
    const created = await this.database.client.$transaction(async (transaction) => {
      const privacyRequest = await transaction.dataSubjectRequest.create({
        data: {
          publicId: `dsr_${crypto.randomUUID()}`,
          subjectType: 'FARMER',
          farmerId,
          requestType: input.requestType,
          ...(input.notes ? { notes: input.notes } : {}),
        },
      });
      await this.audit.create(
        {
          actorUserId: userId,
          action: 'DATA_SUBJECT_REQUEST_CREATED',
          entityType: 'DataSubjectRequest',
          entityId: privacyRequest.id,
          requestId,
          metadata: { requestType: privacyRequest.requestType, subjectType: 'FARMER' },
        },
        transaction,
      );
      return privacyRequest;
    });
    return {
      id: created.id,
      publicId: created.publicId,
      requestType: created.requestType,
      status: created.status,
      submittedAt: created.submittedAt.toISOString(),
      notes: created.notes,
    };
  }

  private serializeDelivery(delivery: {
    id: string;
    publicId: string;
    deliveryNumber: string;
    status: string;
    source: string;
    clientCreatedAt: Date;
    serverReceivedAt: Date;
    acceptedAt: Date | null;
    confirmedAt: Date | null;
    organization: { id: string; name: string };
    commodity: { name: string };
    commodityForm: { name: string };
    measurements: Array<{
      measurementType: string;
      grossQuantity: { toString(): string } | null;
      tareQuantity: { toString(): string } | null;
      netQuantity: { toString(): string };
      unit: string;
      capturedAt: Date;
    }>;
    pricing: {
      unitPriceMinor: bigint;
      currency: string;
      quantity: { toString(): string };
      quantityUnit: string;
      grossAmountMinor: bigint;
      adjustmentAmountMinor: bigint;
      netAmountMinor: bigint;
    } | null;
  }) {
    return {
      id: delivery.id,
      publicId: delivery.publicId,
      deliveryNumber: delivery.deliveryNumber,
      organization: delivery.organization,
      commodity: delivery.commodity.name,
      commodityForm: delivery.commodityForm.name,
      status: delivery.status,
      source: delivery.source,
      clientCreatedAt: delivery.clientCreatedAt.toISOString(),
      serverReceivedAt: delivery.serverReceivedAt.toISOString(),
      acceptedAt: delivery.acceptedAt?.toISOString() ?? null,
      confirmedAt: delivery.confirmedAt?.toISOString() ?? null,
      measurements: delivery.measurements.map((measurement) => ({
        measurementType: measurement.measurementType,
        grossQuantity: measurement.grossQuantity?.toString() ?? null,
        tareQuantity: measurement.tareQuantity?.toString() ?? null,
        netQuantity: measurement.netQuantity.toString(),
        unit: measurement.unit,
        capturedAt: measurement.capturedAt.toISOString(),
      })),
      pricing: delivery.pricing
        ? {
            unitPriceMinor: delivery.pricing.unitPriceMinor.toString(),
            currency: delivery.pricing.currency,
            quantity: delivery.pricing.quantity.toString(),
            quantityUnit: delivery.pricing.quantityUnit,
            grossAmountMinor: delivery.pricing.grossAmountMinor.toString(),
            adjustmentAmountMinor: delivery.pricing.adjustmentAmountMinor.toString(),
            netAmountMinor: delivery.pricing.netAmountMinor.toString(),
          }
        : null,
    };
  }

  private serializeConsent(consent: {
    id: string;
    consentType: string;
    policyVersion: string;
    status: string;
    captureMethod: string;
    capturedAt: Date;
    withdrawnAt: Date | null;
    notes: string | null;
    organization?: { id: string; name: string };
  }) {
    return {
      id: consent.id,
      organization: consent.organization ?? null,
      consentType: consent.consentType,
      policyVersion: consent.policyVersion,
      status: consent.status,
      captureMethod: consent.captureMethod,
      capturedAt: consent.capturedAt.toISOString(),
      withdrawnAt: consent.withdrawnAt?.toISOString() ?? null,
      notes: consent.notes,
    };
  }
}
