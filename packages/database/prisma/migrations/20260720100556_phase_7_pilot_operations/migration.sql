-- CreateEnum
CREATE TYPE "PilotReadinessCategory" AS ENUM ('FUNCTIONAL', 'SECURITY', 'PRIVACY', 'DATA_INTEGRITY', 'OFFLINE', 'PERFORMANCE', 'BACKUP_RECOVERY', 'OBSERVABILITY', 'OPERATIONAL_SUPPORT', 'ACCESSIBILITY', 'LOCALIZATION', 'LEGAL_REGULATORY', 'PAYMENT_PROVIDER', 'HEDERA_ENVIRONMENT', 'FIELD_EQUIPMENT', 'TRAINING');

-- CreateEnum
CREATE TYPE "PilotReadinessStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'READY', 'READY_WITH_RISK', 'BLOCKED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "OperationalRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "DataRetentionDeletionMode" AS ENUM ('DELETE', 'ANONYMIZE', 'ARCHIVE', 'RETAIN_IMMUTABLY');

-- CreateEnum
CREATE TYPE "DataRetentionPolicyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "DataSubjectType" AS ENUM ('FARMER', 'USER');

-- CreateEnum
CREATE TYPE "DataSubjectRequestType" AS ENUM ('ACCESS', 'CORRECTION', 'DELETION', 'RESTRICTION', 'CONSENT_WITHDRAWAL', 'DATA_EXPORT');

