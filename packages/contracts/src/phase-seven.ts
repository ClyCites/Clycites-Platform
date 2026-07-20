import { z } from 'zod';

const uuidSchema = z.uuid();
const dateSchema = z.iso.date();
const dateTimeSchema = z.iso.datetime();
const optionalOrganizationSchema = z.object({ organizationId: uuidSchema.optional() }).strict();
const evidenceSchema = z.record(z.string().min(1).max(100), z.unknown());

export const pilotReadinessCategorySchema = z.enum([
  'FUNCTIONAL',
  'SECURITY',
  'PRIVACY',
  'DATA_INTEGRITY',
  'OFFLINE',
  'PERFORMANCE',
  'BACKUP_RECOVERY',
  'OBSERVABILITY',
  'OPERATIONAL_SUPPORT',
  'ACCESSIBILITY',
  'LOCALIZATION',
  'LEGAL_REGULATORY',
  'PAYMENT_PROVIDER',
  'HEDERA_ENVIRONMENT',
  'FIELD_EQUIPMENT',
  'TRAINING',
]);
export const pilotReadinessStatusSchema = z.enum([
  'NOT_STARTED',
  'IN_PROGRESS',
  'READY',
  'READY_WITH_RISK',
  'BLOCKED',
  'NOT_APPLICABLE',
]);
export const operationalRiskLevelSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export const incidentCategorySchema = z.enum([
  'SECURITY',
  'PRIVACY',
  'AVAILABILITY',
  'DATA_INTEGRITY',
  'PAYMENT',
  'HEDERA',
  'OFFLINE_SYNC',
  'PERFORMANCE',
  'OTHER',
]);
export const incidentSeveritySchema = z.enum(['SEV1', 'SEV2', 'SEV3', 'SEV4']);
export const incidentStatusSchema = z.enum([
  'OPEN',
  'ACKNOWLEDGED',
  'MITIGATING',
  'MONITORING',
  'RESOLVED',
  'CLOSED',
]);
export const dataSubjectRequestTypeSchema = z.enum([
  'ACCESS',
  'CORRECTION',
  'DELETION',
  'RESTRICTION',
  'CONSENT_WITHDRAWAL',
  'DATA_EXPORT',
]);
export const dataSubjectRequestStatusSchema = z.enum([
  'RECEIVED',
  'IDENTITY_VERIFICATION_REQUIRED',
  'IN_REVIEW',
  'FULFILLED',
  'PARTIALLY_FULFILLED',
  'REJECTED',
  'CANCELLED',
]);
export const retentionDeletionModeSchema = z.enum([
  'DELETE',
  'ANONYMIZE',
  'ARCHIVE',
  'RETAIN_IMMUTABLY',
]);
export const retentionPolicyStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'INACTIVE', 'SUPERSEDED']);
export const featureFlagScopeSchema = z.enum(['PLATFORM', 'ORGANIZATION']);

export const createPilotReadinessGateSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Z][A-Z0-9_]{2,99}$/),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(1000),
    category: pilotReadinessCategorySchema,
    blocking: z.boolean().default(true),
    riskLevel: operationalRiskLevelSchema.default('MEDIUM'),
    ownerUserId: uuidSchema.optional(),
    nextReviewAt: dateTimeSchema.optional(),
    humanReviewRequired: z.boolean().default(false),
  })
  .strict();

export const transitionPilotReadinessGateSchema = z
  .object({
    status: pilotReadinessStatusSchema,
    evidence: evidenceSchema,
    riskNotes: z.string().trim().min(1).max(2000).optional(),
    nextReviewAt: dateTimeSchema.optional(),
  })
  .strict();

export const pilotReadinessSummarySchema = z
  .object({
    ready: z.boolean(),
    blockingGateCount: z.number().int().nonnegative(),
    openBlockingGateCount: z.number().int().nonnegative(),
    gatesByStatus: z.record(pilotReadinessStatusSchema, z.number().int().nonnegative()),
    evaluatedAt: dateTimeSchema,
  })
  .strict();

export const createRetentionPolicySchema = z
  .object({
    organizationId: uuidSchema.optional(),
    dataCategory: z
      .string()
      .trim()
      .regex(/^[A-Z][A-Z0-9_]{2,99}$/),
    retentionDays: z.number().int().positive().max(36_500),
    archiveAfterDays: z.number().int().positive().max(36_500).optional(),
    deletionMode: retentionDeletionModeSchema,
    legalHoldSupported: z.boolean().default(true),
    policyVersion: z.number().int().positive(),
    effectiveFrom: dateSchema,
    effectiveTo: dateSchema.optional(),
  })
  .strict()
  .refine((policy) => !policy.archiveAfterDays || policy.archiveAfterDays <= policy.retentionDays, {
    message: 'Archive period cannot exceed retention period',
    path: ['archiveAfterDays'],
  });

export const retentionPolicyActionSchema = z
  .object({ reason: z.string().trim().min(1).max(1000) })
  .strict();
export const retentionDryRunSchema = optionalOrganizationSchema;

const farmerPrivacySubjectSchema = z
  .object({ subjectType: z.literal('FARMER'), farmerId: uuidSchema })
  .strict();
const userPrivacySubjectSchema = z
  .object({ subjectType: z.literal('USER'), userId: uuidSchema })
  .strict();
