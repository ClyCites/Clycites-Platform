import { z } from 'zod';

const uuid = z.uuid();
const date = z.iso.date();
const timestamp = z.iso.datetime();
const shortText = z.string().trim().min(1).max(200);
const notes = z.string().trim().min(1).max(2000);
const evidence = z.record(z.string().min(1).max(100), z.unknown());

export const pilotStatusSchema = z.enum([
  'DRAFT',
  'READINESS_REVIEW',
  'BLOCKED',
  'APPROVED_FOR_ONBOARDING',
  'ONBOARDING',
  'TRAINING',
  'BASELINE_COLLECTION',
  'SUPERVISED_LIVE_USE',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'EVALUATING',
  'GO',
  'CONDITIONAL_GO',
  'NO_GO',
  'CLOSED',
]);
export const pilotPaymentModeSchema = z.enum(['MOCK', 'MANUAL_RECONCILIATION', 'SANDBOX_PROVIDER']);
export const pilotHederaModeSchema = z.enum(['MOCK', 'TESTNET', 'DISABLED']);
export const pilotParticipantTypeSchema = z.enum([
  'FARMER',
  'COLLECTION_AGENT',
  'COOPERATIVE_ADMIN',
  'FINANCE_OFFICER',
  'QUALITY_INSPECTOR',
  'BUYER_USER',
  'SUPPORT_USER',
  'OBSERVER',
]);
export const pilotParticipantStatusSchema = z.enum([
  'INVITED',
  'ENROLLED',
  'ACTIVE',
  'SUSPENDED',
  'WITHDRAWN',
  'COMPLETED',
]);

const pilotInputBaseSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Z][A-Z0-9_-]{2,79}$/),
    name: shortText,
    organizationId: uuid,
    crop: z.literal('COFFEE'),
    region: z.string().trim().min(1).max(120),
    district: z.string().trim().min(1).max(120),
    plannedStartDate: date,
    plannedEndDate: date,
    targetFarmerCount: z.number().int().min(1).max(100_000),
    targetAgentCount: z.number().int().min(1).max(10_000),
    targetCollectionPointCount: z.number().int().min(1).max(1_000),
    targetBuyerCount: z.number().int().min(0).max(10_000),
    paymentMode: pilotPaymentModeSchema,
    hederaMode: pilotHederaModeSchema,
    smsMode: z.enum(['DISABLED', 'MOCK', 'CONSOLE', 'SANDBOX']),
    supportModel: z.string().trim().min(1).max(1000),
  })
  .strict();

export const createPilotSchema = pilotInputBaseSchema.refine(
  (input) => input.plannedEndDate >= input.plannedStartDate,
  {
    path: ['plannedEndDate'],
    message: 'Pilot end date must be on or after the start date',
  },
);

export const updatePilotSchema = pilotInputBaseSchema
  .omit({ code: true, organizationId: true })
  .partial()
  .extend({ version: z.number().int().positive() })
  .strict();

export const pilotTransitionActionSchema = z.enum([
  'SUBMIT_READINESS_REVIEW',
  'APPROVE_ONBOARDING',
  'START_ONBOARDING',
  'START_TRAINING',
  'START_BASELINE',
  'START_SUPERVISED_USE',
  'ACTIVATE',
  'PAUSE',
  'RESUME',
  'COMPLETE',
  'START_EVALUATION',
  'CLOSE',
]);
export const transitionPilotSchema = z
  .object({
    action: pilotTransitionActionSchema,
    version: z.number().int().positive(),
    reason: notes.optional(),
    evidence,
  })
  .strict()
  .refine((input) => input.action !== 'PAUSE' || Boolean(input.reason), {
    path: ['reason'],
    message: 'Pausing a pilot requires a reason',
  });

export const pilotConfigurationSchema = z
  .object({
    allowedCommodityFormIds: z.array(uuid).max(20),
    enabledFeatureFlags: z.array(z.string().regex(/^[a-z][a-z0-9.-]{2,99}$/)).max(100),
    languages: z
      .array(z.enum(['en-UG', 'lg-UG']))
      .min(1)
      .max(2),
    supportHours: z.record(z.string().max(20), z.string().max(100)),
    baselinePeriodStart: date,
    baselinePeriodEnd: date,
    activeUsePeriodStart: date,
    activeUsePeriodEnd: date,
    evaluationPeriodStart: date,
    evaluationPeriodEnd: date,
    dataRetentionPolicyId: uuid.optional(),
    offlineSnapshotLimit: z.number().int().min(1).max(5000),
    maxSynchronizationBatch: z.number().int().min(1).max(500),
    incidentContacts: z.array(z.object({ role: shortText, userId: uuid }).strict()).max(20),
    escalationPolicy: evidence,
  })
  .strict();

