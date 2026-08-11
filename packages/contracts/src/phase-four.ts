import { z } from 'zod';

const sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const privacyReferenceSchema = z.string().regex(/^hmac-sha256:[A-Za-z0-9._-]+:[a-f0-9]{64}$/);
const largeIntegerSchema = z.string().regex(/^\d+$/);

export const anchorEventTypeSchema = z.enum([
  'DELIVERY_ACCEPTED',
  'DELIVERY_CORRECTED',
  'RECEIPT_ISSUED',
  'BATCH_CREATED',
  'DELIVERY_ADDED_TO_BATCH',
  'BATCH_SEALED',
  'BATCH_SPLIT',
  'BATCH_MERGED',
  'TRANSFORMATION_COMPLETED',
  'TRANSFORMATION_SUPERSEDED',
  'LOT_CREATED',
  'BATCH_ADDED_TO_LOT',
  'LOT_SEALED',
  'LOT_QUALITY_APPROVED',
  'CUSTODY_TRANSFER_CONFIRMED',
  'TRACEABILITY_RECORD_CORRECTED',
  'TRACEABILITY_RECORD_SUPERSEDED',
  'MARKETPLACE_LISTING_PUBLISHED',
  'OFFER_ACCEPTED',
  'SALES_CONTRACT_ACTIVATED',
  'ORDER_DISPATCHED',
  'ORDER_RECEIVED',
  'BUYER_ACCEPTANCE_RECORDED',
  'SALES_ORDER_COMPLETED',
  'SETTLEMENT_APPROVED',
  'FARMER_STATEMENT_ISSUED',
  'PAYMENT_CONFIRMED',
]);

export const anchorEntityTypeSchema = z.enum([
  'DELIVERY',
  'RECEIPT',
  'BATCH',
  'TRANSFORMATION',
  'LOT',
  'QUALITY_INSPECTION',
  'CUSTODY_TRANSFER',
  'TRACEABILITY_RECORD',
  'MARKETPLACE_LISTING',
  'OFFER',
  'SALES_CONTRACT',
  'SALES_ORDER',
  'BUYER_ACCEPTANCE',
  'SETTLEMENT',
  'FARMER_STATEMENT',
  'PAYMENT_RECONCILIATION',
]);

export const hederaProviderSchema = z.enum(['MOCK', 'SDK']);
export const hederaNetworkSchema = z.enum(['LOCAL', 'TESTNET', 'PREVIEWNET', 'MAINNET']);

export const anchorStatusSchema = z.enum([
  'PENDING',
  'QUEUED',
  'SUBMITTING',
  'SUBMITTED',
  'CONFIRMING',
  'CONFIRMED',
  'RETRYABLE_FAILURE',
  'PERMANENT_FAILURE',
  'MISMATCH',
  'SUPERSEDED',
  'CANCELLED',
]);

export const anchorAttemptOperationSchema = z.enum(['SUBMIT', 'CONFIRM', 'VERIFY', 'RECONCILE']);
export const anchorAttemptStatusSchema = z.enum([
  'STARTED',
  'SUCCEEDED',
  'FAILED',
  'TIMED_OUT',
  'UNKNOWN',
]);
export const anchorVerificationTypeSchema = z.enum([
  'AUTOMATIC',
  'MANUAL_PRIVATE',
  'MANUAL_PUBLIC',
  'RECONCILIATION',
]);
export const anchorVerificationStatusSchema = z.enum([
  'VERIFIED',
  'PENDING',
  'NOT_CONFIRMED',
  'MISMATCH',
  'MISSING',
  'SUPERSEDED',
  'ERROR',
]);
export const anchorChainStatusSchema = z.enum(['VALID', 'BROKEN', 'NOT_APPLICABLE', 'UNKNOWN']);
export const traceabilityVerificationStatusSchema = z.enum([
  'NOT_ANCHORED',
  'ANCHOR_PENDING',
  'ANCHOR_SUBMITTED',
  'ANCHOR_CONFIRMED',
  'VERIFIED',
  'PARTIALLY_VERIFIED',
  'MISMATCH',
  'CHAIN_BROKEN',
  'SUPERSEDED',
  'VERIFICATION_UNAVAILABLE',
  'FAILED',
]);

