import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AnchorMessage } from '@clycites/contracts';
import { Prisma } from '@clycites/database';
import { createPrivacyReference, hashPayload } from '@clycites/hedera';

import type { ApiEnvironment } from '../config/environment.js';

const EVENT_TYPE_MAP = {
  DELIVERY_ACCEPTED: 'DELIVERY_ACCEPTED',
  DELIVERY_CORRECTION_APPROVED: 'DELIVERY_CORRECTED',
  DELIVERY_RECEIPT_ISSUED: 'RECEIPT_ISSUED',
  PRODUCE_BATCH_CREATED: 'BATCH_CREATED',
  FARMER_BATCH_CONTRIBUTION_ADDED: 'DELIVERY_ADDED_TO_BATCH',
  PRODUCE_BATCH_SEALED: 'BATCH_SEALED',
  BATCH_TRANSFORMATION_COMPLETED: 'TRANSFORMATION_COMPLETED',
  COOPERATIVE_LOT_CREATED: 'LOT_CREATED',
  BATCH_ADDED_TO_LOT: 'BATCH_ADDED_TO_LOT',
  COOPERATIVE_LOT_SEALED: 'LOT_SEALED',
  COOPERATIVE_LOT_APPROVED: 'LOT_QUALITY_APPROVED',
  CUSTODY_TRANSFER_RECEIVED: 'CUSTODY_TRANSFER_CONFIRMED',
  TRACEABILITY_RECORD_CORRECTED: 'TRACEABILITY_RECORD_CORRECTED',
  TRACEABILITY_RECORD_SUPERSEDED: 'TRACEABILITY_RECORD_SUPERSEDED',
  MARKETPLACE_LISTING_PUBLISHED: 'MARKETPLACE_LISTING_PUBLISHED',
  OFFER_ACCEPTED: 'OFFER_ACCEPTED',
  SALES_CONTRACT_ACTIVATED: 'SALES_CONTRACT_ACTIVATED',
  ORDER_DISPATCHED: 'ORDER_DISPATCHED',
  ORDER_RECEIVED: 'ORDER_RECEIVED',
  BUYER_ACCEPTANCE_RECORDED: 'BUYER_ACCEPTANCE_RECORDED',
  SALES_ORDER_COMPLETED: 'SALES_ORDER_COMPLETED',
} as const;

type SourceEventType = keyof typeof EVENT_TYPE_MAP;
type AnchorEventType = AnchorMessage['eventType'];

export const ELIGIBLE_ANCHOR_EVENT_TYPES = new Set<string>(Object.keys(EVENT_TYPE_MAP));

export interface AnchorPreparationInput {
  eventId: string;
  aggregateId: string;
  eventType: string;
  organizationId: string;
  payload: Prisma.InputJsonObject;
}

export interface PreparedAnchor {
  eventType: AnchorEventType;
  entityType: AnchorMessage['entityType'];
  entityId: string;
  canonicalPayload: Prisma.InputJsonObject;
  canonicalPayloadHash: string;
  organizationReference: string;
  entityReference: string;
  supersedesAnchorId: string | null;
}