const farmerParticipantSchema = z
  .object({
    participantType: z.literal('FARMER'),
    farmerId: uuid,
    collectionPointId: uuid.optional(),
    consentVerifiedAt: timestamp,
    trainingRequired: z.boolean().default(false),
  })
  .strict();
const userParticipantSchema = z
  .object({
    participantType: pilotParticipantTypeSchema.exclude(['FARMER']),
    userId: uuid,
    organizationId: uuid.optional(),
    collectionPointId: uuid.optional(),
    trainingRequired: z.boolean().default(true),
  })
  .strict();
export const enrollPilotParticipantSchema = z.discriminatedUnion('participantType', [
  farmerParticipantSchema,
  userParticipantSchema,
]);
export const updatePilotParticipantSchema = z
  .object({ status: z.enum(['ENROLLED', 'ACTIVE', 'SUSPENDED', 'COMPLETED']) })
  .strict();
export const withdrawPilotParticipantSchema = z.object({ reason: notes }).strict();

export const assignPilotCollectionPointSchema = z
  .object({ collectionPointId: uuid, readinessNotes: notes.optional() })
  .strict();
export const assignPilotDeviceSchema = z
  .object({
    deviceId: uuid,
    assignedUserId: uuid,
    collectionPointId: uuid,
    conditionNotes: notes.optional(),
  })
  .strict();
export const updatePilotDeviceStatusSchema = z
  .object({
    status: z.enum(['ACTIVE', 'LOST', 'DAMAGED', 'RETURNED', 'REVOKED']),
    conditionNotes: notes.optional(),
  })
  .strict();

export const createTrainingModuleSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Z][A-Z0-9_]{2,99}$/),
    title: shortText,
    description: notes,
    audience: pilotParticipantTypeSchema,
    language: z.enum(['en-UG', 'lg-UG']),
    version: z.number().int().positive(),
    contentReference: z.string().trim().min(1).max(500),
    estimatedMinutes: z.number().int().min(1).max(1440),
    requiresAssessment: z.boolean(),
    passingScore: z.number().int().min(1).max(100).optional(),
    reviewed: z.boolean().default(false),
  })
  .strict()
  .refine((input) => input.requiresAssessment === Boolean(input.passingScore), {
    path: ['passingScore'],
    message: 'Assessment modules require a passing score',
  });
export const assignTrainingSchema = z
  .object({ participantId: uuid, trainingModuleId: uuid })
  .strict();
export const completeTrainingSchema = z
  .object({ score: z.number().int().min(0).max(100).optional(), notes: notes.optional() })
  .strict();
export const waiveTrainingSchema = z.object({ reason: notes }).strict();

export const createPilotFarmerImportSchema = z
  .object({
    filename: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .refine((value) => value.toLowerCase().endsWith('.csv'), 'CSV file required'),
    contentType: z.enum(['text/csv', 'application/csv', 'application/vnd.ms-excel']),
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(10 * 1024 * 1024),
    checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict();
export const confirmPilotFarmerImportUploadSchema = z
  .object({ checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/) })
  .strict();
export const confirmPilotFarmerImportSchema = z
  .object({
    expectedRowCount: z.number().int().positive().max(100_000),
    acknowledgedDuplicateReview: z.literal(true),
  })
  .strict();

const metricBase = z.object({
  metricCode: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{2,119}$/),
  metricVersion: z.number().int().positive(),
  unit: z.string().trim().max(80).optional(),
});
export const pilotMetricValueSchema = z.discriminatedUnion('valueType', [
  metricBase
    .extend({
      valueType: z.literal('DECIMAL'),
      decimalValue: z.string().regex(/^-?\d{1,14}(?:\.\d{1,6})?$/),
    })
    .strict(),
  metricBase.extend({ valueType: z.literal('INTEGER'), integerValue: z.number().int() }).strict(),
  metricBase
    .extend({ valueType: z.literal('TEXT'), textValue: z.string().trim().min(1).max(1000) })
    .strict(),
]);
export const recordPilotBaselineSchema = z.intersection(
  pilotMetricValueSchema,
  z.object({
    measurementPeriodStart: timestamp,
    measurementPeriodEnd: timestamp,
    source: z.string().trim().min(1).max(500),
    evidenceReference: z.string().trim().min(1).max(500).optional(),
  }),
);
export const reviewMetricObservationSchema = z
  .object({ status: z.enum(['VERIFIED', 'QUESTIONED', 'REJECTED']), notes: notes.optional() })
  .strict();