export const anchorMessageSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    anchorEventId: z.uuid(),
    eventType: anchorEventTypeSchema,
    organizationRef: privacyReferenceSchema,
    entityType: anchorEntityTypeSchema,
    entityRef: privacyReferenceSchema,
    payloadHash: sha256Schema,
    previousEventHash: sha256Schema.nullable(),
    occurredAt: z.iso.datetime(),
    supersedesAnchorRef: privacyReferenceSchema.nullable().optional(),
    // A privacy reference is keyed with a secret the public does not hold, so it cannot be used by
    // an outside verifier to find the message being withdrawn. These two fields are the public
    // handles for that message: both appear verbatim on the topic and in the mirror node.
    supersedesPayloadHash: sha256Schema.nullable().optional(),
    supersedesTransactionId: z.string().min(1).max(256).nullable().optional(),
  })
  .strict();

export const submissionResultSchema = z
  .object({
    provider: hederaProviderSchema,
    network: hederaNetworkSchema,
    topicId: z.string().min(1),
    transactionId: z.string().min(1),
    transactionHash: z.string().min(1).nullable(),
    submittedAt: z.iso.datetime(),
  })
  .strict();

export const mirrorConfirmationSchema = z
  .object({
    provider: hederaProviderSchema,
    network: hederaNetworkSchema,
    topicId: z.string().min(1),
    sequenceNumber: largeIntegerSchema,
    consensusTimestamp: z.string().min(1),
    transactionId: z.string().min(1).nullable(),
    message: anchorMessageSchema,
    runningHash: z.string().min(1).nullable(),
    runningHashVersion: largeIntegerSchema.nullable(),
  })
  .strict();

export const anchorAttemptSchema = z
  .object({
    id: z.uuid(),
    anchorId: z.uuid(),
    attemptNumber: z.number().int().positive(),
    operation: anchorAttemptOperationSchema,
    status: anchorAttemptStatusSchema,
    provider: hederaProviderSchema,
    network: hederaNetworkSchema,
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
    transactionId: z.string().nullable(),
    errorCode: z.string().nullable(),
    errorCategory: z.string().nullable(),
    errorMessage: z.string().nullable(),
    retryAt: z.iso.datetime().nullable(),
    metadata: z.record(z.string(), z.unknown()),
  })
  .strict();

