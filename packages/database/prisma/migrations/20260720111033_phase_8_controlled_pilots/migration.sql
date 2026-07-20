-- CreateEnum
CREATE TYPE "PilotStatus" AS ENUM ('DRAFT', 'READINESS_REVIEW', 'BLOCKED', 'APPROVED_FOR_ONBOARDING', 'ONBOARDING', 'TRAINING', 'BASELINE_COLLECTION', 'SUPERVISED_LIVE_USE', 'ACTIVE', 'PAUSED', 'COMPLETED', 'EVALUATING', 'GO', 'CONDITIONAL_GO', 'NO_GO', 'CLOSED');

-- CreateEnum
CREATE TYPE "PilotPaymentMode" AS ENUM ('MOCK', 'MANUAL_RECONCILIATION', 'SANDBOX_PROVIDER');

-- CreateEnum
CREATE TYPE "PilotHederaMode" AS ENUM ('MOCK', 'TESTNET', 'DISABLED');

-- CreateEnum
CREATE TYPE "PilotParticipantType" AS ENUM ('FARMER', 'COLLECTION_AGENT', 'COOPERATIVE_ADMIN', 'FINANCE_OFFICER', 'QUALITY_INSPECTOR', 'BUYER_USER', 'SUPPORT_USER', 'OBSERVER');

-- CreateEnum
CREATE TYPE "PilotParticipantStatus" AS ENUM ('INVITED', 'ENROLLED', 'ACTIVE', 'SUSPENDED', 'WITHDRAWN', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PilotCollectionPointStatus" AS ENUM ('PLANNED', 'READY', 'ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PilotDeviceAssignmentStatus" AS ENUM ('ASSIGNED', 'ACTIVE', 'LOST', 'DAMAGED', 'RETURNED', 'REVOKED');

-- CreateEnum
CREATE TYPE "TrainingModuleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "TrainingAssignmentStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'WAIVED');

-- CreateEnum
CREATE TYPE "PilotMetricValueType" AS ENUM ('DECIMAL', 'INTEGER', 'TEXT');

