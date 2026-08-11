import { z } from 'zod';

const uuidSchema = z.uuid();
const moneyMinorSchema = z.string().regex(/^\d+$/);
const signedMoneyMinorSchema = z.string().regex(/^-?\d+$/);
const currencySchema = z.string().regex(/^[A-Z]{3}$/);
const dateSchema = z.iso.date();
const dateTimeSchema = z.iso.datetime();
const versionSchema = z.number().int().positive();
const reasonSchema = z.string().trim().min(1).max(500);

export const saleProceedsStatusSchema = z.enum([
  'DRAFT',
  'RECORDED',
  'VERIFIED',
  'PARTIALLY_RECEIVED',
  'REVERSED',
  'CANCELLED',
]);
export const saleProceedsSourceSchema = z.enum([
  'MANUAL_EXTERNAL_REFERENCE',
  'BANK_STATEMENT',
  'MOBILE_MONEY_STATEMENT',
  'PAYMENT_PROVIDER',
  'OTHER',
]);
export const settlementRunStatusSchema = z.enum([
  'DRAFT',
  'CALCULATING',
  'CALCULATED',
  'EXCEPTIONS_PENDING',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'PAYMENT_IN_PROGRESS',
  'PARTIALLY_PAID',
  'PAID',
  'FAILED',
  'CANCELLED',
  'SUPERSEDED',
]);
export const farmerSettlementStatusSchema = z.enum([
  'DRAFT',
  'CALCULATED',
  'EXCEPTION',
  'APPROVED',
  'CANCELLED',
  'SUPERSEDED',
]);
export const paymentInstructionStatusSchema = z.enum([
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'QUEUED',
  'SUBMITTED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'REVERSED',
  'REQUIRES_REVIEW',
]);
export const paymentAttemptStatusSchema = z.enum([
  'CREATED',
  'SUBMITTED',
  'PENDING',
  'SUCCESSFUL',
  'FAILED',
  'TIMED_OUT',
  'UNKNOWN',
  'REVERSED',
]);
export const paymentReconciliationStatusSchema = z.enum([
  'UNMATCHED',
  'POSSIBLE_MATCH',
  'MATCHED',
  'CONFIRMED',
  'REJECTED',
  'DUPLICATE',
  'REVERSED',
]);
export const deductionPolicyTypeSchema = z.enum([
  'FIXED_AMOUNT',
  'PERCENTAGE',
  'PER_QUANTITY_UNIT',
]);
export const deductionPolicyBasisSchema = z.enum([
  'GROSS_ENTITLEMENT',
  'DELIVERED_QUANTITY',
  'ACCEPTED_QUANTITY',
]);
export const farmerPaymentMethodTypeSchema = z.enum([
  'MOBILE_MONEY',
  'BANK_ACCOUNT',
  'CASH',
  'OTHER',
]);
export const paymentProviderSchema = z.enum(['manual', 'mock']);