@Injectable()
export class AnchorEligibilityService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  async prepare(
    input: AnchorPreparationInput,
    transaction: Prisma.TransactionClient,
  ): Promise<PreparedAnchor | null> {
    const mappedEventType = EVENT_TYPE_MAP[input.eventType as SourceEventType];
    const eventType =
      input.eventType === 'BATCH_TRANSFORMATION_COMPLETED' && input.payload.type === 'SPLIT'
        ? 'BATCH_SPLIT'
        : input.eventType === 'BATCH_TRANSFORMATION_COMPLETED' && input.payload.type === 'MERGE'
          ? 'BATCH_MERGED'
          : mappedEventType;
    if (!eventType) return null;
    const entityType = this.entityType(eventType);
    const canonicalPayload = await this.canonicalPayload(eventType, input, transaction);
    if (!canonicalPayload) return null;
    return {
      eventType,
      entityType,
      entityId: input.aggregateId,
      canonicalPayload,
      canonicalPayloadHash: hashPayload(canonicalPayload),
      organizationReference: this.reference('ORGANIZATION', input.organizationId),
      entityReference: this.reference(entityType, input.aggregateId),
      supersedesAnchorId:
        typeof input.payload.supersedesAnchorId === 'string'
          ? input.payload.supersedesAnchorId
          : null,
    };
  }

  buildMessage(
    anchor: PreparedAnchor,
    eventId: string,
    occurredAt: Date,
    previousEventHash: string | null,
  ): AnchorMessage {
    return {
      schemaVersion: '1.0',
      anchorEventId: eventId,
      eventType: anchor.eventType,
      organizationRef: anchor.organizationReference,
      entityType: anchor.entityType,
      entityRef: anchor.entityReference,
      payloadHash: anchor.canonicalPayloadHash,
      previousEventHash,
      occurredAt: occurredAt.toISOString(),
    };
  }

  rebuildCanonicalPayload(
    eventType: AnchorMessage['eventType'],
    input: AnchorPreparationInput,
    transaction: Prisma.TransactionClient,
  ): Promise<Prisma.InputJsonObject | null> {
    return this.canonicalPayload(eventType, input, transaction);
  }

  private reference(entityType: string, entityId: string): string {
    return createPrivacyReference(
      this.config.getOrThrow('HEDERA_REFERENCE_SECRET', { infer: true }),
      this.config.getOrThrow('HEDERA_REFERENCE_SECRET_VERSION', { infer: true }),
      entityType,
      entityId,
    );
  }

  private entityType(eventType: AnchorEventType): AnchorMessage['entityType'] {
    if (eventType.startsWith('DELIVERY_')) return 'DELIVERY';
    if (eventType === 'RECEIPT_ISSUED') return 'RECEIPT';
    if (eventType.startsWith('BATCH_') || eventType === 'DELIVERY_ADDED_TO_BATCH') return 'BATCH';
    if (eventType === 'TRANSFORMATION_COMPLETED') return 'TRANSFORMATION';
    if (eventType.startsWith('LOT_')) return 'LOT';
    if (eventType === 'CUSTODY_TRANSFER_CONFIRMED') return 'CUSTODY_TRANSFER';
    if (eventType === 'MARKETPLACE_LISTING_PUBLISHED') return 'MARKETPLACE_LISTING';
    if (eventType === 'OFFER_ACCEPTED') return 'OFFER';
    if (eventType === 'SALES_CONTRACT_ACTIVATED') return 'SALES_CONTRACT';
    if (eventType === 'BUYER_ACCEPTANCE_RECORDED') return 'BUYER_ACCEPTANCE';
    if (eventType.startsWith('ORDER_') || eventType === 'SALES_ORDER_COMPLETED')
      return 'SALES_ORDER';
    return 'TRACEABILITY_RECORD';
  }

  private canonicalPayload(
    eventType: AnchorEventType,
    input: AnchorPreparationInput,
    transaction: Prisma.TransactionClient,
  ): Promise<Prisma.InputJsonObject | null> {
    if (eventType.startsWith('DELIVERY_') || eventType === 'RECEIPT_ISSUED')
      return this.deliveryPayload(eventType, input, transaction);
    if (eventType.startsWith('BATCH_') || eventType === 'DELIVERY_ADDED_TO_BATCH')
      return this.batchPayload(eventType, input, transaction);
    if (eventType === 'TRANSFORMATION_COMPLETED')
      return this.transformationPayload(input, transaction);
    if (eventType.startsWith('LOT_')) return this.lotPayload(eventType, input, transaction);
    if (eventType === 'CUSTODY_TRANSFER_CONFIRMED') return this.custodyPayload(input, transaction);
    if (
      eventType === 'MARKETPLACE_LISTING_PUBLISHED' ||
      eventType === 'OFFER_ACCEPTED' ||
      eventType === 'SALES_CONTRACT_ACTIVATED' ||
      eventType.startsWith('ORDER_') ||
      eventType === 'BUYER_ACCEPTANCE_RECORDED' ||
      eventType === 'SALES_ORDER_COMPLETED'
    )
      return this.commercialPayload(eventType, input, transaction);
    return Promise.resolve({
      schemaVersion: '1.0',
      eventId: input.eventId,
      eventType,
      organizationId: input.organizationId,
      entityId: input.aggregateId,
    });
  }

  private async deliveryPayload(
    eventType: AnchorEventType,
    input: AnchorPreparationInput,
    transaction: Prisma.TransactionClient,
  ): Promise<Prisma.InputJsonObject | null> {
    const authoritativeDeliveryId =
      eventType === 'DELIVERY_CORRECTED' && typeof input.payload.replacementDeliveryId === 'string'
        ? input.payload.replacementDeliveryId
        : typeof input.payload.deliveryId === 'string'
          ? input.payload.deliveryId
          : input.aggregateId;
    const delivery = await transaction.delivery.findUnique({
      where: { id: authoritativeDeliveryId },
      include: {
        commodity: { select: { code: true } },
        commodityForm: { select: { code: true } },
        measurements: { where: { measurementType: 'WEIGHT' }, take: 1 },
        qualityMeasurements: {
          include: { qualityAttributeDefinition: { select: { code: true } } },
        },
        receipts: { orderBy: { issuedAt: 'desc' }, take: 1 },
      },
    });
    if (!delivery || !['ACCEPTED', 'CORRECTED', 'CORRECTION_PENDING'].includes(delivery.status))
      return null;
    const weight = delivery.measurements[0];
    if (!weight || !delivery.acceptedAt) return null;
    const qualityFacts = delivery.qualityMeasurements
      .map((measurement) => ({
        code: measurement.qualityAttributeDefinition.code,
        value:
          measurement.decimalValue?.toString() ??
          measurement.integerValue?.toString() ??
          measurement.textValue ??
          measurement.enumValue ??
          measurement.booleanValue?.toString() ??
          null,
      }))
      .sort((left, right) => left.code.localeCompare(right.code));
    return {
      schemaVersion: '1.0',
      eventId: input.eventId,
      eventType,
      organizationId: delivery.organizationId,
      deliveryId: delivery.id,
      deliveryPublicId: delivery.publicId,
      farmerReferenceHash: this.reference('FARMER', delivery.farmerId),
      commodityCode: delivery.commodity.code,
      commodityFormCode: delivery.commodityForm.code,
      netQuantity: weight.netQuantity.toFixed(4),
      quantityUnit: weight.unit,
      qualitySummaryHash: hashPayload(qualityFacts),
      receiptChecksum: delivery.receipts[0]?.checksum ?? null,
      acceptedAt: delivery.acceptedAt.toISOString(),
      recordVersion: delivery.version,
    };
  }

  private async batchPayload(
    eventType: AnchorEventType,
    input: AnchorPreparationInput,
    transaction: Prisma.TransactionClient,
  ): Promise<Prisma.InputJsonObject | null> {
    const batch = await transaction.produceBatch.findUnique({
      where: { id: input.aggregateId },
      include: {
        commodity: { select: { code: true } },
        commodityForm: { select: { code: true } },
        farmerContributions: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!batch || (eventType === 'BATCH_SEALED' && batch.status !== 'SEALED')) return null;
    return {
      schemaVersion: '1.0',
      eventId: input.eventId,
      eventType,
      organizationId: batch.organizationId,
      batchId: batch.id,
      batchPublicId: batch.publicId,
      commodityCode: batch.commodity.code,
      commodityFormCode: batch.commodityForm.code,
      quantity: batch.initialQuantity.toFixed(4),
      quantityUnit: batch.quantityUnit,
      status: batch.status,
      contributionHashes: batch.farmerContributions
        .map((item) =>
          hashPayload({ deliveryId: item.deliveryId, quantity: item.quantity.toFixed(4) }),
        )
        .sort(),
      sealedAt: batch.sealedAt?.toISOString() ?? null,
    };
  }

  private async transformationPayload(
    input: AnchorPreparationInput,
    transaction: Prisma.TransactionClient,
  ): Promise<Prisma.InputJsonObject | null> {
    const transformation = await transaction.batchTransformation.findUnique({
      where: { id: input.aggregateId },
      include: { inputs: true, outputs: true },
    });
    if (!transformation || transformation.status !== 'COMPLETED' || !transformation.completedAt)
      return null;
    return {
      schemaVersion: '1.0',
      eventId: input.eventId,
      eventType: 'TRANSFORMATION_COMPLETED',
      organizationId: transformation.organizationId,
      transformationId: transformation.id,
      transformationType: transformation.type,
      parentEventHashes: transformation.inputs
        .map((item) => hashPayload({ batchId: item.batchId, quantity: item.quantity.toFixed(4) }))
        .sort(),
      outputs: transformation.outputs
        .map((item) => ({
          batchId: item.batchId,
          quantity: item.quantity.toFixed(4),
          unit: item.unit,
        }))
        .sort((left, right) => left.batchId.localeCompare(right.batchId)),
      completedAt: transformation.completedAt.toISOString(),
    };
  }

  private async lotPayload(
    eventType: AnchorEventType,
    input: AnchorPreparationInput,
    transaction: Prisma.TransactionClient,
  ): Promise<Prisma.InputJsonObject | null> {
    const lot = await transaction.cooperativeLot.findUnique({
      where: { id: input.aggregateId },
      include: {
        commodity: { select: { code: true } },
        commodityForm: { select: { code: true } },
        contributions: { orderBy: { batchId: 'asc' } },
        inspections: {
          where: { status: 'PASSED' },
          orderBy: { inspectedAt: 'desc' },
          take: 1,
          include: { measurements: { include: { qualityAttributeDefinition: true } } },
        },
      },
    });
    if (!lot || (eventType === 'LOT_QUALITY_APPROVED' && lot.status !== 'APPROVED')) return null;
    const inspection = lot.inspections[0];
    const qualityFacts = inspection?.measurements
      .map((measurement) => ({
        code: measurement.qualityAttributeDefinition.code,
        value:
          measurement.decimalValue?.toString() ??
          measurement.integerValue?.toString() ??
          measurement.textValue ??
          measurement.enumValue ??
          measurement.booleanValue?.toString() ??
          null,
      }))
      .sort((left, right) => left.code.localeCompare(right.code));
    return {
      schemaVersion: '1.0',
      eventId: input.eventId,
      eventType,
      organizationId: lot.organizationId,
      lotId: lot.id,
      lotPublicId: lot.publicId,
      commodityCode: lot.commodity.code,
      commodityFormCode: lot.commodityForm.code,
      quantity: lot.quantity.toFixed(4),
      quantityUnit: lot.quantityUnit,
      status: lot.status,
      parentEventHashes: lot.contributions
        .map((item) => hashPayload({ batchId: item.batchId, quantity: item.quantity.toFixed(4) }))
        .sort(),
      qualitySummaryHash: qualityFacts ? hashPayload(qualityFacts) : null,
    };
  }

  private async custodyPayload(
    input: AnchorPreparationInput,
    transaction: Prisma.TransactionClient,
  ): Promise<Prisma.InputJsonObject | null> {
    const transferId =
      typeof input.payload.transferId === 'string' ? input.payload.transferId : undefined;
    const transfer = transferId
      ? await transaction.custodyTransfer.findUnique({ where: { id: transferId } })
      : null;
    if (!transfer || transfer.status !== 'RECEIVED' || !transfer.receivedAt) return null;
    return {
      schemaVersion: '1.0',
      eventId: input.eventId,
      eventType: 'CUSTODY_TRANSFER_CONFIRMED',
      organizationId: transfer.fromOrganizationId,
      custodyTransferId: transfer.id,
      lotId: transfer.lotId,
      recipientOrganizationReference: this.reference('ORGANIZATION', transfer.toOrganizationId),
      quantity: transfer.quantity.toFixed(4),
      quantityUnit: transfer.quantityUnit,
      receivedAt: transfer.receivedAt.toISOString(),
    };
  }

  private async commercialPayload(
    eventType: AnchorEventType,
    input: AnchorPreparationInput,
    transaction: Prisma.TransactionClient,
  ): Promise<Prisma.InputJsonObject | null> {
    if (eventType === 'MARKETPLACE_LISTING_PUBLISHED') {
      const listing = await transaction.marketplaceListing.findUnique({
        where: { id: input.aggregateId },
        include: { lot: { select: { publicId: true } } },
      });
      if (!listing || !listing.publishedAt) return null;
      return {
        schemaVersion: '1.0',
        eventId: input.eventId,
        eventType,
        organizationId: listing.sellerOrganizationId,
        listingId: listing.id,
        listingPublicId: listing.publicId,
        lotPublicId: listing.lot.publicId,
        listedQuantity: listing.listedQuantity.toFixed(4),
        quantityUnit: listing.quantityUnit,
        currency: listing.currency,
        pricingMethod: listing.pricingMethod,
        publishedAt: listing.publishedAt.toISOString(),
        recordVersion: listing.version,
      };
    }
    if (eventType === 'OFFER_ACCEPTED') {
      const offer = await transaction.offer.findUnique({ where: { id: input.aggregateId } });
      if (!offer || offer.status !== 'ACCEPTED' || !offer.respondedAt) return null;
      return {
        schemaVersion: '1.0',
        eventId: input.eventId,
        eventType,
        organizationId: offer.sellerOrganizationId,
        offerId: offer.id,
        offerPublicId: offer.publicId,
        listingId: offer.listingId,
        buyerOrganizationReference: this.reference('ORGANIZATION', offer.buyerOrganizationId),
        quantity: offer.quantity.toFixed(4),
        quantityUnit: offer.quantityUnit,
        unitPriceMinor: offer.unitPriceMinor.toString(),
        currency: offer.currency,
        totalAmountMinor: offer.totalAmountMinor.toString(),
        acceptedAt: offer.respondedAt.toISOString(),
      };
    }
    if (eventType === 'SALES_CONTRACT_ACTIVATED') {
      const contract = await transaction.salesContract.findUnique({
        where: { id: input.aggregateId },
      });
      if (!contract || contract.status !== 'ACTIVE' || !contract.activatedAt) return null;
      return {
        schemaVersion: '1.0',
        eventId: input.eventId,
        eventType,
        organizationId: contract.sellerOrganizationId,
        contractId: contract.id,
        contractPublicId: contract.publicId,
        buyerOrganizationReference: this.reference('ORGANIZATION', contract.buyerOrganizationId),
        lotId: contract.lotId,
        quantity: contract.quantity.toFixed(4),
        quantityUnit: contract.quantityUnit,
        totalAmountMinor: contract.totalAmountMinor.toString(),
        currency: contract.currency,
        activatedAt: contract.activatedAt.toISOString(),
        recordVersion: contract.version,
      };
    }
    if (eventType === 'BUYER_ACCEPTANCE_RECORDED') {
      const acceptance = await transaction.buyerAcceptance.findUnique({
        where: { id: input.aggregateId },
        include: { order: true },
      });
      if (!acceptance || acceptance.decision !== 'ACCEPTED') return null;
      return {
        schemaVersion: '1.0',
        eventId: input.eventId,
        eventType,
        organizationId: acceptance.order.sellerOrganizationId,
        acceptanceId: acceptance.id,
        orderId: acceptance.orderId,
        buyerOrganizationReference: this.reference(
          'ORGANIZATION',
          acceptance.order.buyerOrganizationId,
        ),
        decision: acceptance.decision,
        acceptedQuantity: acceptance.acceptedQuantity.toFixed(4),
        quantityUnit: acceptance.unit,
        decidedAt: acceptance.decidedAt.toISOString(),
      };
    }
    const order = await transaction.salesOrder.findUnique({ where: { id: input.aggregateId } });
    if (!order) return null;
    const milestoneAt =
      eventType === 'ORDER_DISPATCHED'
        ? order.dispatchedAt
        : eventType === 'ORDER_RECEIVED'
          ? order.receivedAt
          : order.completedAt;
    if (!milestoneAt) return null;
    return {
      schemaVersion: '1.0',
      eventId: input.eventId,
      eventType,
      organizationId: order.sellerOrganizationId,
      orderId: order.id,
      orderPublicId: order.publicId,
      contractId: order.contractId,
      lotId: order.lotId,
      buyerOrganizationReference: this.reference('ORGANIZATION', order.buyerOrganizationId),
      custodyTransferId: order.custodyTransferId,
      quantity: order.quantity.toFixed(4),
      quantityUnit: order.quantityUnit,
      status: order.status,
      milestoneAt: milestoneAt.toISOString(),
      recordVersion: order.version,
    };
  }
}
