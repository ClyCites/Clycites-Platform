import { z } from 'zod';

const uuidSchema = z.uuid();
const quantitySchema = z.string().regex(/^\d{1,14}(?:\.\d{1,4})?$/);
const moneyMinorSchema = z.string().regex(/^\d+$/);
const currencySchema = z.string().regex(/^[A-Z]{3}$/);
const dateSchema = z.iso.date();
const dateTimeSchema = z.iso.datetime();

export const marketplaceListingStatusSchema = z.enum([
  'DRAFT',
  'PUBLISHED',
  'PAUSED',
  'UNDER_OFFER',
  'PARTIALLY_RESERVED',
  'FULLY_RESERVED',
  'EXPIRED',
  'CLOSED',
  'CANCELLED',
]);
export const listingPricingMethodSchema = z.enum([
  'FIXED_PRICE',
  'NEGOTIABLE',
  'REQUEST_FOR_OFFERS',
]);
export const listingVisibilitySchema = z.enum(['PUBLIC_BUYERS', 'INVITED_BUYERS', 'PRIVATE']);
export const offerStatusSchema = z.enum([
  'DRAFT',
  'SUBMITTED',
  'COUNTERED',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
  'EXPIRED',
  'SUPERSEDED',
]);
export const lotReservationStatusSchema = z.enum([
  'ACTIVE',
  'CONTRACTED',
  'CONSUMED',
  'RELEASED',
  'EXPIRED',
  'CANCELLED',
]);
export const salesContractStatusSchema = z.enum([
  'DRAFT',
  'PENDING_SELLER_APPROVAL',
  'PENDING_BUYER_APPROVAL',
  'ACTIVE',
  'FULFILLED',
  'CANCELLED',
  'EXPIRED',
  'DISPUTED',
]);
export const contractAmendmentStatusSchema = z.enum([
  'PROPOSED',
  'PENDING_COUNTERPARTY',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
  'EXPIRED',
]);
export const salesOrderStatusSchema = z.enum([
  'PENDING_FULFILLMENT',
  'READY_FOR_DISPATCH',
  'DISPATCHED',
  'IN_TRANSIT',
  'RECEIVED',
  'PENDING_BUYER_INSPECTION',
  'ACCEPTED',
  'REJECTED',
  'COMPLETED',
  'CANCELLED',
  'DISPUTED',
]);
export const buyerInspectionStatusSchema = z.enum([
  'DRAFT',
  'COMPLETED',
  'ACCEPTED',
  'REJECTED',
  'SUPERSEDED',
]);
export const buyerAcceptanceDecisionSchema = z.enum(['ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED']);
export const traceabilityShareScopeSchema = z.enum([
  'LOT_SUMMARY',
  'QUALITY_DETAILS',
  'CUSTODY_DETAILS',
  'TRACEABILITY_LINEAGE',
  'DOCUMENTS',
]);

export const createMarketplaceListingSchema = z
  .object({
    lotId: uuidSchema,
    listingNumber: z.string().trim().min(1).max(80),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional(),
    listedQuantity: quantitySchema,
    currency: currencySchema,
    pricingMethod: listingPricingMethodSchema,
    askingUnitPriceMinor: moneyMinorSchema.optional(),
    minimumOfferUnitPriceMinor: moneyMinorSchema.optional(),
    minimumOfferQuantity: quantitySchema.optional(),
    allowPartialQuantity: z.boolean().default(false),
    visibility: listingVisibilitySchema.default('PUBLIC_BUYERS'),
    expiresAt: dateTimeSchema.optional(),
  })
  .strict();

export const updateMarketplaceListingSchema = createMarketplaceListingSchema
  .omit({ lotId: true, listingNumber: true })
  .partial()
  .extend({ version: z.number().int().positive() })
  .strict();

export const inviteBuyerSchema = z
  .object({ buyerOrganizationId: uuidSchema, expiresAt: dateTimeSchema.optional() })
  .strict();

export const submitOfferSchema = z
  .object({
    quantity: quantitySchema,
    unitPriceMinor: moneyMinorSchema,
    currency: currencySchema,
    deliveryTerm: z.string().trim().min(1).max(200),
    proposedDeliveryDate: dateSchema.optional(),
    validUntil: dateTimeSchema,
    message: z.string().trim().max(1000).optional(),
  })
  .strict();

export const counterOfferSchema = submitOfferSchema
  .extend({ version: z.number().int().positive() })
  .strict();
export const versionedActionSchema = z.object({ version: z.number().int().positive() }).strict();
export const reasonActionSchema = z
  .object({ version: z.number().int().positive(), reason: z.string().trim().min(1).max(500) })
  .strict();
export const reasonSchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict();

export const createContractAmendmentSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
    proposedChanges: z.record(z.string(), z.unknown()),
  })
  .strict();