export const anchorDetailSchema = z
  .object({
    id: z.uuid(),
    anchorEventId: z.uuid(),
    traceabilityEventId: z.uuid().nullable(),
    organizationId: z.uuid(),
    entityType: anchorEntityTypeSchema,
    entityId: z.uuid(),
    eventType: anchorEventTypeSchema,
    schemaVersion: z.string().min(1),
    canonicalPayloadHash: sha256Schema,
    calculatedPayloadHash: sha256Schema.nullable(),
    mirrorPayloadHash: sha256Schema.nullable(),
    previousEventHash: sha256Schema.nullable(),
    privacyReferenceVersion: z.string().min(1),
    provider: hederaProviderSchema,
    network: hederaNetworkSchema,
    topicId: z.string().nullable(),
    status: anchorStatusSchema,
    submissionTransactionId: z.string().nullable(),
    submissionTransactionHash: z.string().nullable(),
    topicSequenceNumber: largeIntegerSchema.nullable(),
    consensusTimestamp: z.string().nullable(),
    runningHash: z.string().nullable(),
    runningHashVersion: largeIntegerSchema.nullable(),
    submittedAt: z.iso.datetime().nullable(),
    confirmedAt: z.iso.datetime().nullable(),
    supersedesAnchorId: z.uuid().nullable(),
    supersededByAnchorId: z.uuid().nullable(),
    lastErrorCode: z.string().nullable(),
    lastErrorMessage: z.string().nullable(),
    chainStatus: anchorChainStatusSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const anchorListQuerySchema = z
  .object({
    status: anchorStatusSchema.optional(),
    eventType: anchorEventTypeSchema.optional(),
    entityType: anchorEntityTypeSchema.optional(),
    search: z.string().trim().max(200).optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(25),
  })
  .strict();

export const anchorListSchema = z
  .object({
    items: z.array(anchorDetailSchema),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .strict();

export const organizationVerificationDashboardSchema = z
  .object({
    confirmedCount: z.number().int().nonnegative(),
    pendingCount: z.number().int().nonnegative(),
    submittedCount: z.number().int().nonnegative(),
    retryableFailureCount: z.number().int().nonnegative(),
    permanentFailureCount: z.number().int().nonnegative(),
    mismatchCount: z.number().int().nonnegative(),
    supersededCount: z.number().int().nonnegative(),
    lastSuccessfulConfirmation: z.iso.datetime().nullable(),
    lastReconciliation: z.iso.datetime().nullable(),
    provider: hederaProviderSchema,
    network: hederaNetworkSchema,
    submissionEnabled: z.boolean(),
    confirmationEnabled: z.boolean(),
  })
  .strict();

export const verificationResultSchema = z
  .object({
    anchorId: z.uuid(),
    status: anchorVerificationStatusSchema,
    overallStatus: traceabilityVerificationStatusSchema,
    calculatedPayloadHash: sha256Schema,
    expectedPayloadHash: sha256Schema,
    mirrorPayloadHash: sha256Schema.nullable(),
    chainStatus: anchorChainStatusSchema,
    verifiedAt: z.iso.datetime(),
  })
  .strict();

export const entityVerificationSummarySchema = z
  .object({
    entityType: anchorEntityTypeSchema,
    entityId: z.uuid(),
    status: traceabilityVerificationStatusSchema,
    eligibleEventCount: z.number().int().nonnegative(),
    confirmedAnchorCount: z.number().int().nonnegative(),
    pendingAnchorCount: z.number().int().nonnegative(),
    mismatchCount: z.number().int().nonnegative(),
    supersededAnchorCount: z.number().int().nonnegative(),
    chainStatus: anchorChainStatusSchema,
    lastVerifiedAt: z.iso.datetime().nullable(),
  })
  .strict();

export const reconciliationSummarySchema = z
  .object({
    provider: hederaProviderSchema,
    network: hederaNetworkSchema,
    topicId: z.string().nullable(),
    checkedMessageCount: z.number().int().nonnegative(),
    confirmedAnchorCount: z.number().int().nonnegative(),
    unknownMessageCount: z.number().int().nonnegative(),
    mismatchCount: z.number().int().nonnegative(),
    checkpointSequenceNumber: largeIntegerSchema.nullable(),
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime(),
  })
  .strict();

export const hederaSystemStatusSchema = z
  .object({
    provider: hederaProviderSchema,
    network: hederaNetworkSchema,
    configured: z.boolean(),
    submissionEnabled: z.boolean(),
    confirmationEnabled: z.boolean(),
    topicId: z.string().nullable(),
    operatorAccountId: z.string().nullable(),
    mirrorNodeReachable: z.boolean().nullable(),
    lastSuccessfulSubmission: z.iso.datetime().nullable(),
    lastSuccessfulConfirmation: z.iso.datetime().nullable(),
    degradedReasonCode: z.string().nullable(),
  })
  .strict();

/**
 * A message on the public topic, described only by coordinates a stranger can check for themselves.
 * It carries no organization or entity identifier, because it is served without authentication.
 */
export const publicAnchorPointerSchema = z
  .object({
    transactionReference: z.string().nullable(),
    payloadHash: sha256Schema,
    topicId: z.string().nullable(),
    topicSequenceNumber: largeIntegerSchema.nullable(),
    consensusTimestamp: z.string().nullable(),
    mirrorNodeUrl: z.url().nullable(),
  })
  .strict();

export const publicAnchorStatusSchema = z
  .object({
    status: z.enum(['CURRENT', 'SUPERSEDED', 'NOT_CONFIRMED']),
    provider: hederaProviderSchema,
    network: hederaNetworkSchema,
    topicId: z.string().nullable(),
    topicSequenceNumber: largeIntegerSchema.nullable(),
    consensusTimestamp: z.string().nullable(),
    transactionReference: z.string().nullable(),
    payloadHash: sha256Schema,
    mirrorNodeUrl: z.url().nullable(),
    supersedes: publicAnchorPointerSchema.nullable(),
    supersededBy: publicAnchorPointerSchema.nullable(),
    explanation: z.string().min(1),
    limitation: z.string().min(1),
  })
  .strict();

export const publicLedgerVerificationSummarySchema = z
  .object({
    status: traceabilityVerificationStatusSchema,
    provider: hederaProviderSchema.nullable(),
    network: hederaNetworkSchema.nullable(),
    topicId: z.string().nullable(),
    topicSequenceNumber: largeIntegerSchema.nullable(),
    consensusTimestamp: z.string().nullable(),
    transactionReference: z.string().nullable(),
    payloadHash: sha256Schema.nullable(),
    mirrorNodeUrl: z.url().nullable(),
    eligibleLineageEventCount: z.number().int().nonnegative(),
    confirmedLineageAnchorCount: z.number().int().nonnegative(),
    pendingAnchorCount: z.number().int().nonnegative(),
    mismatchCount: z.number().int().nonnegative(),
    correctionStatus: z.enum(['CURRENT', 'CORRECTION_PENDING', 'SUPERSEDED']),
    supersededBy: publicAnchorPointerSchema.nullable(),
    lastVerifiedAt: z.iso.datetime().nullable(),
    explanation: z.string().min(1),
    limitation: z.string().min(1),
  })
  .strict();

export const retryAnchorCommandSchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();
export const reconciliationCommandSchema = z
  .object({ limit: z.number().int().positive().max(500).default(100) })
  .strict();

export const HEDERA_ERROR_CODES = [
  'HEDERA_NOT_CONFIGURED',
  'HEDERA_SUBMISSION_DISABLED',
  'HEDERA_CONFIRMATION_DISABLED',
  'HEDERA_CREDENTIALS_INVALID',
  'HEDERA_TOPIC_NOT_CONFIGURED',
  'HEDERA_TOPIC_INVALID',
  'HEDERA_MESSAGE_TOO_LARGE',
  'HEDERA_TRANSACTION_FEE_LIMIT_EXCEEDED',
  'HEDERA_SUBMISSION_RETRYABLE',
  'HEDERA_SUBMISSION_PERMANENT_FAILURE',
  'HEDERA_SUBMISSION_OUTCOME_UNKNOWN',
  'HEDERA_MIRROR_NODE_UNAVAILABLE',
  'HEDERA_CONFIRMATION_PENDING',
  'HEDERA_CONFIRMATION_TIMEOUT',
  'HEDERA_MESSAGE_NOT_FOUND',
  'HEDERA_MESSAGE_SCHEMA_INVALID',
  'HEDERA_MESSAGE_MISMATCH',
  'ANCHOR_NOT_ELIGIBLE',
  'ANCHOR_ALREADY_CONFIRMED',
  'ANCHOR_RETRY_NOT_ALLOWED',
  'ANCHOR_PAYLOAD_MISMATCH',
  'ANCHOR_CHAIN_BROKEN',
  'ANCHOR_SUPERSEDED',
  'ANCHOR_VERSION_CONFLICT',
  'RECONCILIATION_ALREADY_RUNNING',
  'RECONCILIATION_LIMIT_EXCEEDED',
] as const;

export const hederaErrorCodeSchema = z.enum(HEDERA_ERROR_CODES);

export type AnchorMessage = z.infer<typeof anchorMessageSchema>;
export type AnchorDetail = z.infer<typeof anchorDetailSchema>;
export type AnchorAttempt = z.infer<typeof anchorAttemptSchema>;
export type AnchorListQuery = z.infer<typeof anchorListQuerySchema>;
export type AnchorList = z.infer<typeof anchorListSchema>;
export type OrganizationVerificationDashboard = z.infer<
  typeof organizationVerificationDashboardSchema
>;
export type SubmissionResult = z.infer<typeof submissionResultSchema>;
export type MirrorConfirmation = z.infer<typeof mirrorConfirmationSchema>;
export type VerificationResult = z.infer<typeof verificationResultSchema>;
export type EntityVerificationSummary = z.infer<typeof entityVerificationSummarySchema>;
export type ReconciliationSummary = z.infer<typeof reconciliationSummarySchema>;
export type HederaSystemStatus = z.infer<typeof hederaSystemStatusSchema>;
export type PublicLedgerVerificationSummary = z.infer<typeof publicLedgerVerificationSummarySchema>;
export type PublicAnchorPointer = z.infer<typeof publicAnchorPointerSchema>;
export type PublicAnchorStatus = z.infer<typeof publicAnchorStatusSchema>;
