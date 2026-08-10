import { createHash, randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedPrincipal } from '@clycites/auth';
import type {
  ConfirmDelivery,
  CreateDelivery,
  DeliveryListQuery,
  QualityValue,
  ReweighDelivery,
  RejectDelivery,
  RequestDeliveryCorrection,
  ReviewDeliveryCorrection,
} from '@clycites/contracts';
import {
  Prisma,
  type DeliveryCorrectionReasonCode,
  type DeliveryCorrectionStatus,
  type DeliveryStatus,
} from '@clycites/database';

import { AuditService } from '../audit/audit.service.js';
import { DomainEventService } from '../audit/domain-event.service.js';
import type { ApiEnvironment } from '../config/environment.js';
import { DatabaseService } from '../database/database.service.js';
import { calculatePricing, calculateWeight } from './delivery-calculation.js';
import { assessWeighingInstrument } from './delivery-instrument.js';

const deliveryInclude = {
  organization: true,
  collectionPoint: true,
  farmer: true,
  farm: true,
  commodity: true,
  commodityForm: true,
  createdBy: true,
  measurements: { where: { supersededAt: null } },
  pricing: true,
  qualityMeasurements: { include: { qualityAttributeDefinition: true } },
  confirmations: { orderBy: { confirmedAt: 'asc' as const } },
  receipts: { orderBy: { issuedAt: 'desc' as const } },
  correctionRequests: { orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.DeliveryInclude;

type DeliveryRecord = Prisma.DeliveryGetPayload<{ include: typeof deliveryInclude }>;

const deliveryListInclude = {
  farmer: true,
  commodity: true,
  commodityForm: true,
  measurements: { where: { supersededAt: null } },
  pricing: true,
} satisfies Prisma.DeliveryInclude;

type DeliveryListRecord = Prisma.DeliveryGetPayload<{ include: typeof deliveryListInclude }>;

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

@Injectable()
export class DeliveriesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ConfigService) private readonly config: ConfigService<ApiEnvironment, true>,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DomainEventService) private readonly events: DomainEventService,
  ) {}

  async create(
    organizationId: string,
    idempotencyKey: string | undefined,
    input: CreateDelivery,
    principal: AuthenticatedPrincipal,
    requestId: string,
    source: 'ONLINE' | 'OFFLINE_SYNC' = 'ONLINE',
  ) {
    const key = idempotencyKey?.trim();
    if (!key || key.length > 255) {
      throw new BadRequestException('A valid Idempotency-Key header is required');
    }
    const scopeId = `delivery:${organizationId}:${principal.subjectId}:${input.deviceId}`;
    const fingerprint = sha256(stableJson(input));
    const existing = await this.database.client.idempotencyRecord.findUnique({
      where: { scopeId_idempotencyKey: { scopeId, idempotencyKey: key } },
    });
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) {
        throw new ConflictException({
          code: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD',
          message: 'Idempotency key was already used with a different payload',
        });
      }
      return existing.responseBody;
    }

    try {
      return await this.database.client.$transaction(async (transaction) => {
        const delivery = await this.createDeliveryRecord(
          transaction,
          organizationId,
          input,
          principal,
          requestId,
          source,
        );
        const response = this.serializeDelivery(delivery);
        await transaction.idempotencyRecord.create({
          data: {
            scopeId,
            idempotencyKey: key,
            requestFingerprint: fingerprint,
            responseStatus: 201,
            responseBody: response,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
        return response;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const replay = await this.database.client.idempotencyRecord.findUnique({
          where: { scopeId_idempotencyKey: { scopeId, idempotencyKey: key } },
        });
        if (replay?.requestFingerprint === fingerprint) return replay.responseBody;
        if (replay) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD',
            message: 'Idempotency key was already used with a different payload',
          });
        }
      }
      throw error;
    }
  }

  async list(organizationId: string, query: DeliveryListQuery) {
    const where: Prisma.DeliveryWhereInput = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.collectionPointId ? { collectionPointId: query.collectionPointId } : {}),
      ...(query.farmerId ? { farmerId: query.farmerId } : {}),
      ...(query.from || query.to
        ? {
            serverReceivedAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    if (query.cursor) {
      const separator = query.cursor.indexOf(':');
      const receivedAt = new Date(Number(query.cursor.slice(0, separator)));
      const id = query.cursor.slice(separator + 1);
      // Prisma cannot express a row-value comparison, and the equivalent OR form is not
      // sargable: at 108k rows it discarded 50,001 index entries (51,289 buffers, 11.6ms).
      // The row-value form becomes an index bound instead (53 buffers, 0.02ms).
      const page = await this.database.client.$queryRaw<{ id: string }[]>`
        SELECT "id"
        FROM "Delivery"
        WHERE "organizationId" = ${organizationId}::uuid
          AND ("serverReceivedAt", "id") < (${receivedAt}::timestamptz, ${id}::uuid)
          AND (${query.status ?? null}::"DeliveryStatus" IS NULL OR "status" = ${query.status ?? null}::"DeliveryStatus")
          AND (${query.collectionPointId ?? null}::uuid IS NULL OR "collectionPointId" = ${query.collectionPointId ?? null}::uuid)
          AND (${query.farmerId ?? null}::uuid IS NULL OR "farmerId" = ${query.farmerId ?? null}::uuid)
          AND (${query.from ?? null}::timestamptz IS NULL OR "serverReceivedAt" >= ${query.from ?? null}::timestamptz)
          AND (${query.to ?? null}::timestamptz IS NULL OR "serverReceivedAt" <= ${query.to ?? null}::timestamptz)
        ORDER BY "serverReceivedAt" DESC, "id" DESC
        LIMIT ${query.pageSize}
      `;
      const pageIds = page.map((row) => row.id);
      const unordered = pageIds.length
        ? await this.database.client.delivery.findMany({
            where: { id: { in: pageIds } },
            include: deliveryListInclude,
          })
        : [];
      const byId = new Map(unordered.map((record) => [record.id, record]));
      const records = pageIds
        .map((pageId) => byId.get(pageId))
        .filter((record): record is DeliveryListRecord => record !== undefined);
      return {
        items: records.map((record) => this.serializeDeliveryListItem(record)),
        pagination: {
          pageSize: query.pageSize,
          nextCursor: this.deliveryCursor(records.at(-1)),
        },
      };
    }
    const [records, totalItems] = await Promise.all([
      this.database.client.delivery.findMany({
        where,
        include: deliveryListInclude,
        orderBy: [{ serverReceivedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.database.client.delivery.count({ where }),
    ]);
    return {
      items: records.map((record) => this.serializeDeliveryListItem(record)),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / query.pageSize),
        nextCursor: this.deliveryCursor(records.at(-1)),
      },
    };
  }

  private deliveryCursor(record: DeliveryListRecord | undefined) {
    return record ? `${record.serverReceivedAt.getTime()}:${record.id}` : null;
  }

  async get(organizationId: string, deliveryId: string) {
    const delivery = await this.database.client.delivery.findFirst({
      where: { id: deliveryId, organizationId },
      include: deliveryInclude,
    });
    if (!delivery) throw new NotFoundException('Delivery not found');
    return this.serializeDelivery(delivery);
  }

  async submit(
    organizationId: string,
    deliveryId: string,
    lockVersion: number,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    await this.transition(
      organizationId,
      deliveryId,
      lockVersion,
      ['DRAFT'],
      'PENDING_CONFIRMATION',
      'DELIVERY_SUBMITTED',
      principal,
      requestId,
    );
    return this.get(organizationId, deliveryId);
  }

  async reweigh(
    organizationId: string,
    deliveryId: string,
    input: ReweighDelivery,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    await this.database.client.$transaction(async (transaction) => {
      const delivery = await transaction.delivery.findFirst({
        where: {
          id: deliveryId,
          organizationId,
          lockVersion: input.lockVersion,
          status: { in: ['DRAFT', 'SUBMITTED', 'PENDING_CONFIRMATION'] },
        },
        include: {
          measurements: {
            where: { measurementType: 'WEIGHT', supersededAt: null },
          },
          pricing: true,
        },
      });
      const current = delivery?.measurements[0];
      if (!delivery || !current || !delivery.pricing) this.throwVersionConflict();

      const capturedAt = new Date(input.capturedAt);
      const weight = calculateWeight(input.weight);
      const reportedInstrumentId = input.weight.instrumentId;
      const instrument = reportedInstrumentId
        ? await transaction.weighingInstrument.findFirst({
            where: { id: reportedInstrumentId, organizationId },
            select: { id: true, status: true, calibratedAt: true },
          })
        : null;
      const instrumentAssessment = assessWeighingInstrument(
        reportedInstrumentId,
        instrument,
        capturedAt,
      );
      const pricing = calculatePricing(weight.netQuantity, {
        unitPriceMinor: delivery.pricing.unitPriceMinor.toString(),
        currency: 'UGX',
        adjustmentAmountMinor: delivery.pricing.adjustmentAmountMinor.toString(),
        priceSource: delivery.pricing.priceSource,
        ...(delivery.pricing.priceReference
          ? { priceReference: delivery.pricing.priceReference }
          : {}),
        ...(delivery.pricing.overrideReason
          ? { overrideReason: delivery.pricing.overrideReason }
          : {}),
      });
      const changed = await transaction.delivery.updateMany({
        where: { id: deliveryId, lockVersion: input.lockVersion },
        data: { lockVersion: { increment: 1 } },
      });
      if (changed.count !== 1) this.throwVersionConflict();
      await transaction.deliveryMeasurement.update({
        where: { id: current.id },
        data: { supersededAt: new Date() },
      });
      await transaction.deliveryMeasurement.create({
        data: {
          deliveryId,
          measurementType: 'WEIGHT',
          grossQuantity: weight.grossQuantity,
          tareQuantity: weight.tareQuantity,
          netQuantity: weight.netQuantity,
          unit: weight.unit,
          captureMethod: weight.captureMethod,
          ...instrumentAssessment,
          capturedByUserId: principal.subjectId,
          capturedAt,
          version: current.version + 1,
          supersedesMeasurementId: current.id,
        },
      });
      await transaction.deliveryPricing.update({
        where: { deliveryId },
        data: {
          quantity: pricing.quantity,
          grossAmountMinor: pricing.grossAmountMinor,
          netAmountMinor: pricing.netAmountMinor,
        },
      });
      await this.recordMutation(
        transaction,
        organizationId,
        deliveryId,
        principal.subjectId,
        'DELIVERY_MEASUREMENT_SUPERSEDED',
        requestId,
        { supersededMeasurementId: current.id, measurementVersion: current.version + 1 },
      );
    });
    return this.get(organizationId, deliveryId);
  }

  async confirm(
    organizationId: string,
    deliveryId: string,
    input: ConfirmDelivery,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    await this.database.client.$transaction(async (transaction) => {
      const delivery = await transaction.delivery.findFirst({
        where: {
          id: deliveryId,
          organizationId,
          lockVersion: input.lockVersion,
          status: { in: ['PENDING_CONFIRMATION', 'SUBMITTED'] },
        },
        include: { farmer: true },
      });
      if (!delivery) this.throwVersionConflict();
      const confirmedAt = new Date(input.confirmation.confirmedAt);
      await transaction.deliveryConfirmation.create({
        data: {
          deliveryId,
          method: input.confirmation.method,
          status: input.confirmation.status,
          ...(input.confirmation.confirmedByName
            ? { confirmedByName: input.confirmation.confirmedByName }
            : {}),
          confirmedByFarmerId: delivery.farmerId,
          ...(input.confirmation.confirmationReference
            ? { confirmationReference: input.confirmation.confirmationReference }
            : {}),
          witnessUserId: principal.subjectId,
          confirmedAt,
          metadata: {},
        },
      });
      const accepted = input.confirmation.status === 'CONFIRMED';
      await transaction.delivery.update({
        where: { id: deliveryId },
        data: {
          status: accepted ? 'ACCEPTED' : 'REJECTED',
          confirmedAt,
          confirmationMethod: input.confirmation.method,
          ...(accepted ? { acceptedAt: new Date(), acceptedByUserId: principal.subjectId } : {}),
          lockVersion: { increment: 1 },
        },
      });
      if (accepted) await this.issueReceipt(transaction, deliveryId, principal.subjectId);
      await this.recordMutation(
        transaction,
        organizationId,
        deliveryId,
        principal.subjectId,
        accepted ? 'DELIVERY_ACCEPTED' : 'DELIVERY_CONFIRMATION_DECLINED',
        requestId,
      );
    });
    return this.get(organizationId, deliveryId);
  }

  async accept(
    organizationId: string,
    deliveryId: string,
    lockVersion: number,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    await this.database.client.$transaction(async (transaction) => {
      const delivery = await transaction.delivery.findFirst({
        where: { id: deliveryId, organizationId, lockVersion, status: 'SUBMITTED' },
        include: {
          confirmations: {
            where: { status: 'CONFIRMED' },
            orderBy: { confirmedAt: 'desc' },
            take: 1,
          },
        },
      });
      if (!delivery) this.throwVersionConflict();
      if (delivery.confirmations.length === 0) {
        throw new ConflictException({
          code: 'INVALID_DELIVERY_STATE_TRANSITION',
          message: 'A confirmed farmer confirmation is required before acceptance',
        });
      }
      const confirmation = delivery.confirmations[0];
      if (!confirmation) throw new Error('Confirmed evidence disappeared during acceptance');
      await transaction.delivery.update({
        where: { id: deliveryId },
        data: {
          status: 'ACCEPTED',
          acceptedAt: new Date(),
          acceptedByUserId: principal.subjectId,
          confirmedAt: confirmation.confirmedAt,
          confirmationMethod: confirmation.method,
          lockVersion: { increment: 1 },
        },
      });
      await this.issueReceipt(transaction, deliveryId, principal.subjectId);
      await this.recordMutation(
        transaction,
        organizationId,
        deliveryId,
        principal.subjectId,
        'DELIVERY_ACCEPTED',
        requestId,
      );
    });
    return this.get(organizationId, deliveryId);
  }

  async reject(
    organizationId: string,
    deliveryId: string,
    input: RejectDelivery,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    await this.transition(
      organizationId,
      deliveryId,
      input.lockVersion,
      ['DRAFT', 'PENDING_CONFIRMATION', 'SUBMITTED'],
      'REJECTED',
      'DELIVERY_REJECTED',
      principal,
      requestId,
      { reason: input.reason },
    );
    return this.get(organizationId, deliveryId);
  }

  async receipt(organizationId: string, deliveryId: string, isReprint: boolean) {
    const delivery = await this.database.client.delivery.findFirst({
      where: { id: deliveryId, organizationId },
      include: deliveryInclude,
    });
    if (!delivery) throw new NotFoundException('Delivery not found');
    const receipt = delivery.receipts.find((candidate) => candidate.status === 'ACTIVE');
    if (!receipt) throw new NotFoundException('Active receipt not found');
    return this.serializeReceipt(delivery, receipt, isReprint);
  }

  async reprintReceipt(
    organizationId: string,
    deliveryId: string,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    await this.database.client.$transaction(async (transaction) => {
      const receipt = await transaction.deliveryReceipt.findFirst({
        where: { deliveryId, delivery: { organizationId }, status: 'ACTIVE' },
      });
      if (!receipt) throw new NotFoundException('Active receipt not found');
      await transaction.deliveryReceipt.update({
        where: { id: receipt.id },
        data: { reprintCount: { increment: 1 }, lastReprintedAt: new Date() },
      });
      await this.audit.create(
        {
          organizationId,
          actorUserId: principal.subjectId,
          action: 'DELIVERY_RECEIPT_REPRINTED',
          entityType: 'DeliveryReceipt',
          entityId: receipt.id,
          requestId,
        },
        transaction,
      );
      await this.events.create(
        {
          aggregateType: 'DeliveryReceipt',
          aggregateId: receipt.id,
          eventType: 'DELIVERY_RECEIPT_REPRINTED',
          payload: { organizationId, deliveryId, receiptId: receipt.id },
        },
        transaction,
      );
    });
    return this.receipt(organizationId, deliveryId, true);
  }

  async requestCorrection(
    organizationId: string,
    deliveryId: string,
    input: RequestDeliveryCorrection,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const correction = await this.database.client.$transaction(async (transaction) => {
      const delivery = await transaction.delivery.findFirst({
        where: { id: deliveryId, organizationId, status: 'ACCEPTED' },
      });
      if (!delivery) {
        throw new ConflictException({
          code: 'INVALID_DELIVERY_STATE_TRANSITION',
          message: 'Only an accepted delivery can be corrected',
        });
      }
      const created = await transaction.deliveryCorrectionRequest.create({
        data: {
          deliveryId,
          requestedByUserId: principal.subjectId,
          reasonCode: input.reasonCode,
          reason: input.reason,
          proposedChanges: input.proposedChanges,
        },
      });
      await transaction.delivery.update({
        where: { id: deliveryId },
        data: { status: 'CORRECTION_PENDING', lockVersion: { increment: 1 } },
      });
      await this.recordMutation(
        transaction,
        organizationId,
        deliveryId,
        principal.subjectId,
        'DELIVERY_CORRECTION_REQUESTED',
        requestId,
        { correctionRequestId: created.id, reasonCode: input.reasonCode },
      );
      return created;
    });
    return this.serializeCorrection(correction);
  }

  async approveCorrection(
    organizationId: string,
    deliveryId: string,
    correctionId: string,
    input: ReviewDeliveryCorrection,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const replacementId = await this.database.client.$transaction(async (transaction) => {
      const correction = await transaction.deliveryCorrectionRequest.findFirst({
        where: {
          id: correctionId,
          deliveryId,
          status: 'PENDING',
          delivery: { organizationId, status: 'CORRECTION_PENDING' },
        },
      });
      if (!correction) throw new NotFoundException('Pending correction request not found');
      if (correction.requestedByUserId === principal.subjectId) {
        throw new ForbiddenException({
          code: 'CORRECTION_SELF_APPROVAL_FORBIDDEN',
          message: 'A correction requester cannot approve their own request',
        });
      }
      const original = await transaction.delivery.findUniqueOrThrow({
        where: { id: deliveryId },
        include: {
          measurements: true,
          pricing: true,
          qualityMeasurements: true,
          confirmations: true,
          receipts: { where: { status: 'ACTIVE' } },
        },
      });
      const proposed = correction.proposedChanges as Prisma.JsonObject;
      const replacementId = randomUUID();
      const farmerId =
        typeof proposed.farmerId === 'string' ? proposed.farmerId : original.farmerId;
      const farmId =
        proposed.farmId === null || typeof proposed.farmId === 'string'
          ? proposed.farmId
          : original.farmId;
      const commodityFormId =
        typeof proposed.commodityFormId === 'string'
          ? proposed.commodityFormId
          : original.commodityFormId;
      const membership = await transaction.farmerOrganizationMembership.findFirst({
        where: { organizationId, farmerId, status: 'ACTIVE' },
      });
      if (!membership)
        throw new UnprocessableEntityException('Corrected farmer membership is not active');
      if (farmId) {
        const farm = await transaction.farm.findFirst({
          where: { id: farmId, farmerId, organizationId, status: 'ACTIVE', deletedAt: null },
        });
        if (!farm)
          throw new UnprocessableEntityException('Corrected farm is not active for the farmer');
      }
      const originalMeasurement = original.measurements.find(
        (measurement) => measurement.measurementType === 'WEIGHT',
      );
      if (!originalMeasurement || !original.pricing)
        throw new Error('Original delivery facts are incomplete');
      const proposedWeight =
        proposed.weight as RequestDeliveryCorrection['proposedChanges']['weight'];
      const weight = proposedWeight
        ? calculateWeight(proposedWeight)
        : {
            grossQuantity: originalMeasurement.grossQuantity?.toString() ?? null,
            tareQuantity: originalMeasurement.tareQuantity?.toString() ?? null,
            netQuantity: originalMeasurement.netQuantity.toString(),
            unit: originalMeasurement.unit,
            captureMethod: originalMeasurement.captureMethod,
          };
      const proposedPricing =
        proposed.pricing as RequestDeliveryCorrection['proposedChanges']['pricing'];
      const pricing = proposedPricing
        ? calculatePricing(weight.netQuantity, proposedPricing)
        : calculatePricing(weight.netQuantity, {
            unitPriceMinor: original.pricing.unitPriceMinor.toString(),
            currency: 'UGX',
            adjustmentAmountMinor: original.pricing.adjustmentAmountMinor.toString(),
            priceSource: original.pricing.priceSource,
            ...(original.pricing.priceReference
              ? { priceReference: original.pricing.priceReference }
              : {}),
            ...(original.pricing.overrideReason
              ? { overrideReason: original.pricing.overrideReason }
              : {}),
          });
      await transaction.delivery.create({
        data: {
          id: replacementId,
          publicId: `${original.publicId}_v${original.version + 1}`,
          deliveryNumber: original.deliveryNumber,
          organizationId,
          collectionPointId: original.collectionPointId,
          collectionSessionId: original.collectionSessionId,
          farmerId,
          farmerOrganizationMembershipId: membership.id,
          ...(farmId ? { farmId } : {}),
          commodityId: original.commodityId,
          commodityFormId,
          status: 'ACCEPTED',
          source: original.source,
          clientCreatedAt: original.clientCreatedAt,
          serverReceivedAt: new Date(),
          clientClockOffsetSeconds: original.clientClockOffsetSeconds,
          clientClockFlagged: original.clientClockFlagged,
          acceptedAt: new Date(),
          acceptedByUserId: principal.subjectId,
          confirmedAt: original.confirmedAt,
          confirmationMethod: original.confirmationMethod,
          notes: typeof proposed.notes === 'string' ? proposed.notes : original.notes,
          version: original.version + 1,
          supersedesDeliveryId: original.id,
          createdByUserId: principal.subjectId,
        },
      });
      await transaction.deliveryMeasurement.create({
        data: {
          deliveryId: replacementId,
          measurementType: 'WEIGHT',
          grossQuantity: weight.grossQuantity,
          tareQuantity: weight.tareQuantity,
          netQuantity: weight.netQuantity,
          unit: weight.unit,
          captureMethod: weight.captureMethod,
          capturedByUserId: principal.subjectId,
          capturedAt: new Date(),
        },
      });
      await transaction.deliveryPricing.create({
        data: {
          deliveryId: replacementId,
          unitPriceMinor: pricing.unitPriceMinor,
          currency: pricing.currency,
          quantity: pricing.quantity,
          quantityUnit: pricing.quantityUnit,
          grossAmountMinor: pricing.grossAmountMinor,
          adjustmentAmountMinor: pricing.adjustmentAmountMinor,
          netAmountMinor: pricing.netAmountMinor,
          priceSource: pricing.priceSource,
          ...(pricing.priceReference ? { priceReference: pricing.priceReference } : {}),
          ...(pricing.overrideReason ? { overrideReason: pricing.overrideReason } : {}),
        },
      });
      const proposedQuality = proposed.qualityMeasurements as QualityValue[] | undefined;
      if (proposedQuality) {
        const values = await this.validateQuality(
          transaction,
          organizationId,
          commodityFormId,
          proposedQuality,
        );
        for (const value of values) {
          await transaction.deliveryQualityMeasurement.create({
            data: {
              deliveryId: replacementId,
              qualityAttributeDefinitionId: value.qualityAttributeDefinitionId,
              ...this.qualityValueData(value),
              capturedByUserId: principal.subjectId,
              capturedAt: new Date(value.capturedAt),
              ...(value.notes ? { notes: value.notes } : {}),
            },
          });
        }
      } else {
        for (const quality of original.qualityMeasurements) {
          await transaction.deliveryQualityMeasurement.create({
            data: {
              deliveryId: replacementId,
              qualityAttributeDefinitionId: quality.qualityAttributeDefinitionId,
              decimalValue: quality.decimalValue,
              integerValue: quality.integerValue,
              textValue: quality.textValue,
              booleanValue: quality.booleanValue,
              enumValue: quality.enumValue,
              capturedByUserId: principal.subjectId,
              capturedAt: new Date(),
              notes: quality.notes,
            },
          });
        }
      }
      for (const confirmation of original.confirmations) {
        await transaction.deliveryConfirmation.create({
          data: {
            deliveryId: replacementId,
            method: confirmation.method,
            status: confirmation.status,
            confirmedByName: confirmation.confirmedByName,
            confirmedByFarmerId: confirmation.confirmedByFarmerId,
            confirmationReference: confirmation.confirmationReference,
            witnessUserId: confirmation.witnessUserId,
            confirmedAt: confirmation.confirmedAt,
            metadata: confirmation.metadata as Prisma.InputJsonValue,
          },
        });
      }
      await transaction.delivery.update({
        where: { id: original.id },
        data: { status: 'CORRECTED', lockVersion: { increment: 1 } },
      });
      await transaction.deliveryCorrectionRequest.update({
        where: { id: correction.id },
        data: {
          status: 'APPROVED',
          reviewedByUserId: principal.subjectId,
          reviewedAt: new Date(),
          ...(input.reviewNotes ? { reviewNotes: input.reviewNotes } : {}),
          replacementDeliveryVersionId: replacementId,
        },
      });
      const replacementReceipt = await this.issueReceipt(
        transaction,
        replacementId,
        principal.subjectId,
      );
      const originalReceipt = original.receipts[0];
      if (originalReceipt) {
        await transaction.deliveryReceipt.update({
          where: { id: originalReceipt.id },
          data: { status: 'SUPERSEDED', supersededById: replacementReceipt.id },
        });
      }
      await this.recordMutation(
        transaction,
        organizationId,
        original.id,
        principal.subjectId,
        'DELIVERY_CORRECTION_APPROVED',
        requestId,
        { correctionRequestId: correction.id, replacementDeliveryId: replacementId },
      );
      return replacementId;
    });
    return this.get(organizationId, replacementId);
  }

  async rejectCorrection(
    organizationId: string,
    deliveryId: string,
    correctionId: string,
    input: ReviewDeliveryCorrection,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const correction = await this.database.client.$transaction(async (transaction) => {
      const existing = await transaction.deliveryCorrectionRequest.findFirst({
        where: { id: correctionId, deliveryId, status: 'PENDING', delivery: { organizationId } },
      });
      if (!existing) throw new NotFoundException('Pending correction request not found');
      if (existing.requestedByUserId === principal.subjectId) {
        throw new ForbiddenException({
          code: 'CORRECTION_SELF_APPROVAL_FORBIDDEN',
          message: 'A correction requester cannot review their own request',
        });
      }
      const updated = await transaction.deliveryCorrectionRequest.update({
        where: { id: correctionId },
        data: {
          status: 'REJECTED',
          reviewedByUserId: principal.subjectId,
          reviewedAt: new Date(),
          ...(input.reviewNotes ? { reviewNotes: input.reviewNotes } : {}),
        },
      });
      await transaction.delivery.update({
        where: { id: deliveryId },
        data: { status: 'ACCEPTED', lockVersion: { increment: 1 } },
      });
      await this.recordMutation(
        transaction,
        organizationId,
        deliveryId,
        principal.subjectId,
        'DELIVERY_CORRECTION_REJECTED',
        requestId,
        { correctionRequestId: correctionId },
      );
      return updated;
    });
    return this.serializeCorrection(correction);
  }

  private async createDeliveryRecord(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    input: CreateDelivery,
    principal: AuthenticatedPrincipal,
    requestId: string,
    source: 'ONLINE' | 'OFFLINE_SYNC',
  ): Promise<DeliveryRecord> {
    const session = await transaction.collectionSession.findFirst({
      where: {
        id: input.collectionSessionId,
        organizationId,
        collectionPointId: input.collectionPointId,
        deviceId: input.deviceId,
        agentUserId: principal.subjectId,
        status: 'OPEN',
        device: { status: 'ACTIVE', assignedUserId: principal.subjectId },
      },
    });
    if (!session) {
      throw new ForbiddenException({
        code: 'COLLECTION_SESSION_CLOSED',
        message: 'An active assigned device and open collection session are required',
      });
    }
    const membership = await transaction.farmerOrganizationMembership.findFirst({
      where: {
        organizationId,
        farmerId: input.farmerId,
        status: 'ACTIVE',
        registeredAtCollectionPointId: input.collectionPointId,
        farmer: { status: 'ACTIVE', deletedAt: null },
      },
    });
    if (!membership) {
      throw new UnprocessableEntityException({
        code: 'FARMER_MEMBERSHIP_INACTIVE',
        message: 'Farmer does not have an active membership at this collection point',
      });
    }
    if (input.farmId) {
      const farm = await transaction.farm.findFirst({
        where: {
          id: input.farmId,
          farmerId: input.farmerId,
          organizationId,
          status: 'ACTIVE',
          deletedAt: null,
        },
      });
      if (!farm) throw new UnprocessableEntityException('Active farmer-owned farm not found');
    }
    const form = await transaction.commodityForm.findFirst({
      where: {
        id: input.commodityFormId,
        commodityId: input.commodityId,
        status: 'ACTIVE',
        commodity: { status: 'ACTIVE' },
      },
    });
    if (!form) {
      throw new UnprocessableEntityException({
        code: 'COMMODITY_FORM_INACTIVE',
        message: 'Commodity form is not active',
      });
    }
    const qualityValues = await this.validateQuality(
      transaction,
      organizationId,
      input.commodityFormId,
      input.qualityMeasurements,
    );
    const weight = calculateWeight(input.weight);
    const pricing = calculatePricing(weight.netQuantity, input.pricing);
    const clientCreatedAt = new Date(input.clientCreatedAt);
    const reportedInstrumentId = input.weight.instrumentId;
    const instrument = reportedInstrumentId
      ? await transaction.weighingInstrument.findFirst({
          where: { id: reportedInstrumentId, organizationId },
          select: { id: true, status: true, calibratedAt: true },
        })
      : null;
    const instrumentAssessment = assessWeighingInstrument(
      reportedInstrumentId,
      instrument,
      clientCreatedAt,
    );
    const clockOffsetSeconds = Math.round((Date.now() - clientCreatedAt.getTime()) / 1000);
    const confirmation = input.confirmation;
    const accepted = input.accept && confirmation?.status === 'CONFIRMED';
    const status = accepted
      ? 'ACCEPTED'
      : confirmation?.status === 'DECLINED'
        ? 'REJECTED'
        : confirmation
          ? 'SUBMITTED'
          : input.submit
            ? 'PENDING_CONFIRMATION'
            : 'DRAFT';
    const deliveryId = randomUUID();
    const deliveryNumber = this.deliveryNumber(clientCreatedAt);
    await transaction.delivery.create({
      data: {
        id: deliveryId,
        publicId: input.clientEntityId,
        deliveryNumber,
        organizationId,
        collectionPointId: input.collectionPointId,
        collectionSessionId: input.collectionSessionId,
        farmerId: input.farmerId,
        farmerOrganizationMembershipId: membership.id,
        ...(input.farmId ? { farmId: input.farmId } : {}),
        commodityId: input.commodityId,
        commodityFormId: input.commodityFormId,
        status,
        source,
        clientCreatedAt,
        clientClockOffsetSeconds: clockOffsetSeconds,
        clientClockFlagged: Math.abs(clockOffsetSeconds) > 300,
        ...(accepted
          ? {
              acceptedAt: new Date(),
              acceptedByUserId: principal.subjectId,
              confirmedAt: new Date(confirmation.confirmedAt),
              confirmationMethod: confirmation.method,
            }
          : {}),
        ...(input.notes ? { notes: input.notes } : {}),
        createdByUserId: principal.subjectId,
      },
    });
    await transaction.deliveryMeasurement.create({
      data: {
        deliveryId,
        measurementType: 'WEIGHT',
        grossQuantity: weight.grossQuantity,
        tareQuantity: weight.tareQuantity,
        netQuantity: weight.netQuantity,
        unit: weight.unit,
        captureMethod: weight.captureMethod,
        ...instrumentAssessment,
        capturedByUserId: principal.subjectId,
        capturedAt: clientCreatedAt,
      },
    });
    await transaction.deliveryPricing.create({
      data: {
        deliveryId,
        unitPriceMinor: pricing.unitPriceMinor,
        currency: pricing.currency,
        quantity: pricing.quantity,
        quantityUnit: pricing.quantityUnit,
        grossAmountMinor: pricing.grossAmountMinor,
        adjustmentAmountMinor: pricing.adjustmentAmountMinor,
        netAmountMinor: pricing.netAmountMinor,
        priceSource: pricing.priceSource,
        ...(pricing.priceReference ? { priceReference: pricing.priceReference } : {}),
        ...(pricing.overrideReason ? { overrideReason: pricing.overrideReason } : {}),
      },
    });
    for (const value of qualityValues) {
      await transaction.deliveryQualityMeasurement.create({
        data: {
          deliveryId,
          qualityAttributeDefinitionId: value.qualityAttributeDefinitionId,
          ...this.qualityValueData(value),
          capturedByUserId: principal.subjectId,
          capturedAt: new Date(value.capturedAt),
          ...(value.notes ? { notes: value.notes } : {}),
        },
      });
    }
    if (confirmation) {
      await transaction.deliveryConfirmation.create({
        data: {
          deliveryId,
          method: confirmation.method,
          status: confirmation.status,
          ...(confirmation.confirmedByName
            ? { confirmedByName: confirmation.confirmedByName }
            : {}),
          confirmedByFarmerId: input.farmerId,
          ...(confirmation.confirmationReference
            ? { confirmationReference: confirmation.confirmationReference }
            : {}),
          witnessUserId: principal.subjectId,
          confirmedAt: new Date(confirmation.confirmedAt),
          metadata: {},
        },
      });
    }
    if (accepted) await this.issueReceipt(transaction, deliveryId, principal.subjectId);
    await this.recordMutation(
      transaction,
      organizationId,
      deliveryId,
      principal.subjectId,
      accepted ? 'DELIVERY_ACCEPTED' : 'DELIVERY_RECORDED',
      requestId,
    );
    return transaction.delivery.findUniqueOrThrow({
      where: { id: deliveryId },
      include: deliveryInclude,
    });
  }

  private async validateQuality(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    commodityFormId: string,
    values: QualityValue[],
  ) {
    const definitions = await transaction.qualityAttributeDefinition.findMany({
      where: {
        commodityFormId,
        status: 'ACTIVE',
        OR: [{ organizationId: null }, { organizationId }],
      },
    });
    const effective = new Map<string, (typeof definitions)[number]>();
    for (const definition of definitions) {
      const current = effective.get(definition.code);
      if (!current || definition.organizationId === organizationId)
        effective.set(definition.code, definition);
    }
    const effectiveById = new Map(
      [...effective.values()].map((definition) => [definition.id, definition]),
    );
    const providedIds = new Set(values.map((value) => value.qualityAttributeDefinitionId));
    for (const definition of effective.values()) {
      if (definition.required && !providedIds.has(definition.id)) {
        throw new UnprocessableEntityException({
          code: 'QUALITY_MEASUREMENT_REQUIRED',
          message: `${definition.name} is required`,
        });
      }
    }
    for (const value of values) {
      const definition = effectiveById.get(value.qualityAttributeDefinitionId);
      if (!definition || definition.dataType !== value.dataType) {
        throw new UnprocessableEntityException(
          'Quality measurement does not match the active definition',
        );
      }
      if (value.dataType === 'ENUM') {
        const allowed = Array.isArray(definition.allowedValues) ? definition.allowedValues : [];
        if (!allowed.includes(value.value)) {
          throw new UnprocessableEntityException({
            code: 'QUALITY_MEASUREMENT_OUT_OF_RANGE',
            message: `${definition.name} is not an allowed value`,
          });
        }
      }
      if (value.dataType === 'DECIMAL' || value.dataType === 'INTEGER') {
        const decimal = new Prisma.Decimal(value.value);
        if (
          (definition.minimumValue && decimal.lessThan(definition.minimumValue)) ||
          (definition.maximumValue && decimal.greaterThan(definition.maximumValue))
        ) {
          throw new UnprocessableEntityException({
            code: 'QUALITY_MEASUREMENT_OUT_OF_RANGE',
            message: `${definition.name} is outside the configured range`,
          });
        }
      }
    }
    return values;
  }

  private qualityValueData(value: QualityValue) {
    if (value.dataType === 'DECIMAL') return { decimalValue: value.value };
    if (value.dataType === 'INTEGER') return { integerValue: value.value };
    if (value.dataType === 'TEXT') return { textValue: value.value };
    if (value.dataType === 'ENUM') return { enumValue: value.value };
    return { booleanValue: value.value };
  }

  private async transition(
    organizationId: string,
    deliveryId: string,
    lockVersion: number,
    from: DeliveryStatus[],
    to: DeliveryStatus,
    action: string,
    principal: AuthenticatedPrincipal,
    requestId: string,
    metadata: Prisma.InputJsonObject = {},
  ) {
    await this.database.client.$transaction(async (transaction) => {
      const result = await transaction.delivery.updateMany({
        where: { id: deliveryId, organizationId, lockVersion, status: { in: from } },
        data: { status: to, lockVersion: { increment: 1 } },
      });
      if (result.count !== 1) this.throwVersionConflict();
      await this.recordMutation(
        transaction,
        organizationId,
        deliveryId,
        principal.subjectId,
        action,
        requestId,
        metadata,
      );
    });
  }

  private async issueReceipt(
    transaction: Prisma.TransactionClient,
    deliveryId: string,
    issuedByUserId: string,
  ) {
    const delivery = await transaction.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
    const receiptNumber = `RCP-${delivery.deliveryNumber}-V${delivery.version}`;
    const receipt = await transaction.deliveryReceipt.create({
      data: {
        deliveryId,
        receiptNumber,
        version: 1,
        issuedByUserId,
        checksum: sha256(
          `${delivery.id}:${delivery.deliveryNumber}:${delivery.version}:${delivery.updatedAt.toISOString()}`,
        ),
      },
    });
    await this.events.create(
      {
        aggregateType: 'DeliveryReceipt',
        aggregateId: receipt.id,
        eventType: 'DELIVERY_RECEIPT_ISSUED',
        payload: { organizationId: delivery.organizationId, deliveryId, receiptId: receipt.id },
      },
      transaction,
    );
    return receipt;
  }

  private async recordMutation(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    deliveryId: string,
    actorUserId: string,
    action: string,
    requestId: string,
    metadata: Prisma.InputJsonObject = {},
  ) {
    await this.audit.create(
      {
        organizationId,
        actorUserId,
        action,
        entityType: 'Delivery',
        entityId: deliveryId,
        requestId,
        metadata,
      },
      transaction,
    );
    await this.events.create(
      {
        aggregateType: 'Delivery',
        aggregateId: deliveryId,
        eventType: action,
        payload: { organizationId, deliveryId, ...metadata },
      },
      transaction,
    );
  }

  private throwVersionConflict(): never {
    throw new ConflictException({
      code: 'DELIVERY_VERSION_CONFLICT',
      message: 'Delivery state or lock version changed; refresh before retrying',
    });
  }

  private deliveryNumber(clientCreatedAt: Date) {
    const date = clientCreatedAt.toISOString().slice(0, 10).replaceAll('-', '');
    return `DLV-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private serializeDeliveryListItem(delivery: DeliveryListRecord) {
    const measurement = delivery.measurements.find(
      (candidate) => candidate.measurementType === 'WEIGHT',
    );
    if (!measurement || !delivery.pricing)
      throw new Error('Delivery financial facts are incomplete');
    return {
      id: delivery.id,
      publicId: delivery.publicId,
      deliveryNumber: delivery.deliveryNumber,
      version: delivery.version,
      lockVersion: delivery.lockVersion,
      status: delivery.status,
      source: delivery.source,
      farmerId: delivery.farmerId,
      farmerDisplayName: [
        delivery.farmer.firstName,
        delivery.farmer.middleName,
        delivery.farmer.lastName,
      ]
        .filter(Boolean)
        .join(' '),
      farmerNumber: delivery.farmer.farmerNumber,
      commodityName: delivery.commodity.name,
      commodityFormName: delivery.commodityForm.name,
      netQuantity: measurement.netQuantity.toString(),
      netAmountMinor: delivery.pricing.netAmountMinor.toString(),
      currency: delivery.pricing.currency,
      serverReceivedAt: delivery.serverReceivedAt.toISOString(),
      clientClockFlagged: delivery.clientClockFlagged,
    };
  }

  private serializeDelivery(delivery: DeliveryRecord) {
    const listItem = this.serializeDeliveryListItem(delivery);
    const measurement = delivery.measurements.find(
      (candidate) => candidate.measurementType === 'WEIGHT',
    );
    if (!measurement || !delivery.pricing)
      throw new Error('Delivery financial facts are incomplete');
    return {
      ...listItem,
      organizationId: delivery.organizationId,
      collectionPointId: delivery.collectionPointId,
      collectionPointName: delivery.collectionPoint.name,
      collectionSessionId: delivery.collectionSessionId,
      farmId: delivery.farmId,
      farmName: delivery.farm?.name ?? null,
      commodityId: delivery.commodityId,
      commodityFormId: delivery.commodityFormId,
      clientCreatedAt: delivery.clientCreatedAt.toISOString(),
      acceptedAt: delivery.acceptedAt?.toISOString() ?? null,
      confirmedAt: delivery.confirmedAt?.toISOString() ?? null,
      confirmationMethod: delivery.confirmationMethod,
      notes: delivery.notes,
      measurement: {
        id: measurement.id,
        grossQuantity: measurement.grossQuantity?.toString() ?? null,
        tareQuantity: measurement.tareQuantity?.toString() ?? null,
        netQuantity: measurement.netQuantity.toString(),
        unit: measurement.unit,
        captureMethod: measurement.captureMethod,
        reportedInstrumentId: measurement.reportedInstrumentId,
        instrumentId: measurement.instrumentId,
        instrumentFlagged: measurement.instrumentFlagged,
        instrumentFlagReason: measurement.instrumentFlagReason,
        version: measurement.version,
        supersedesMeasurementId: measurement.supersedesMeasurementId,
      },
      pricing: {
        unitPriceMinor: delivery.pricing.unitPriceMinor.toString(),
        currency: delivery.pricing.currency,
        quantity: delivery.pricing.quantity.toString(),
        quantityUnit: delivery.pricing.quantityUnit,
        grossAmountMinor: delivery.pricing.grossAmountMinor.toString(),
        adjustmentAmountMinor: delivery.pricing.adjustmentAmountMinor.toString(),
        netAmountMinor: delivery.pricing.netAmountMinor.toString(),
        priceSource: delivery.pricing.priceSource,
        priceReference: delivery.pricing.priceReference,
      },
      qualityMeasurements: delivery.qualityMeasurements.map((measurementValue) => ({
        qualityAttributeDefinitionId: measurementValue.qualityAttributeDefinitionId,
        code: measurementValue.qualityAttributeDefinition.code,
        name: measurementValue.qualityAttributeDefinition.name,
        dataType: measurementValue.qualityAttributeDefinition.dataType,
        value:
          measurementValue.decimalValue?.toString() ??
          measurementValue.integerValue ??
          measurementValue.textValue ??
          measurementValue.enumValue ??
          measurementValue.booleanValue ??
          '',
        unit: measurementValue.qualityAttributeDefinition.unit,
      })),
      confirmations: delivery.confirmations.map((confirmation) => ({
        id: confirmation.id,
        method: confirmation.method,
        status: confirmation.status,
        confirmedByName: confirmation.confirmedByName,
        confirmedAt: confirmation.confirmedAt.toISOString(),
        witnessUserId: confirmation.witnessUserId,
      })),
      correctionRequests: delivery.correctionRequests.map((correction) => ({
        id: correction.id,
        reasonCode: correction.reasonCode,
        reason: correction.reason,
        status: correction.status,
        requestedByUserId: correction.requestedByUserId,
        reviewedByUserId: correction.reviewedByUserId,
        reviewedAt: correction.reviewedAt?.toISOString() ?? null,
        reviewNotes: correction.reviewNotes,
        replacementDeliveryVersionId: correction.replacementDeliveryVersionId,
        createdAt: correction.createdAt.toISOString(),
      })),
      supersedesDeliveryId: delivery.supersedesDeliveryId,
    };
  }

  private serializeReceipt(
    delivery: DeliveryRecord,
    receipt: DeliveryRecord['receipts'][number],
    isReprint: boolean,
  ) {
    const verificationBase = this.config.get('QR_PUBLIC_BASE_URL', { infer: true });
    return {
      id: receipt.id,
      deliveryId: receipt.deliveryId,
      receiptNumber: receipt.receiptNumber,
      version: receipt.version,
      status: receipt.status,
      issuedAt: receipt.issuedAt.toISOString(),
      checksum: receipt.checksum,
      shortVerificationCode: receipt.checksum.slice(0, 12).toUpperCase(),
      reprintCount: receipt.reprintCount,
      isReprint,
      supersededById: receipt.supersededById,
      statement: 'This is a collection receipt and is not necessarily proof of final payment.',
      delivery: this.serializeDelivery(delivery),
      cooperativeName: delivery.organization.name,
      agentName: `${delivery.createdBy.firstName} ${delivery.createdBy.lastName}`,
      verificationUrl: `${verificationBase}/receipts/${receipt.receiptNumber}`,
    };
  }

  private serializeCorrection(correction: {
    id: string;
    deliveryId: string;
    requestedByUserId: string;
    reasonCode: DeliveryCorrectionReasonCode;
    reason: string;
    proposedChanges: Prisma.JsonValue;
    status: DeliveryCorrectionStatus;
    reviewedByUserId: string | null;
    reviewedAt: Date | null;
    reviewNotes: string | null;
    replacementDeliveryVersionId: string | null;
    createdAt: Date;
  }) {
    return {
      ...correction,
      reviewedAt: correction.reviewedAt?.toISOString() ?? null,
      createdAt: correction.createdAt.toISOString(),
    };
  }
}