export const createOrderSchema = z
  .object({
    fulfillmentMethod: z.string().trim().min(1).max(120),
    expectedDispatchAt: dateTimeSchema.optional(),
  })
  .strict();

export const attachCustodyTransferSchema = z
  .object({ custodyTransferId: uuidSchema, version: z.number().int().positive() })
  .strict();

const inspectionMeasurementSchema = z
  .object({
    qualityAttributeDefinitionId: uuidSchema,
    decimalValue: z
      .string()
      .regex(/^-?\d{1,14}(?:\.\d{1,6})?$/)
      .optional(),
    integerValue: z.number().int().optional(),
    textValue: z.string().trim().max(500).optional(),
    booleanValue: z.boolean().optional(),
    enumValue: z.string().trim().max(120).optional(),
  })
  .strict()
  .refine(
    (value) =>
      [
        value.decimalValue,
        value.integerValue,
        value.textValue,
        value.booleanValue,
        value.enumValue,
      ].filter((item) => item !== undefined).length === 1,
    'Exactly one measurement value is required',
  );

export const createBuyerInspectionSchema = z
  .object({
    inspectionNumber: z.string().trim().min(1).max(80),
    sampledAt: dateTimeSchema,
    status: buyerInspectionStatusSchema,
    notes: z.string().trim().max(1000).optional(),
    supersedesInspectionId: uuidSchema.optional(),
    measurements: z.array(inspectionMeasurementSchema).max(100).default([]),
  })
  .strict();

export const recordBuyerAcceptanceSchema = z
  .object({
    decision: buyerAcceptanceDecisionSchema,
    acceptedQuantity: quantitySchema,
    rejectedQuantity: quantitySchema,
    reasonCode: z.string().trim().max(120).optional(),
    reason: z.string().trim().max(1000).optional(),
    buyerInspectionId: uuidSchema.optional(),
    supersedesAcceptanceId: uuidSchema.optional(),
  })
  .strict();

export const createTraceabilityShareSchema = z
  .object({
    buyerOrganizationId: uuidSchema,
    listingId: uuidSchema.optional(),
    contractId: uuidSchema.optional(),
    lotId: uuidSchema,
    scopes: z.array(traceabilityShareScopeSchema).min(1),
    expiresAt: dateTimeSchema,
  })
  .strict();

export const PHASE_FIVE_ERROR_CODES = {
  LISTING_NOT_ELIGIBLE: 'LISTING_NOT_ELIGIBLE',
  LISTING_NOT_ACTIVE: 'LISTING_NOT_ACTIVE',
  LISTING_VISIBILITY_DENIED: 'LISTING_VISIBILITY_DENIED',
  OFFER_NOT_ACTIONABLE: 'OFFER_NOT_ACTIONABLE',
  OFFER_EXPIRED: 'OFFER_EXPIRED',
  INSUFFICIENT_AVAILABLE_QUANTITY: 'INSUFFICIENT_AVAILABLE_QUANTITY',
  RESERVATION_EXPIRED: 'RESERVATION_EXPIRED',
  CONTRACT_APPROVAL_ORDER_INVALID: 'CONTRACT_APPROVAL_ORDER_INVALID',
  ORDER_TRANSITION_INVALID: 'ORDER_TRANSITION_INVALID',
  CUSTODY_NOT_RECEIVED: 'CUSTODY_NOT_RECEIVED',
  ACCEPTANCE_QUANTITY_MISMATCH: 'ACCEPTANCE_QUANTITY_MISMATCH',
  TRACEABILITY_SHARE_DENIED: 'TRACEABILITY_SHARE_DENIED',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
} as const;

export type CreateMarketplaceListingInput = z.infer<typeof createMarketplaceListingSchema>;
export type UpdateMarketplaceListingInput = z.infer<typeof updateMarketplaceListingSchema>;
export type InviteBuyerInput = z.infer<typeof inviteBuyerSchema>;
export type SubmitOfferInput = z.infer<typeof submitOfferSchema>;
export type CounterOfferInput = z.infer<typeof counterOfferSchema>;
export type VersionedActionInput = z.infer<typeof versionedActionSchema>;
export type ReasonActionInput = z.infer<typeof reasonActionSchema>;
export type ReasonInput = z.infer<typeof reasonSchema>;
export type CreateContractAmendmentInput = z.infer<typeof createContractAmendmentSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type AttachCustodyTransferInput = z.infer<typeof attachCustodyTransferSchema>;
export type CreateBuyerInspectionInput = z.infer<typeof createBuyerInspectionSchema>;
export type RecordBuyerAcceptanceInput = z.infer<typeof recordBuyerAcceptanceSchema>;
export type CreateTraceabilityShareInput = z.infer<typeof createTraceabilityShareSchema>;