-- CreateEnum
CREATE TYPE "DataSubjectRequestStatus" AS ENUM ('RECEIVED', 'IDENTITY_VERIFICATION_REQUIRED', 'IN_REVIEW', 'FULFILLED', 'PARTIALLY_FULFILLED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OperationalIncidentCategory" AS ENUM ('SECURITY', 'PRIVACY', 'AVAILABILITY', 'DATA_INTEGRITY', 'PAYMENT', 'HEDERA', 'OFFLINE_SYNC', 'PERFORMANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "OperationalIncidentSeverity" AS ENUM ('SEV1', 'SEV2', 'SEV3', 'SEV4');

-- CreateEnum
CREATE TYPE "OperationalIncidentStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'MITIGATING', 'MONITORING', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "BackupVerificationStatus" AS ENUM ('STARTED', 'COMPLETED', 'FAILED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "BackupRestoreStatus" AS ENUM ('NOT_TESTED', 'PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('SMS', 'EMAIL', 'IN_APP');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'QUEUED', 'SUBMITTED', 'DELIVERED', 'FAILED', 'CANCELLED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "FeatureFlagScope" AS ENUM ('PLATFORM', 'ORGANIZATION');

-- CreateTable
CREATE TABLE "PilotReadinessGate" (
    "id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "category" "PilotReadinessCategory" NOT NULL,
    "status" "PilotReadinessStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "blocking" BOOLEAN NOT NULL DEFAULT true,
    "ownerUserId" UUID,
    "reviewedByUserId" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "nextReviewAt" TIMESTAMPTZ(3),
    "riskLevel" "OperationalRiskLevel" NOT NULL DEFAULT 'MEDIUM',
    "notes" VARCHAR(2000),
    "evidence" JSONB NOT NULL,
    "humanReviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PilotReadinessGate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotReadinessGateStatusEvent" (
    "id" UUID NOT NULL,
    "readinessGateId" UUID NOT NULL,
    "fromStatus" "PilotReadinessStatus",
    "toStatus" "PilotReadinessStatus" NOT NULL,
    "actorUserId" UUID NOT NULL,
    "evidence" JSONB NOT NULL,
    "riskNotes" VARCHAR(2000),
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PilotReadinessGateStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataRetentionPolicy" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "dataCategory" VARCHAR(100) NOT NULL,
    "retentionDays" INTEGER NOT NULL,
    "archiveAfterDays" INTEGER,
    "deletionMode" "DataRetentionDeletionMode" NOT NULL,
    "legalHoldSupported" BOOLEAN NOT NULL DEFAULT true,
    "status" "DataRetentionPolicyStatus" NOT NULL DEFAULT 'DRAFT',
    "policyVersion" INTEGER NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "createdByUserId" UUID NOT NULL,
    "approvedByUserId" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DataRetentionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataRetentionDryRun" (
    "id" UUID NOT NULL,
    "dataRetentionPolicyId" UUID NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "eligibleForDeletion" INTEGER NOT NULL DEFAULT 0,
    "eligibleForAnonymization" INTEGER NOT NULL DEFAULT 0,
    "blockedByLegalHold" INTEGER NOT NULL DEFAULT 0,
    "immutableRecordsRetained" INTEGER NOT NULL DEFAULT 0,
    "estimatedStorageBytes" BIGINT,
    "report" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataRetentionDryRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSubjectRequest" (
    "id" UUID NOT NULL,
    "publicId" VARCHAR(128) NOT NULL,
    "organizationId" UUID,
    "subjectType" "DataSubjectType" NOT NULL,
    "farmerId" UUID,
    "userId" UUID,
    "requestType" "DataSubjectRequestType" NOT NULL,
    "status" "DataSubjectRequestStatus" NOT NULL DEFAULT 'RECEIVED',
    "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "identityVerifiedAt" TIMESTAMPTZ(3),
    "assignedToUserId" UUID,
    "completedAt" TIMESTAMPTZ(3),
    "rejectedAt" TIMESTAMPTZ(3),
    "rejectionReason" VARCHAR(1000),
    "responseDocumentKey" VARCHAR(500),
    "notes" VARCHAR(2000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DataSubjectRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalIncident" (
    "id" UUID NOT NULL,
    "incidentNumber" VARCHAR(80) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(4000) NOT NULL,
    "category" "OperationalIncidentCategory" NOT NULL,
    "severity" "OperationalIncidentSeverity" NOT NULL,
    "status" "OperationalIncidentStatus" NOT NULL DEFAULT 'OPEN',
    "restricted" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" UUID,
    "detectedAt" TIMESTAMPTZ(3) NOT NULL,
    "acknowledgedAt" TIMESTAMPTZ(3),
    "resolvedAt" TIMESTAMPTZ(3),
    "ownerUserId" UUID,
    "reportedByUserId" UUID,
    "impactSummary" VARCHAR(2000),
    "rootCauseSummary" VARCHAR(2000),
    "resolutionSummary" VARCHAR(2000),
    "externalReference" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OperationalIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupVerificationRecord" (
    "id" UUID NOT NULL,
    "backupType" VARCHAR(80) NOT NULL,
    "environment" VARCHAR(40) NOT NULL,
    "backupReference" VARCHAR(255) NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "status" "BackupVerificationStatus" NOT NULL,
    "sizeBytes" BIGINT,
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "retentionUntil" TIMESTAMPTZ(3),
    "restoreTestedAt" TIMESTAMPTZ(3),
    "restoreStatus" "BackupRestoreStatus",
    "recoveryPointObjectiveMet" BOOLEAN,
    "recoveryTimeObjectiveMet" BOOLEAN,
    "verifiedByUserId" UUID,
    "notes" VARCHAR(2000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackupVerificationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "recipientType" VARCHAR(80) NOT NULL,
    "recipientReference" VARCHAR(128) NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "templateCode" VARCHAR(100) NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "parameters" JSONB NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "provider" VARCHAR(80) NOT NULL,
    "providerReference" VARCHAR(255),
    "deduplicationKey" VARCHAR(255) NOT NULL,
    "scheduledAt" TIMESTAMPTZ(3),
    "submittedAt" TIMESTAMPTZ(3),
    "deliveredAt" TIMESTAMPTZ(3),
    "failedAt" TIMESTAMPTZ(3),
    "failureCode" VARCHAR(120),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "id" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "scope" "FeatureFlagScope" NOT NULL,
    "organizationId" UUID,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "highRisk" BOOLEAN NOT NULL DEFAULT false,
    "reason" VARCHAR(1000) NOT NULL,
    "changedByUserId" UUID NOT NULL,
    "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PilotReadinessGate_code_key" ON "PilotReadinessGate"("code");

-- CreateIndex
CREATE INDEX "PilotReadinessGate_status_blocking_riskLevel_idx" ON "PilotReadinessGate"("status", "blocking", "riskLevel");

-- CreateIndex
CREATE INDEX "PilotReadinessGate_category_status_idx" ON "PilotReadinessGate"("category", "status");

-- CreateIndex
CREATE INDEX "PilotReadinessGate_ownerUserId_status_idx" ON "PilotReadinessGate"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX "PilotReadinessGate_nextReviewAt_idx" ON "PilotReadinessGate"("nextReviewAt");

-- CreateIndex
CREATE INDEX "PilotReadinessGateStatusEvent_readinessGateId_occurredAt_idx" ON "PilotReadinessGateStatusEvent"("readinessGateId", "occurredAt");

-- CreateIndex
CREATE INDEX "PilotReadinessGateStatusEvent_actorUserId_occurredAt_idx" ON "PilotReadinessGateStatusEvent"("actorUserId", "occurredAt");

-- CreateIndex
CREATE INDEX "DataRetentionPolicy_organizationId_status_effectiveFrom_idx" ON "DataRetentionPolicy"("organizationId", "status", "effectiveFrom");

-- CreateIndex
CREATE INDEX "DataRetentionPolicy_status_effectiveFrom_effectiveTo_idx" ON "DataRetentionPolicy"("status", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "DataRetentionPolicy_organizationId_dataCategory_policyVersi_key" ON "DataRetentionPolicy"("organizationId", "dataCategory", "policyVersion");

-- CreateIndex
CREATE INDEX "DataRetentionDryRun_dataRetentionPolicyId_createdAt_idx" ON "DataRetentionDryRun"("dataRetentionPolicyId", "createdAt");

-- CreateIndex
CREATE INDEX "DataRetentionDryRun_createdAt_idx" ON "DataRetentionDryRun"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DataSubjectRequest_publicId_key" ON "DataSubjectRequest"("publicId");

-- CreateIndex
CREATE INDEX "DataSubjectRequest_organizationId_status_submittedAt_idx" ON "DataSubjectRequest"("organizationId", "status", "submittedAt");

-- CreateIndex
CREATE INDEX "DataSubjectRequest_status_assignedToUserId_submittedAt_idx" ON "DataSubjectRequest"("status", "assignedToUserId", "submittedAt");

-- CreateIndex
CREATE INDEX "DataSubjectRequest_farmerId_submittedAt_idx" ON "DataSubjectRequest"("farmerId", "submittedAt");

-- CreateIndex
CREATE INDEX "DataSubjectRequest_userId_submittedAt_idx" ON "DataSubjectRequest"("userId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalIncident_incidentNumber_key" ON "OperationalIncident"("incidentNumber");

-- CreateIndex
CREATE INDEX "OperationalIncident_status_severity_detectedAt_idx" ON "OperationalIncident"("status", "severity", "detectedAt");

-- CreateIndex
CREATE INDEX "OperationalIncident_organizationId_status_detectedAt_idx" ON "OperationalIncident"("organizationId", "status", "detectedAt");

-- CreateIndex
CREATE INDEX "OperationalIncident_ownerUserId_status_idx" ON "OperationalIncident"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX "OperationalIncident_category_status_idx" ON "OperationalIncident"("category", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BackupVerificationRecord_backupReference_key" ON "BackupVerificationRecord"("backupReference");

-- CreateIndex
CREATE INDEX "BackupVerificationRecord_environment_status_startedAt_idx" ON "BackupVerificationRecord"("environment", "status", "startedAt");

-- CreateIndex
CREATE INDEX "BackupVerificationRecord_restoreStatus_restoreTestedAt_idx" ON "BackupVerificationRecord"("restoreStatus", "restoreTestedAt");

-- CreateIndex
CREATE INDEX "BackupVerificationRecord_verifiedByUserId_createdAt_idx" ON "BackupVerificationRecord"("verifiedByUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_deduplicationKey_key" ON "NotificationDelivery"("deduplicationKey");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_nextAttemptAt_createdAt_idx" ON "NotificationDelivery"("status", "nextAttemptAt", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_organizationId_status_createdAt_idx" ON "NotificationDelivery"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_recipientReference_createdAt_idx" ON "NotificationDelivery"("recipientReference", "createdAt");

-- CreateIndex
CREATE INDEX "FeatureFlag_scope_enabled_idx" ON "FeatureFlag"("scope", "enabled");

-- CreateIndex
CREATE INDEX "FeatureFlag_organizationId_enabled_idx" ON "FeatureFlag"("organizationId", "enabled");

-- CreateIndex
CREATE INDEX "FeatureFlag_changedByUserId_changedAt_idx" ON "FeatureFlag"("changedByUserId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlag_key_organizationId_key" ON "FeatureFlag"("key", "organizationId");

-- AddForeignKey
ALTER TABLE "PilotReadinessGate" ADD CONSTRAINT "PilotReadinessGate_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotReadinessGate" ADD CONSTRAINT "PilotReadinessGate_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotReadinessGateStatusEvent" ADD CONSTRAINT "PilotReadinessGateStatusEvent_readinessGateId_fkey" FOREIGN KEY ("readinessGateId") REFERENCES "PilotReadinessGate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotReadinessGateStatusEvent" ADD CONSTRAINT "PilotReadinessGateStatusEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataRetentionPolicy" ADD CONSTRAINT "DataRetentionPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataRetentionPolicy" ADD CONSTRAINT "DataRetentionPolicy_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataRetentionPolicy" ADD CONSTRAINT "DataRetentionPolicy_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataRetentionDryRun" ADD CONSTRAINT "DataRetentionDryRun_dataRetentionPolicyId_fkey" FOREIGN KEY ("dataRetentionPolicyId") REFERENCES "DataRetentionPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataSubjectRequest" ADD CONSTRAINT "DataSubjectRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataSubjectRequest" ADD CONSTRAINT "DataSubjectRequest_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataSubjectRequest" ADD CONSTRAINT "DataSubjectRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataSubjectRequest" ADD CONSTRAINT "DataSubjectRequest_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalIncident" ADD CONSTRAINT "OperationalIncident_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalIncident" ADD CONSTRAINT "OperationalIncident_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalIncident" ADD CONSTRAINT "OperationalIncident_reportedByUserId_fkey" FOREIGN KEY ("reportedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackupVerificationRecord" ADD CONSTRAINT "BackupVerificationRecord_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Platform-scoped records use NULL organization IDs, which require partial indexes for uniqueness.
CREATE UNIQUE INDEX "DataRetentionPolicy_platform_category_version_key"
ON "DataRetentionPolicy" ("dataCategory", "policyVersion")
WHERE "organizationId" IS NULL;

CREATE UNIQUE INDEX "FeatureFlag_platform_key_key"
ON "FeatureFlag" ("key")
WHERE "organizationId" IS NULL;

ALTER TABLE "PilotReadinessGate"
    ADD CONSTRAINT "PilotReadinessGate_review_fields" CHECK (("reviewedByUserId" IS NULL) = ("reviewedAt" IS NULL)),
    ADD CONSTRAINT "PilotReadinessGate_human_review" CHECK (NOT ("status" IN ('READY', 'NOT_APPLICABLE') AND "humanReviewRequired" AND "reviewedAt" IS NULL));

ALTER TABLE "PilotReadinessGateStatusEvent"
    ADD CONSTRAINT "PilotReadinessGateStatusEvent_transition" CHECK ("fromStatus" IS NULL OR "fromStatus" <> "toStatus");

ALTER TABLE "DataRetentionPolicy"
    ADD CONSTRAINT "DataRetentionPolicy_retention_positive" CHECK ("retentionDays" > 0),
    ADD CONSTRAINT "DataRetentionPolicy_archive_positive" CHECK ("archiveAfterDays" IS NULL OR ("archiveAfterDays" > 0 AND "archiveAfterDays" <= "retentionDays")),
    ADD CONSTRAINT "DataRetentionPolicy_version_positive" CHECK ("policyVersion" > 0),
    ADD CONSTRAINT "DataRetentionPolicy_effective_order" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"),
    ADD CONSTRAINT "DataRetentionPolicy_approval_fields" CHECK (("approvedByUserId" IS NULL) = ("approvedAt" IS NULL)),
    ADD CONSTRAINT "DataRetentionPolicy_active_approved" CHECK ("status" <> 'ACTIVE' OR "approvedAt" IS NOT NULL);

ALTER TABLE "DataRetentionDryRun"
    ADD CONSTRAINT "DataRetentionDryRun_counts_nonnegative" CHECK (
        "policyVersion" > 0 AND
        "eligibleForDeletion" >= 0 AND
        "eligibleForAnonymization" >= 0 AND
        "blockedByLegalHold" >= 0 AND
        "immutableRecordsRetained" >= 0 AND
        ("estimatedStorageBytes" IS NULL OR "estimatedStorageBytes" >= 0)
    );

ALTER TABLE "DataSubjectRequest"
    ADD CONSTRAINT "DataSubjectRequest_subject_consistency" CHECK (
        ("subjectType" = 'FARMER' AND "farmerId" IS NOT NULL AND "userId" IS NULL) OR
        ("subjectType" = 'USER' AND "userId" IS NOT NULL AND "farmerId" IS NULL)
    ),
    ADD CONSTRAINT "DataSubjectRequest_rejection_fields" CHECK (
        ("status" = 'REJECTED' AND "rejectedAt" IS NOT NULL AND "rejectionReason" IS NOT NULL) OR
        ("status" <> 'REJECTED' AND "rejectedAt" IS NULL)
    ),
    ADD CONSTRAINT "DataSubjectRequest_completion_fields" CHECK (
        ("status" IN ('FULFILLED', 'PARTIALLY_FULFILLED')) = ("completedAt" IS NOT NULL)
    );

ALTER TABLE "OperationalIncident"
    ADD CONSTRAINT "OperationalIncident_acknowledgement_order" CHECK ("acknowledgedAt" IS NULL OR "acknowledgedAt" >= "detectedAt"),
    ADD CONSTRAINT "OperationalIncident_resolution_fields" CHECK (
        ("status" IN ('RESOLVED', 'CLOSED') AND "resolvedAt" IS NOT NULL AND "resolutionSummary" IS NOT NULL) OR
        ("status" NOT IN ('RESOLVED', 'CLOSED') AND "resolvedAt" IS NULL)
    );

ALTER TABLE "BackupVerificationRecord"
    ADD CONSTRAINT "BackupVerificationRecord_size_nonnegative" CHECK ("sizeBytes" IS NULL OR "sizeBytes" >= 0),
    ADD CONSTRAINT "BackupVerificationRecord_completion_order" CHECK ("completedAt" IS NULL OR "completedAt" >= "startedAt"),
    ADD CONSTRAINT "BackupVerificationRecord_restore_fields" CHECK (("restoreTestedAt" IS NULL) = ("restoreStatus" IS NULL));

ALTER TABLE "NotificationDelivery"
    ADD CONSTRAINT "NotificationDelivery_version_positive" CHECK ("templateVersion" > 0),
    ADD CONSTRAINT "NotificationDelivery_attempts_nonnegative" CHECK ("attemptCount" >= 0),
    ADD CONSTRAINT "NotificationDelivery_provider_restricted" CHECK ("provider" IN ('console', 'mock'));

ALTER TABLE "FeatureFlag"
    ADD CONSTRAINT "FeatureFlag_scope_consistency" CHECK (
        ("scope" = 'PLATFORM' AND "organizationId" IS NULL) OR
        ("scope" = 'ORGANIZATION' AND "organizationId" IS NOT NULL)
    );

CREATE OR REPLACE FUNCTION phase_7_reject_mutation()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PilotReadinessGateStatusEvent_append_only"
BEFORE UPDATE OR DELETE ON "PilotReadinessGateStatusEvent"
FOR EACH ROW EXECUTE FUNCTION phase_7_reject_mutation();

CREATE TRIGGER "DataRetentionDryRun_append_only"
BEFORE UPDATE OR DELETE ON "DataRetentionDryRun"
FOR EACH ROW EXECUTE FUNCTION phase_7_reject_mutation();