export const recordSaleProceedsSchema = z
  .object({
    orderId: uuidSchema,
    proceedsNumber: z.string().trim().min(1).max(80),
    currency: currencySchema,
    expectedAmountMinor: moneyMinorSchema,
    recordedAmountMinor: moneyMinorSchema,
    source: saleProceedsSourceSchema,
    externalReference: z.string().trim().min(1).max(255).optional(),
    valueDate: dateSchema.optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();

export const verifySaleProceedsSchema = z.object({ version: versionSchema }).strict();
export const reverseSaleProceedsSchema = z
  .object({ version: versionSchema, reason: reasonSchema })
  .strict();

export const createSettlementRunSchema = z
  .object({
    settlementNumber: z.string().trim().min(1).max(80),
    currency: currencySchema,
    saleProceedsRecordIds: z.array(uuidSchema).min(1).max(250),
    exchangeRateId: uuidSchema.optional(),
  })
  .strict();

export const recordExchangeRateSchema = z
  .object({
    baseCurrency: currencySchema,
    quoteCurrency: currencySchema,
    rate: z.string().regex(/^\d+(?:\.\d{1,8})?$/),
    source: z.enum(['CENTRAL_BANK', 'COMMERCIAL_BANK', 'CONTRACT_FIXED', 'MANUAL']),
    sourceReference: z.string().trim().min(1).max(300).optional(),
    effectiveAt: dateTimeSchema,
  })
  .strict()
  .refine((value) => value.baseCurrency !== value.quoteCurrency, {
    message: 'baseCurrency and quoteCurrency must differ',
    path: ['quoteCurrency'],
  });

export const issueFarmerAdvanceSchema = z
  .object({
    farmerId: uuidSchema,
    reference: z.string().trim().min(1).max(160),
    currency: currencySchema,
    issuedAmountMinor: moneyMinorSchema,
    issuedAt: dateTimeSchema,
  })
  .strict();
export const settlementVersionActionSchema = z.object({ version: versionSchema }).strict();
export const settlementReasonActionSchema = z
  .object({ version: versionSchema, reason: reasonSchema })
  .strict();

export const resolveSettlementExceptionSchema = z
  .object({ resolution: z.string().trim().min(1).max(1000), version: versionSchema })
  .strict();
export const waiveSettlementExceptionSchema = resolveSettlementExceptionSchema.extend({
  reason: reasonSchema,
});

export const createDeductionPolicySchema = z
  .object({
    code: z.string().trim().min(1).max(80),
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(500),
    type: deductionPolicyTypeSchema,
    basis: deductionPolicyBasisSchema,
    value: z.string().regex(/^\d+(?:\.\d{1,8})?$/),
    currency: currencySchema.optional(),
    maximumAmountMinor: moneyMinorSchema.optional(),
    priority: z.number().int().nonnegative().default(100),
    effectiveFrom: dateSchema,
    effectiveTo: dateSchema.optional(),
    requiresFarmerConsent: z.boolean().default(false),
  })
  .strict();

export const addSettlementAdjustmentSchema = z
  .object({
    farmerSettlementId: uuidSchema,
    code: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(500),
    amountMinor: signedMoneyMinorSchema,
    reason: reasonSchema,
  })
  .strict();

const privatePaymentIdentifierSchema = z
  .object({
    type: z.enum(['MOBILE_MONEY', 'BANK_ACCOUNT', 'OTHER']),
    provider: z.string().trim().min(1).max(120),
    accountHolderName: z.string().trim().min(1).max(200),
    accountIdentifier: z.string().trim().min(4).max(255),
    isDefault: z.boolean().default(false),
  })
  .strict();
const cashPaymentMethodSchema = z
  .object({
    type: z.literal('CASH'),
    provider: z.literal('manual'),
    accountHolderName: z.string().trim().min(1).max(200),
    isDefault: z.boolean().default(false),
  })
  .strict();
export const createFarmerPaymentMethodSchema = z.discriminatedUnion('type', [
  privatePaymentIdentifierSchema,
  cashPaymentMethodSchema,
]);
export const verifyFarmerPaymentMethodSchema = z.object({}).strict();

export const maskedFarmerPaymentMethodSchema = z
  .object({
    id: uuidSchema,
    farmerId: uuidSchema,
    type: farmerPaymentMethodTypeSchema,
    provider: z.string().min(1),
    accountHolderName: z.string().min(1),
    accountIdentifierLast4: z.string().length(4).nullable(),
    status: z.enum(['PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'REVOKED']),
    isDefault: z.boolean(),
    verifiedAt: dateTimeSchema.nullable(),
  })
  .strict();

export const createPaymentInstructionSchema = z
  .object({
    instructionNumber: z.string().trim().min(1).max(80),
    farmerSettlementId: uuidSchema,
    paymentMethodId: uuidSchema,
    provider: paymentProviderSchema,
    idempotencyKey: z.string().trim().min(8).max(255),
    scheduledFor: dateTimeSchema.optional(),
  })
  .strict();
export const paymentInstructionVersionActionSchema = z.object({ version: versionSchema }).strict();
export const paymentInstructionReasonActionSchema = z
  .object({ version: versionSchema, reason: reasonSchema })
  .strict();

export const createManualReconciliationSchema = z
  .object({
    paymentInstructionId: uuidSchema,
    externalReference: z.string().trim().min(1).max(255),
    currency: currencySchema,
    amountMinor: moneyMinorSchema,
    valueDate: dateSchema,
    evidenceMetadata: z.record(z.string(), z.unknown()),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();
export const reviewReconciliationSchema = z
  .object({
    status: z.enum(['CONFIRMED', 'REJECTED']),
    notes: z.string().trim().min(1).max(1000),
  })
  .strict();

export const PHASE_SIX_ERROR_CODES = {
  SALE_PROCEEDS_NOT_ELIGIBLE: 'SALE_PROCEEDS_NOT_ELIGIBLE',
  SALE_PROCEEDS_NOT_VERIFIED: 'SALE_PROCEEDS_NOT_VERIFIED',
  SOURCE_QUANTITY_EXHAUSTED: 'SOURCE_QUANTITY_EXHAUSTED',
  SETTLEMENT_TRANSITION_INVALID: 'SETTLEMENT_TRANSITION_INVALID',
  SETTLEMENT_HAS_BLOCKING_EXCEPTIONS: 'SETTLEMENT_HAS_BLOCKING_EXCEPTIONS',
  SETTLEMENT_TOTAL_MISMATCH: 'SETTLEMENT_TOTAL_MISMATCH',
  SELF_APPROVAL_FORBIDDEN: 'SELF_APPROVAL_FORBIDDEN',
  DEDUCTION_CONSENT_REQUIRED: 'DEDUCTION_CONSENT_REQUIRED',
  EXCHANGE_RATE_REQUIRED: 'EXCHANGE_RATE_REQUIRED',
  EXCHANGE_RATE_NOT_APPLICABLE: 'EXCHANGE_RATE_NOT_APPLICABLE',
  EXCHANGE_RATE_MISMATCH: 'EXCHANGE_RATE_MISMATCH',
  ADVANCE_RECOVERY_EXCEEDS_OUTSTANDING: 'ADVANCE_RECOVERY_EXCEEDS_OUTSTANDING',
  ADVANCE_CURRENCY_MISMATCH: 'ADVANCE_CURRENCY_MISMATCH',
  PAYMENT_METHOD_NOT_VERIFIED: 'PAYMENT_METHOD_NOT_VERIFIED',
  PAYMENT_PROVIDER_NOT_ALLOWED: 'PAYMENT_PROVIDER_NOT_ALLOWED',
  PAYMENT_TRANSITION_INVALID: 'PAYMENT_TRANSITION_INVALID',
  PAYMENT_OUTCOME_UNKNOWN: 'PAYMENT_OUTCOME_UNKNOWN',
  RECONCILIATION_REVIEW_REQUIRED: 'RECONCILIATION_REVIEW_REQUIRED',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
} as const;

export type RecordSaleProceedsInput = z.infer<typeof recordSaleProceedsSchema>;
export type VerifySaleProceedsInput = z.infer<typeof verifySaleProceedsSchema>;
export type ReverseSaleProceedsInput = z.infer<typeof reverseSaleProceedsSchema>;
export type CreateSettlementRunInput = z.infer<typeof createSettlementRunSchema>;
export type RecordExchangeRateInput = z.infer<typeof recordExchangeRateSchema>;
export type IssueFarmerAdvanceInput = z.infer<typeof issueFarmerAdvanceSchema>;
export type SettlementVersionActionInput = z.infer<typeof settlementVersionActionSchema>;
export type SettlementReasonActionInput = z.infer<typeof settlementReasonActionSchema>;
export type CreateDeductionPolicyInput = z.infer<typeof createDeductionPolicySchema>;
export type AddSettlementAdjustmentInput = z.infer<typeof addSettlementAdjustmentSchema>;
export type CreateFarmerPaymentMethodInput = z.infer<typeof createFarmerPaymentMethodSchema>;
export type MaskedFarmerPaymentMethod = z.infer<typeof maskedFarmerPaymentMethodSchema>;
export type CreatePaymentInstructionInput = z.infer<typeof createPaymentInstructionSchema>;
export type PaymentInstructionVersionActionInput = z.infer<
  typeof paymentInstructionVersionActionSchema
>;
export type CreateManualReconciliationInput = z.infer<typeof createManualReconciliationSchema>;
export type ReviewReconciliationInput = z.infer<typeof reviewReconciliationSchema>;
export type SettlementRunStatus = z.infer<typeof settlementRunStatusSchema>;
export type PaymentInstructionStatus = z.infer<typeof paymentInstructionStatusSchema>;