-- CreateEnum
CREATE TYPE "PilotMetricReviewStatus" AS ENUM ('UNREVIEWED', 'VERIFIED', 'QUESTIONED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PilotMetricDataQuality" AS ENUM ('INSUFFICIENT', 'PARTIAL', 'ACCEPTABLE', 'HIGH');

-- CreateEnum
CREATE TYPE "PilotFeedbackCategory" AS ENUM ('USABILITY', 'OFFLINE_SYNC', 'RECEIPT', 'WEIGHT_OR_QUALITY', 'TRACEABILITY', 'MARKETPLACE', 'SETTLEMENT', 'PAYMENT', 'TRAINING', 'SUPPORT', 'PRIVACY', 'OTHER');

-- CreateEnum
CREATE TYPE "PilotFeedbackStatus" AS ENUM ('NEW', 'TRIAGED', 'IN_REVIEW', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PilotSupportPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "PilotSupportStatus" AS ENUM ('OPEN', 'TRIAGED', 'IN_PROGRESS', 'WAITING_FOR_PARTICIPANT', 'WAITING_FOR_PROVIDER', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PilotDecisionType" AS ENUM ('GO', 'CONDITIONAL_GO', 'EXTEND_PILOT', 'PAUSE', 'NO_GO');

-- CreateEnum
CREATE TYPE "PilotFarmerImportStatus" AS ENUM ('UPLOADED', 'QUARANTINED', 'VALIDATING', 'REVIEW_REQUIRED', 'VALIDATED', 'CONFIRMED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "PilotFarmerImportResolution" AS ENUM ('CREATE_NEW', 'LINK_EXISTING', 'SKIP', 'REVIEW_REQUIRED');

-- AlterTable
ALTER TABLE "PilotReadinessGate" ADD COLUMN     "pilotId" UUID;

-- CreateTable
CREATE TABLE "Pilot" (
    "id" UUID NOT NULL,
    "publicId" VARCHAR(128) NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "organizationId" UUID NOT NULL,
    "status" "PilotStatus" NOT NULL DEFAULT 'DRAFT',
    "crop" VARCHAR(80) NOT NULL,
    "region" VARCHAR(120) NOT NULL,
    "district" VARCHAR(120) NOT NULL,
    "plannedStartDate" DATE NOT NULL,
    "plannedEndDate" DATE NOT NULL,
    "actualStartDate" DATE,
    "actualEndDate" DATE,
    "targetFarmerCount" INTEGER NOT NULL,
    "targetAgentCount" INTEGER NOT NULL,
    "targetCollectionPointCount" INTEGER NOT NULL,
    "targetBuyerCount" INTEGER NOT NULL,
    "paymentMode" "PilotPaymentMode" NOT NULL,
    "hederaMode" "PilotHederaMode" NOT NULL,
    "smsMode" VARCHAR(40) NOT NULL DEFAULT 'MOCK',
    "supportModel" VARCHAR(1000) NOT NULL,
    "environmentLabel" VARCHAR(40) NOT NULL DEFAULT 'PILOT',
    "readOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" UUID NOT NULL,
    "approvedByUserId" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "pausedAt" TIMESTAMPTZ(3),
    "pauseReason" VARCHAR(1000),
    "completedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Pilot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotStatusEvent" (
    "id" UUID NOT NULL,
    "pilotId" UUID NOT NULL,
    "fromStatus" "PilotStatus",
    "toStatus" "PilotStatus" NOT NULL,
    "actorUserId" UUID NOT NULL,
    "reason" VARCHAR(1000),
    "evidence" JSONB NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PilotStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotConfiguration" (
    "id" UUID NOT NULL,
    "pilotId" UUID NOT NULL,
    "allowedCommodityFormIds" JSONB NOT NULL,
    "enabledFeatureFlags" JSONB NOT NULL,
    "languages" JSONB NOT NULL,
    "supportHours" JSONB NOT NULL,
    "baselinePeriodStart" DATE NOT NULL,
    "baselinePeriodEnd" DATE NOT NULL,
    "activeUsePeriodStart" DATE NOT NULL,
    "activeUsePeriodEnd" DATE NOT NULL,
    "evaluationPeriodStart" DATE NOT NULL,
    "evaluationPeriodEnd" DATE NOT NULL,
    "dataRetentionPolicyId" UUID,
    "offlineSnapshotLimit" INTEGER NOT NULL DEFAULT 500,
    "maxSynchronizationBatch" INTEGER NOT NULL DEFAULT 100,
    "incidentContacts" JSONB NOT NULL,
    "escalationPolicy" JSONB NOT NULL,
    "changedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PilotConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotParticipant" (
    "id" UUID NOT NULL,
    "pilotId" UUID NOT NULL,
    "participantType" "PilotParticipantType" NOT NULL,
    "userId" UUID,
    "farmerId" UUID,
    "organizationId" UUID,
    "collectionPointId" UUID,
    "status" "PilotParticipantStatus" NOT NULL DEFAULT 'INVITED',
    "enrolledAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMPTZ(3),
    "withdrawalReason" VARCHAR(1000),
    "consentVerifiedAt" TIMESTAMPTZ(3),
    "trainingRequired" BOOLEAN NOT NULL DEFAULT true,
    "trainingCompletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PilotParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotCollectionPoint" (
    "id" UUID NOT NULL,
    "pilotId" UUID NOT NULL,
    "collectionPointId" UUID NOT NULL,
    "status" "PilotCollectionPointStatus" NOT NULL DEFAULT 'PLANNED',
    "activatedAt" TIMESTAMPTZ(3),
    "deactivatedAt" TIMESTAMPTZ(3),
    "readinessNotes" VARCHAR(2000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PilotCollectionPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotDeviceAssignment" (
    "id" UUID NOT NULL,
    "pilotId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "assignedUserId" UUID NOT NULL,
    "collectionPointId" UUID NOT NULL,
    "status" "PilotDeviceAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMPTZ(3),
    "lastInspectionAt" TIMESTAMPTZ(3),
    "conditionNotes" VARCHAR(2000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PilotDeviceAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingModule" (
    "id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "audience" "PilotParticipantType" NOT NULL,
    "language" VARCHAR(20) NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "TrainingModuleStatus" NOT NULL DEFAULT 'DRAFT',
    "contentReference" VARCHAR(500) NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL,
    "requiresAssessment" BOOLEAN NOT NULL DEFAULT false,
    "passingScore" INTEGER,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TrainingModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingAssignment" (
    "id" UUID NOT NULL,
    "pilotId" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "trainingModuleId" UUID NOT NULL,
    "status" "TrainingAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "score" INTEGER,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "verifiedByUserId" UUID,
    "waiverReason" VARCHAR(1000),
    "notes" VARCHAR(2000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TrainingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotFarmerImport" (
    "id" UUID NOT NULL,
    "pilotId" UUID NOT NULL,
    "publicId" VARCHAR(128) NOT NULL,
    "objectKey" VARCHAR(500) NOT NULL,
    "originalFilenameHash" VARCHAR(128) NOT NULL,
    "contentType" VARCHAR(100) NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "checksum" VARCHAR(128) NOT NULL,
    "status" "PilotFarmerImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "validRowCount" INTEGER NOT NULL DEFAULT 0,
    "errorRowCount" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" UUID NOT NULL,
    "confirmedByUserId" UUID,
    "confirmedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PilotFarmerImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotFarmerImportRow" (
    "id" UUID NOT NULL,
    "farmerImportId" UUID NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "normalizedData" JSONB NOT NULL,
    "validationErrors" JSONB NOT NULL,
    "duplicateSignals" JSONB NOT NULL,
    "resolution" "PilotFarmerImportResolution" NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "existingFarmerId" UUID,
    "importedFarmerId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PilotFarmerImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotMetricDefinition" (
    "id" UUID NOT NULL,
    "code" VARCHAR(120) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "purpose" VARCHAR(1000) NOT NULL,
    "unit" VARCHAR(80),
    "dataSource" VARCHAR(500) NOT NULL,
    "calculation" VARCHAR(2000) NOT NULL,
    "population" VARCHAR(1000) NOT NULL,
    "timeWindow" VARCHAR(500) NOT NULL,
    "privacyClassification" VARCHAR(40) NOT NULL,
    "reviewOwner" VARCHAR(200) NOT NULL,
    "target" DECIMAL(20,6),
    "warningThreshold" DECIMAL(20,6),
    "criticalThreshold" DECIMAL(20,6),
    "metricVersion" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PilotMetricDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotBaselineMetric" (
    "id" UUID NOT NULL,
    "pilotId" UUID NOT NULL,
    "metricCode" VARCHAR(120) NOT NULL,
    "metricVersion" INTEGER NOT NULL,
    "valueType" "PilotMetricValueType" NOT NULL,
    "decimalValue" DECIMAL(20,6),
    "integerValue" INTEGER,
    "textValue" VARCHAR(1000),
    "unit" VARCHAR(80),
    "measurementPeriodStart" TIMESTAMPTZ(3) NOT NULL,
    "measurementPeriodEnd" TIMESTAMPTZ(3) NOT NULL,
    "source" VARCHAR(500) NOT NULL,
    "evidenceReference" VARCHAR(500),
    "collectedByUserId" UUID NOT NULL,
    "verifiedByUserId" UUID,
    "verifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PilotBaselineMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotMetricObservation" (
    "id" UUID NOT NULL,
    "pilotId" UUID NOT NULL,
    "metricCode" VARCHAR(120) NOT NULL,
    "metricVersion" INTEGER NOT NULL,
    "periodStart" TIMESTAMPTZ(3) NOT NULL,
    "periodEnd" TIMESTAMPTZ(3) NOT NULL,
    "valueType" "PilotMetricValueType" NOT NULL,
    "decimalValue" DECIMAL(20,6),
    "integerValue" INTEGER,
    "textValue" VARCHAR(1000),
    "unit" VARCHAR(80),
    "source" VARCHAR(500) NOT NULL,
    "calculationMetadata" JSONB NOT NULL,
    "generatedAutomatically" BOOLEAN NOT NULL DEFAULT false,
    "dataQuality" "PilotMetricDataQuality" NOT NULL DEFAULT 'INSUFFICIENT',
    "reviewStatus" "PilotMetricReviewStatus" NOT NULL DEFAULT 'UNREVIEWED',
    "reviewedByUserId" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PilotMetricObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotFieldObservation" (
    "id" UUID NOT NULL,
    "pilotId" UUID NOT NULL,
    "task" VARCHAR(120) NOT NULL,
    "outcome" VARCHAR(120) NOT NULL,
    "durationSeconds" INTEGER,
    "assistanceRequired" BOOLEAN NOT NULL DEFAULT false,
    "errorType" VARCHAR(120),
    "connectivityCondition" VARCHAR(80) NOT NULL,
    "deviceType" VARCHAR(120) NOT NULL,
    "language" VARCHAR(20) NOT NULL,
    "notes" VARCHAR(2000),
    "severity" VARCHAR(40) NOT NULL,
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "observedByUserId" UUID NOT NULL,
    "observedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PilotFieldObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotFeedback" (
    "id" UUID NOT NULL,
    "pilotId" UUID NOT NULL,
    "participantId" UUID,
    "respondentType" "PilotParticipantType" NOT NULL,
    "category" "PilotFeedbackCategory" NOT NULL,
    "rating" INTEGER,
    "message" VARCHAR(4000),
    "language" VARCHAR(20) NOT NULL,
    "channel" VARCHAR(40) NOT NULL,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "consentToContact" BOOLEAN NOT NULL DEFAULT false,
    "status" "PilotFeedbackStatus" NOT NULL DEFAULT 'NEW',
    "assignedToUserId" UUID,
    "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(3),
    "resolution" VARCHAR(2000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PilotFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotSupportCase" (
    "id" UUID NOT NULL,
    "caseNumber" VARCHAR(80) NOT NULL,
    "pilotId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "participantId" UUID,
    "category" VARCHAR(80) NOT NULL,
    "priority" "PilotSupportPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "PilotSupportStatus" NOT NULL DEFAULT 'OPEN',
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(4000) NOT NULL,
    "assignedToUserId" UUID,
    "relatedEntityType" VARCHAR(80),
    "relatedEntityId" UUID,
    "escalatedIncidentId" UUID,
    "openedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstResponseAt" TIMESTAMPTZ(3),
    "resolvedAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "resolutionCode" VARCHAR(80),
    "resolutionSummary" VARCHAR(2000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PilotSupportCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotDecision" (
    "id" UUID NOT NULL,
    "pilotId" UUID NOT NULL,
    "decision" "PilotDecisionType" NOT NULL,
    "decisionVersion" INTEGER NOT NULL,
    "summary" VARCHAR(4000) NOT NULL,
    "evidenceSnapshotHash" VARCHAR(128) NOT NULL,
    "strengths" JSONB NOT NULL,
    "risks" JSONB NOT NULL,
    "blockingIssues" JSONB NOT NULL,
    "conditions" JSONB NOT NULL,
    "decidedByUserId" UUID NOT NULL,
    "approvedByUserId" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "decidedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextReviewAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PilotDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pilot_publicId_key" ON "Pilot"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "Pilot_code_key" ON "Pilot"("code");

-- CreateIndex
CREATE INDEX "Pilot_organizationId_status_plannedStartDate_plannedEndDate_idx" ON "Pilot"("organizationId", "status", "plannedStartDate", "plannedEndDate");

-- CreateIndex
CREATE INDEX "Pilot_status_updatedAt_idx" ON "Pilot"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "PilotStatusEvent_pilotId_occurredAt_idx" ON "PilotStatusEvent"("pilotId", "occurredAt");

-- CreateIndex
CREATE INDEX "PilotStatusEvent_actorUserId_occurredAt_idx" ON "PilotStatusEvent"("actorUserId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "PilotConfiguration_pilotId_key" ON "PilotConfiguration"("pilotId");

-- CreateIndex
CREATE INDEX "PilotConfiguration_changedByUserId_updatedAt_idx" ON "PilotConfiguration"("changedByUserId", "updatedAt");

-- CreateIndex
CREATE INDEX "PilotParticipant_pilotId_participantType_status_idx" ON "PilotParticipant"("pilotId", "participantType", "status");

-- CreateIndex
CREATE INDEX "PilotParticipant_userId_status_idx" ON "PilotParticipant"("userId", "status");

-- CreateIndex
CREATE INDEX "PilotParticipant_farmerId_status_idx" ON "PilotParticipant"("farmerId", "status");

-- CreateIndex
CREATE INDEX "PilotCollectionPoint_pilotId_status_idx" ON "PilotCollectionPoint"("pilotId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PilotCollectionPoint_pilotId_collectionPointId_key" ON "PilotCollectionPoint"("pilotId", "collectionPointId");

-- CreateIndex
CREATE INDEX "PilotDeviceAssignment_pilotId_status_collectionPointId_idx" ON "PilotDeviceAssignment"("pilotId", "status", "collectionPointId");

-- CreateIndex
CREATE INDEX "PilotDeviceAssignment_assignedUserId_status_idx" ON "PilotDeviceAssignment"("assignedUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PilotDeviceAssignment_pilotId_deviceId_key" ON "PilotDeviceAssignment"("pilotId", "deviceId");

-- CreateIndex
CREATE INDEX "TrainingModule_audience_status_language_idx" ON "TrainingModule"("audience", "status", "language");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingModule_code_language_version_key" ON "TrainingModule"("code", "language", "version");

-- CreateIndex
CREATE INDEX "TrainingAssignment_pilotId_status_assignedAt_idx" ON "TrainingAssignment"("pilotId", "status", "assignedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingAssignment_participantId_trainingModuleId_key" ON "TrainingAssignment"("participantId", "trainingModuleId");

-- CreateIndex
CREATE UNIQUE INDEX "PilotFarmerImport_publicId_key" ON "PilotFarmerImport"("publicId");

-- CreateIndex
CREATE INDEX "PilotFarmerImport_pilotId_status_createdAt_idx" ON "PilotFarmerImport"("pilotId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PilotFarmerImportRow_farmerImportId_resolution_idx" ON "PilotFarmerImportRow"("farmerImportId", "resolution");

-- CreateIndex
CREATE UNIQUE INDEX "PilotFarmerImportRow_farmerImportId_rowNumber_key" ON "PilotFarmerImportRow"("farmerImportId", "rowNumber");

-- CreateIndex
CREATE INDEX "PilotMetricDefinition_active_code_idx" ON "PilotMetricDefinition"("active", "code");

-- CreateIndex
CREATE UNIQUE INDEX "PilotMetricDefinition_code_metricVersion_key" ON "PilotMetricDefinition"("code", "metricVersion");

-- CreateIndex
CREATE INDEX "PilotBaselineMetric_pilotId_metricCode_verifiedAt_idx" ON "PilotBaselineMetric"("pilotId", "metricCode", "verifiedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PilotBaselineMetric_pilotId_metricCode_metricVersion_measur_key" ON "PilotBaselineMetric"("pilotId", "metricCode", "metricVersion", "measurementPeriodStart", "measurementPeriodEnd");

-- CreateIndex
CREATE INDEX "PilotMetricObservation_pilotId_metricCode_periodEnd_idx" ON "PilotMetricObservation"("pilotId", "metricCode", "periodEnd");

-- CreateIndex
CREATE INDEX "PilotMetricObservation_pilotId_reviewStatus_dataQuality_idx" ON "PilotMetricObservation"("pilotId", "reviewStatus", "dataQuality");

-- CreateIndex
CREATE INDEX "PilotFieldObservation_pilotId_task_observedAt_idx" ON "PilotFieldObservation"("pilotId", "task", "observedAt");

-- CreateIndex
CREATE INDEX "PilotFieldObservation_pilotId_severity_followUpRequired_idx" ON "PilotFieldObservation"("pilotId", "severity", "followUpRequired");

-- CreateIndex
CREATE INDEX "PilotFeedback_pilotId_status_submittedAt_idx" ON "PilotFeedback"("pilotId", "status", "submittedAt");

-- CreateIndex
CREATE INDEX "PilotFeedback_pilotId_category_submittedAt_idx" ON "PilotFeedback"("pilotId", "category", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PilotSupportCase_caseNumber_key" ON "PilotSupportCase"("caseNumber");

-- CreateIndex
CREATE INDEX "PilotSupportCase_pilotId_status_priority_openedAt_idx" ON "PilotSupportCase"("pilotId", "status", "priority", "openedAt");

-- CreateIndex
CREATE INDEX "PilotSupportCase_organizationId_status_openedAt_idx" ON "PilotSupportCase"("organizationId", "status", "openedAt");

-- CreateIndex
CREATE INDEX "PilotSupportCase_assignedToUserId_status_idx" ON "PilotSupportCase"("assignedToUserId", "status");

-- CreateIndex
CREATE INDEX "PilotDecision_pilotId_decidedAt_idx" ON "PilotDecision"("pilotId", "decidedAt");

-- CreateIndex
CREATE INDEX "PilotDecision_approvedByUserId_approvedAt_idx" ON "PilotDecision"("approvedByUserId", "approvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PilotDecision_pilotId_decisionVersion_key" ON "PilotDecision"("pilotId", "decisionVersion");

-- CreateIndex
CREATE INDEX "PilotReadinessGate_pilotId_status_blocking_idx" ON "PilotReadinessGate"("pilotId", "status", "blocking");

-- AddForeignKey
ALTER TABLE "PilotReadinessGate" ADD CONSTRAINT "PilotReadinessGate_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pilot" ADD CONSTRAINT "Pilot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotStatusEvent" ADD CONSTRAINT "PilotStatusEvent_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotConfiguration" ADD CONSTRAINT "PilotConfiguration_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotParticipant" ADD CONSTRAINT "PilotParticipant_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotCollectionPoint" ADD CONSTRAINT "PilotCollectionPoint_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotDeviceAssignment" ADD CONSTRAINT "PilotDeviceAssignment_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "PilotParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_trainingModuleId_fkey" FOREIGN KEY ("trainingModuleId") REFERENCES "TrainingModule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotFarmerImport" ADD CONSTRAINT "PilotFarmerImport_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotFarmerImportRow" ADD CONSTRAINT "PilotFarmerImportRow_farmerImportId_fkey" FOREIGN KEY ("farmerImportId") REFERENCES "PilotFarmerImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotBaselineMetric" ADD CONSTRAINT "PilotBaselineMetric_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotMetricObservation" ADD CONSTRAINT "PilotMetricObservation_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotFieldObservation" ADD CONSTRAINT "PilotFieldObservation_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotFeedback" ADD CONSTRAINT "PilotFeedback_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotFeedback" ADD CONSTRAINT "PilotFeedback_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "PilotParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotSupportCase" ADD CONSTRAINT "PilotSupportCase_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotDecision" ADD CONSTRAINT "PilotDecision_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Scalar references intentionally remain explicit at the database boundary.
ALTER TABLE "Pilot"
    ADD CONSTRAINT "Pilot_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "Pilot_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PilotStatusEvent" ADD CONSTRAINT "PilotStatusEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PilotConfiguration"
    ADD CONSTRAINT "PilotConfiguration_retentionPolicy_fkey" FOREIGN KEY ("dataRetentionPolicyId") REFERENCES "DataRetentionPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PilotConfiguration_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PilotParticipant"
    ADD CONSTRAINT "PilotParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PilotParticipant_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PilotParticipant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PilotParticipant_collectionPointId_fkey" FOREIGN KEY ("collectionPointId") REFERENCES "CollectionPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PilotCollectionPoint" ADD CONSTRAINT "PilotCollectionPoint_collectionPointId_fkey" FOREIGN KEY ("collectionPointId") REFERENCES "CollectionPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PilotDeviceAssignment"
    ADD CONSTRAINT "PilotDeviceAssignment_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "RegisteredDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PilotDeviceAssignment_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PilotDeviceAssignment_collectionPointId_fkey" FOREIGN KEY ("collectionPointId") REFERENCES "CollectionPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PilotFarmerImport"
    ADD CONSTRAINT "PilotFarmerImport_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PilotFarmerImport_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PilotFarmerImportRow"
    ADD CONSTRAINT "PilotFarmerImportRow_existingFarmerId_fkey" FOREIGN KEY ("existingFarmerId") REFERENCES "Farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PilotFarmerImportRow_importedFarmerId_fkey" FOREIGN KEY ("importedFarmerId") REFERENCES "Farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PilotBaselineMetric"
    ADD CONSTRAINT "PilotBaselineMetric_collectedByUserId_fkey" FOREIGN KEY ("collectedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PilotBaselineMetric_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PilotMetricObservation" ADD CONSTRAINT "PilotMetricObservation_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PilotFieldObservation" ADD CONSTRAINT "PilotFieldObservation_observedByUserId_fkey" FOREIGN KEY ("observedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PilotFeedback" ADD CONSTRAINT "PilotFeedback_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PilotSupportCase"
    ADD CONSTRAINT "PilotSupportCase_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PilotSupportCase_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "PilotParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PilotSupportCase_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PilotSupportCase_escalatedIncidentId_fkey" FOREIGN KEY ("escalatedIncidentId") REFERENCES "OperationalIncident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PilotDecision"
    ADD CONSTRAINT "PilotDecision_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PilotDecision_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Active enrollment is unique while preserving historical withdrawn/completed records.
CREATE UNIQUE INDEX "PilotParticipant_active_user_key" ON "PilotParticipant" ("pilotId", "userId")
WHERE "userId" IS NOT NULL AND "status" NOT IN ('WITHDRAWN', 'COMPLETED');
CREATE UNIQUE INDEX "PilotParticipant_active_farmer_key" ON "PilotParticipant" ("pilotId", "farmerId")
WHERE "farmerId" IS NOT NULL AND "status" NOT IN ('WITHDRAWN', 'COMPLETED');

ALTER TABLE "Pilot"
    ADD CONSTRAINT "Pilot_dates_ordered" CHECK ("plannedEndDate" >= "plannedStartDate" AND ("actualEndDate" IS NULL OR ("actualStartDate" IS NOT NULL AND "actualEndDate" >= "actualStartDate"))),
    ADD CONSTRAINT "Pilot_targets_valid" CHECK ("targetFarmerCount" BETWEEN 1 AND 100000 AND "targetAgentCount" BETWEEN 1 AND 10000 AND "targetCollectionPointCount" BETWEEN 1 AND 1000 AND "targetBuyerCount" BETWEEN 0 AND 10000),
    ADD CONSTRAINT "Pilot_version_positive" CHECK ("version" > 0),
    ADD CONSTRAINT "Pilot_approval_consistent" CHECK (("approvedByUserId" IS NULL) = ("approvedAt" IS NULL)),
    ADD CONSTRAINT "Pilot_pause_consistent" CHECK (("status" = 'PAUSED' AND "pausedAt" IS NOT NULL AND "pauseReason" IS NOT NULL) OR "status" <> 'PAUSED'),
    ADD CONSTRAINT "Pilot_completion_consistent" CHECK ("status" NOT IN ('COMPLETED', 'EVALUATING', 'GO', 'CONDITIONAL_GO', 'NO_GO', 'CLOSED') OR "completedAt" IS NOT NULL),
    ADD CONSTRAINT "Pilot_provider_labels" CHECK ("smsMode" IN ('DISABLED', 'MOCK', 'CONSOLE', 'SANDBOX'));

ALTER TABLE "PilotStatusEvent" ADD CONSTRAINT "PilotStatusEvent_transition" CHECK ("fromStatus" IS NULL OR "fromStatus" <> "toStatus");
ALTER TABLE "PilotConfiguration"
    ADD CONSTRAINT "PilotConfiguration_periods_ordered" CHECK ("baselinePeriodEnd" >= "baselinePeriodStart" AND "activeUsePeriodEnd" >= "activeUsePeriodStart" AND "evaluationPeriodEnd" >= "evaluationPeriodStart"),
    ADD CONSTRAINT "PilotConfiguration_offline_limits" CHECK ("offlineSnapshotLimit" BETWEEN 1 AND 5000 AND "maxSynchronizationBatch" BETWEEN 1 AND 500);
ALTER TABLE "PilotParticipant"
    ADD CONSTRAINT "PilotParticipant_reference" CHECK (("participantType" = 'FARMER' AND "farmerId" IS NOT NULL AND "userId" IS NULL) OR ("participantType" <> 'FARMER' AND "userId" IS NOT NULL AND "farmerId" IS NULL)),
    ADD CONSTRAINT "PilotParticipant_withdrawal" CHECK (("status" = 'WITHDRAWN' AND "withdrawnAt" IS NOT NULL AND "withdrawalReason" IS NOT NULL) OR ("status" <> 'WITHDRAWN' AND "withdrawnAt" IS NULL));
ALTER TABLE "PilotCollectionPoint" ADD CONSTRAINT "PilotCollectionPoint_timestamps" CHECK (("status" IN ('ACTIVE', 'SUSPENDED', 'CLOSED') AND "activatedAt" IS NOT NULL) OR "status" IN ('PLANNED', 'READY'));
ALTER TABLE "PilotDeviceAssignment" ADD CONSTRAINT "PilotDeviceAssignment_returned" CHECK (("status" = 'RETURNED' AND "returnedAt" IS NOT NULL) OR "status" <> 'RETURNED');
ALTER TABLE "TrainingModule"
    ADD CONSTRAINT "TrainingModule_version_duration" CHECK ("version" > 0 AND "estimatedMinutes" BETWEEN 1 AND 1440),
    ADD CONSTRAINT "TrainingModule_assessment" CHECK (("requiresAssessment" AND "passingScore" BETWEEN 1 AND 100) OR (NOT "requiresAssessment" AND "passingScore" IS NULL));
ALTER TABLE "TrainingAssignment"
    ADD CONSTRAINT "TrainingAssignment_attempt_score" CHECK ("attemptCount" >= 0 AND ("score" IS NULL OR "score" BETWEEN 0 AND 100)),
    ADD CONSTRAINT "TrainingAssignment_waiver" CHECK (("status" = 'WAIVED' AND "waiverReason" IS NOT NULL AND "verifiedByUserId" IS NOT NULL) OR "status" <> 'WAIVED'),
    ADD CONSTRAINT "TrainingAssignment_completion" CHECK (("status" = 'COMPLETED' AND "completedAt" IS NOT NULL AND "verifiedByUserId" IS NOT NULL) OR "status" <> 'COMPLETED');
ALTER TABLE "PilotFarmerImport"
    ADD CONSTRAINT "PilotFarmerImport_file" CHECK ("contentType" = 'text/csv' AND "sizeBytes" BETWEEN 1 AND 10485760),
    ADD CONSTRAINT "PilotFarmerImport_counts" CHECK ("rowCount" >= 0 AND "validRowCount" >= 0 AND "errorRowCount" >= 0 AND "validRowCount" + "errorRowCount" <= "rowCount"),
    ADD CONSTRAINT "PilotFarmerImport_confirmation" CHECK (("status" = 'CONFIRMED' AND "confirmedByUserId" IS NOT NULL AND "confirmedAt" IS NOT NULL AND NOT "dryRun") OR "status" <> 'CONFIRMED');
ALTER TABLE "PilotFarmerImportRow" ADD CONSTRAINT "PilotFarmerImportRow_number" CHECK ("rowNumber" > 0);
ALTER TABLE "PilotMetricDefinition" ADD CONSTRAINT "PilotMetricDefinition_version" CHECK ("metricVersion" > 0);
ALTER TABLE "PilotBaselineMetric"
    ADD CONSTRAINT "PilotBaselineMetric_period" CHECK ("measurementPeriodEnd" >= "measurementPeriodStart" AND "metricVersion" > 0),
    ADD CONSTRAINT "PilotBaselineMetric_typed_value" CHECK (("valueType" = 'DECIMAL' AND "decimalValue" IS NOT NULL AND "integerValue" IS NULL AND "textValue" IS NULL) OR ("valueType" = 'INTEGER' AND "decimalValue" IS NULL AND "integerValue" IS NOT NULL AND "textValue" IS NULL) OR ("valueType" = 'TEXT' AND "decimalValue" IS NULL AND "integerValue" IS NULL AND "textValue" IS NOT NULL)),
    ADD CONSTRAINT "PilotBaselineMetric_verification" CHECK (("verifiedByUserId" IS NULL) = ("verifiedAt" IS NULL));
ALTER TABLE "PilotMetricObservation"
    ADD CONSTRAINT "PilotMetricObservation_period" CHECK ("periodEnd" >= "periodStart" AND "metricVersion" > 0),
    ADD CONSTRAINT "PilotMetricObservation_typed_value" CHECK (("valueType" = 'DECIMAL' AND "decimalValue" IS NOT NULL AND "integerValue" IS NULL AND "textValue" IS NULL) OR ("valueType" = 'INTEGER' AND "decimalValue" IS NULL AND "integerValue" IS NOT NULL AND "textValue" IS NULL) OR ("valueType" = 'TEXT' AND "decimalValue" IS NULL AND "integerValue" IS NULL AND "textValue" IS NOT NULL)),
    ADD CONSTRAINT "PilotMetricObservation_review" CHECK (("reviewStatus" = 'UNREVIEWED' AND "reviewedByUserId" IS NULL AND "reviewedAt" IS NULL) OR ("reviewStatus" <> 'UNREVIEWED' AND "reviewedByUserId" IS NOT NULL AND "reviewedAt" IS NOT NULL));
ALTER TABLE "PilotFieldObservation" ADD CONSTRAINT "PilotFieldObservation_duration" CHECK ("durationSeconds" IS NULL OR "durationSeconds" >= 0);
ALTER TABLE "PilotFeedback"
    ADD CONSTRAINT "PilotFeedback_rating" CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 5),
    ADD CONSTRAINT "PilotFeedback_anonymous" CHECK (NOT "anonymous" OR ("participantId" IS NULL AND NOT "consentToContact")),
    ADD CONSTRAINT "PilotFeedback_resolution" CHECK (("status" IN ('RESOLVED', 'CLOSED') AND "resolvedAt" IS NOT NULL AND "resolution" IS NOT NULL) OR "status" NOT IN ('RESOLVED', 'CLOSED'));
ALTER TABLE "PilotSupportCase"
    ADD CONSTRAINT "PilotSupportCase_response_order" CHECK ("firstResponseAt" IS NULL OR "firstResponseAt" >= "openedAt"),
    ADD CONSTRAINT "PilotSupportCase_resolution" CHECK (("status" IN ('RESOLVED', 'CLOSED') AND "resolvedAt" IS NOT NULL AND "resolutionCode" IS NOT NULL AND "resolutionSummary" IS NOT NULL) OR "status" NOT IN ('RESOLVED', 'CLOSED')),
    ADD CONSTRAINT "PilotSupportCase_closure" CHECK (("status" = 'CLOSED' AND "closedAt" IS NOT NULL) OR ("status" <> 'CLOSED' AND "closedAt" IS NULL));
ALTER TABLE "PilotDecision"
    ADD CONSTRAINT "PilotDecision_version" CHECK ("decisionVersion" > 0),
    ADD CONSTRAINT "PilotDecision_approval" CHECK (("approvedByUserId" IS NULL) = ("approvedAt" IS NULL)),
    ADD CONSTRAINT "PilotDecision_separation" CHECK ("approvedByUserId" IS NULL OR "approvedByUserId" <> "decidedByUserId");

CREATE OR REPLACE FUNCTION phase_8_reject_mutation()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PilotStatusEvent_append_only" BEFORE UPDATE OR DELETE ON "PilotStatusEvent" FOR EACH ROW EXECUTE FUNCTION phase_8_reject_mutation();
CREATE TRIGGER "PilotDecision_append_only" BEFORE UPDATE OR DELETE ON "PilotDecision" FOR EACH ROW EXECUTE FUNCTION phase_8_reject_mutation();