export const verifyPilotBaselineSchema = z.object({ verificationNote: notes.optional() }).strict();
export const recalculatePilotMetricsSchema = z
  .object({
    periodStart: timestamp,
    periodEnd: timestamp,
    metricCodes: z.array(metricBase.shape.metricCode).max(100).optional(),
  })
  .strict()
  .refine((input) => new Date(input.periodEnd) > new Date(input.periodStart), {
    path: ['periodEnd'],
    message: 'Metric period end must be after its start',
  });

export const pilotFeedbackCategorySchema = z.enum([
  'USABILITY',
  'OFFLINE_SYNC',
  'RECEIPT',
  'WEIGHT_OR_QUALITY',
  'TRACEABILITY',
  'MARKETPLACE',
  'SETTLEMENT',
  'PAYMENT',
  'TRAINING',
  'SUPPORT',
  'PRIVACY',
  'OTHER',
]);
export const submitPublicPilotFeedbackSchema = z
  .object({
    respondentType: pilotParticipantTypeSchema,
    category: pilotFeedbackCategorySchema,
    rating: z.number().int().min(1).max(5).optional(),
    message: z.string().trim().min(1).max(2000).optional(),
    language: z.enum(['en-UG', 'lg-UG']),
    channel: z.enum(['SELF_SERVICE', 'ASSISTED']),
    anonymous: z.boolean().default(true),
    consentToContact: z.boolean().default(false),
  })
  .strict()
  .refine((input) => Boolean(input.rating) || Boolean(input.message), 'Provide a rating or message')
  .refine((input) => !input.anonymous || !input.consentToContact, {
    path: ['consentToContact'],
    message: 'Anonymous feedback cannot request follow-up',
  });
export const triagePilotFeedbackSchema = z
  .object({
    status: z.enum(['TRIAGED', 'IN_REVIEW']),
    assignedToUserId: uuid.optional(),
  })
  .strict();
export const resolvePilotFeedbackSchema = z.object({ resolution: notes }).strict();

export const createSupportCaseSchema = z
  .object({
    pilotId: uuid,
    participantId: uuid.optional(),
    category: z
      .string()
      .trim()
      .regex(/^[A-Z][A-Z0-9_]{2,79}$/),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
    title: shortText,
    description: z.string().trim().min(1).max(4000),
    relatedEntityType: z.string().trim().max(80).optional(),
    relatedEntityId: uuid.optional(),
  })
  .strict();
export const updateSupportCaseSchema = z
  .object({
    status: z.enum(['TRIAGED', 'IN_PROGRESS', 'WAITING_FOR_PARTICIPANT', 'WAITING_FOR_PROVIDER']),
    assignedToUserId: uuid.optional(),
  })
  .strict();
export const resolveSupportCaseSchema = z
  .object({
    resolutionCode: z
      .string()
      .trim()
      .regex(/^[A-Z][A-Z0-9_]{2,79}$/),
    summary: notes,
  })
  .strict();
export const escalateSupportCaseSchema = z
  .object({
    category: z.enum([
      'SECURITY',
      'PRIVACY',
      'AVAILABILITY',
      'DATA_INTEGRITY',
      'PAYMENT',
      'HEDERA',
      'OFFLINE_SYNC',
      'PERFORMANCE',
      'OTHER',
    ]),
    severity: z.enum(['SEV1', 'SEV2', 'SEV3', 'SEV4']),
    impactSummary: z.string().trim().min(1).max(2000),
    restricted: z.boolean().default(false),
  })
  .strict();

export const pilotDecisionSchema = z.enum([
  'GO',
  'CONDITIONAL_GO',
  'EXTEND_PILOT',
  'PAUSE',
  'NO_GO',
]);
export const createPilotDecisionSchema = z
  .object({
    decision: pilotDecisionSchema,
    summary: z.string().trim().min(1).max(4000),
    evidenceSnapshotHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    strengths: z.array(shortText).max(50),
    risks: z.array(shortText).max(50),
    blockingIssues: z.array(shortText).max(50),
    conditions: z.array(shortText).max(50),
    nextReviewAt: timestamp.optional(),
  })
  .strict();