export const createDataSubjectRequestSchema = z.intersection(
  z.discriminatedUnion('subjectType', [farmerPrivacySubjectSchema, userPrivacySubjectSchema]),
  z
    .object({
      organizationId: uuidSchema.optional(),
      requestType: dataSubjectRequestTypeSchema,
      notes: z.string().trim().max(2000).optional(),
    })
    .strict(),
);
export const updateDataSubjectRequestSchema = z
  .object({
    status: dataSubjectRequestStatusSchema,
    assignedToUserId: uuidSchema.optional(),
    identityVerified: z.boolean().optional(),
    rejectionReason: z.string().trim().min(1).max(1000).optional(),
    responseDocumentKey: z.string().trim().min(1).max(500).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict()
  .refine((input) => input.status !== 'REJECTED' || Boolean(input.rejectionReason), {
    message: 'Rejected requests require a reason',
    path: ['rejectionReason'],
  });

export const createOperationalIncidentSchema = z
  .object({
    organizationId: uuidSchema.optional(),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(4000),
    category: incidentCategorySchema,
    severity: incidentSeveritySchema,
    restricted: z.boolean().default(false),
    detectedAt: dateTimeSchema,
    ownerUserId: uuidSchema.optional(),
    impactSummary: z.string().trim().max(2000).optional(),
    externalReference: z.string().trim().max(255).optional(),
  })
  .strict();
export const updateOperationalIncidentSchema = z
  .object({
    status: incidentStatusSchema,
    ownerUserId: uuidSchema.optional(),
    impactSummary: z.string().trim().max(2000).optional(),
    rootCauseSummary: z.string().trim().max(2000).optional(),
    resolutionSummary: z.string().trim().max(2000).optional(),
  })
  .strict()
  .refine(
    (input) => !['RESOLVED', 'CLOSED'].includes(input.status) || Boolean(input.resolutionSummary),
    { message: 'Resolved incidents require a resolution summary', path: ['resolutionSummary'] },
  );

export const recordBackupVerificationSchema = z
  .object({
    backupType: z.string().trim().min(1).max(80),
    environment: z.string().trim().min(1).max(40),
    backupReference: z.string().trim().min(1).max(255),
    startedAt: dateTimeSchema,
    completedAt: dateTimeSchema.optional(),
    status: z.enum(['STARTED', 'COMPLETED', 'FAILED', 'VERIFIED']),
    sizeBytes: z.string().regex(/^\d+$/).optional(),
    encrypted: z.boolean().default(false),
    retentionUntil: dateTimeSchema.optional(),
    restoreTestedAt: dateTimeSchema.optional(),
    restoreStatus: z.enum(['NOT_TESTED', 'PASSED', 'FAILED']).optional(),
    recoveryPointObjectiveMet: z.boolean().optional(),
    recoveryTimeObjectiveMet: z.boolean().optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict()
  .refine((input) => Boolean(input.restoreTestedAt) === Boolean(input.restoreStatus), {
    message: 'Restore test time and status must be provided together',
    path: ['restoreStatus'],
  });

export const setFeatureFlagSchema = z
  .object({
    key: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9.-]{2,99}$/),
    scope: featureFlagScopeSchema,
    organizationId: uuidSchema.optional(),
    enabled: z.boolean(),
    highRisk: z.boolean().default(false),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict()
  .refine(
    (flag) =>
      (flag.scope === 'PLATFORM' && !flag.organizationId) ||
      (flag.scope === 'ORGANIZATION' && Boolean(flag.organizationId)),
    { message: 'Organization scope requires an organization ID', path: ['organizationId'] },
  );

export const PHASE_SEVEN_ERROR_CODES = {
  PILOT_GATE_TRANSITION_INVALID: 'PILOT_GATE_TRANSITION_INVALID',
  PILOT_BLOCKING_GATES_OPEN: 'PILOT_BLOCKING_GATES_OPEN',
  HUMAN_REVIEW_REQUIRED: 'HUMAN_REVIEW_REQUIRED',
  RETENTION_POLICY_CONFLICT: 'RETENTION_POLICY_CONFLICT',
  DESTRUCTIVE_RETENTION_DISABLED: 'DESTRUCTIVE_RETENTION_DISABLED',
  DATA_SUBJECT_INVALID: 'DATA_SUBJECT_INVALID',
  PRIVACY_REQUEST_TRANSITION_INVALID: 'PRIVACY_REQUEST_TRANSITION_INVALID',
  INCIDENT_TRANSITION_INVALID: 'INCIDENT_TRANSITION_INVALID',
  BACKUP_EVIDENCE_INVALID: 'BACKUP_EVIDENCE_INVALID',
  FEATURE_FLAG_SCOPE_INVALID: 'FEATURE_FLAG_SCOPE_INVALID',
  PROVIDER_DISABLED: 'PROVIDER_DISABLED',
} as const;

export type CreatePilotReadinessGateInput = z.infer<typeof createPilotReadinessGateSchema>;
export type TransitionPilotReadinessGateInput = z.infer<typeof transitionPilotReadinessGateSchema>;
export type PilotReadinessSummary = z.infer<typeof pilotReadinessSummarySchema>;
export type CreateRetentionPolicyInput = z.infer<typeof createRetentionPolicySchema>;
export type CreateDataSubjectRequestInput = z.infer<typeof createDataSubjectRequestSchema>;
export type UpdateDataSubjectRequestInput = z.infer<typeof updateDataSubjectRequestSchema>;
export type CreateOperationalIncidentInput = z.infer<typeof createOperationalIncidentSchema>;
export type UpdateOperationalIncidentInput = z.infer<typeof updateOperationalIncidentSchema>;
export type RecordBackupVerificationInput = z.infer<typeof recordBackupVerificationSchema>;
export type SetFeatureFlagInput = z.infer<typeof setFeatureFlagSchema>;