export const approvePilotDecisionSchema = z
  .object({
    decisionVersion: z.number().int().positive(),
    evidenceSnapshotHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    approvalNote: notes,
  })
  .strict();

export const preflightCheckSchema = z.object({
  code: z.string(),
  status: z.enum(['PASS', 'WARN', 'FAIL', 'NOT_MEASURED']),
  blocking: z.boolean(),
  message: z.string(),
});
export const pilotPreflightResultSchema = z.object({
  pilotId: uuid,
  passed: z.boolean(),
  generatedAt: timestamp,
  checks: z.array(preflightCheckSchema),
});

export const PHASE_EIGHT_ERROR_CODES = {
  PILOT_NOT_FOUND: 'PILOT_NOT_FOUND',
  PILOT_INVALID_STATE_TRANSITION: 'PILOT_INVALID_STATE_TRANSITION',
  PILOT_BLOCKING_READINESS_GATES: 'PILOT_BLOCKING_READINESS_GATES',
  PILOT_ALREADY_ACTIVE: 'PILOT_ALREADY_ACTIVE',
  PILOT_OVERLAPPING_SCOPE: 'PILOT_OVERLAPPING_SCOPE',
  PILOT_APPROVAL_REQUIRED: 'PILOT_APPROVAL_REQUIRED',
  PILOT_PARTICIPANT_ALREADY_ENROLLED: 'PILOT_PARTICIPANT_ALREADY_ENROLLED',
  PILOT_PARTICIPANT_NOT_ELIGIBLE: 'PILOT_PARTICIPANT_NOT_ELIGIBLE',
  TRAINING_REQUIRED: 'TRAINING_REQUIRED',
  TRAINING_PASSING_SCORE_NOT_MET: 'TRAINING_PASSING_SCORE_NOT_MET',
  FARMER_IMPORT_INVALID_FILE: 'FARMER_IMPORT_INVALID_FILE',
  FARMER_IMPORT_DUPLICATE_REVIEW_REQUIRED: 'FARMER_IMPORT_DUPLICATE_REVIEW_REQUIRED',
  BASELINE_REQUIRED: 'BASELINE_REQUIRED',
  METRIC_DATA_QUALITY_INSUFFICIENT: 'METRIC_DATA_QUALITY_INSUFFICIENT',
  SUPPORT_CASE_INVALID_STATE_TRANSITION: 'SUPPORT_CASE_INVALID_STATE_TRANSITION',
  PILOT_PREFLIGHT_FAILED: 'PILOT_PREFLIGHT_FAILED',
  PILOT_DECISION_EVIDENCE_INCOMPLETE: 'PILOT_DECISION_EVIDENCE_INCOMPLETE',
  PILOT_DECISION_APPROVAL_REQUIRED: 'PILOT_DECISION_APPROVAL_REQUIRED',
  PILOT_NON_WAIVABLE_BLOCKER: 'PILOT_NON_WAIVABLE_BLOCKER',
} as const;

export type CreatePilotInput = z.infer<typeof createPilotSchema>;
export type UpdatePilotInput = z.infer<typeof updatePilotSchema>;
export type TransitionPilotInput = z.infer<typeof transitionPilotSchema>;
export type PilotConfigurationInput = z.infer<typeof pilotConfigurationSchema>;
export type EnrollPilotParticipantInput = z.infer<typeof enrollPilotParticipantSchema>;
export type AssignPilotCollectionPointInput = z.infer<typeof assignPilotCollectionPointSchema>;
export type AssignPilotDeviceInput = z.infer<typeof assignPilotDeviceSchema>;
export type UpdatePilotDeviceStatusInput = z.infer<typeof updatePilotDeviceStatusSchema>;
export type CreateTrainingModuleInput = z.infer<typeof createTrainingModuleSchema>;
export type RecordPilotBaselineInput = z.infer<typeof recordPilotBaselineSchema>;
export type RecalculatePilotMetricsInput = z.infer<typeof recalculatePilotMetricsSchema>;
export type ReviewMetricObservationInput = z.infer<typeof reviewMetricObservationSchema>;
export type SubmitPublicPilotFeedbackInput = z.infer<typeof submitPublicPilotFeedbackSchema>;
export type CreateSupportCaseInput = z.infer<typeof createSupportCaseSchema>;
export type EscalateSupportCaseInput = z.infer<typeof escalateSupportCaseSchema>;
export type CreatePilotDecisionInput = z.infer<typeof createPilotDecisionSchema>;
