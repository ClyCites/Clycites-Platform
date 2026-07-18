-- CreateEnum
CREATE TYPE "HederaAnchorProvider" AS ENUM ('MOCK', 'SDK');

-- CreateEnum
CREATE TYPE "HederaNetwork" AS ENUM ('LOCAL', 'TESTNET', 'PREVIEWNET', 'MAINNET');

-- CreateEnum
CREATE TYPE "HederaAnchorStatus" AS ENUM ('PENDING', 'QUEUED', 'SUBMITTING', 'SUBMITTED', 'CONFIRMING', 'CONFIRMED', 'RETRYABLE_FAILURE', 'PERMANENT_FAILURE', 'MISMATCH', 'SUPERSEDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HederaAnchorAttemptOperation" AS ENUM ('SUBMIT', 'CONFIRM', 'VERIFY', 'RECONCILE');

-- CreateEnum
CREATE TYPE "HederaAnchorAttemptStatus" AS ENUM ('STARTED', 'SUCCEEDED', 'FAILED', 'TIMED_OUT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AnchorVerificationType" AS ENUM ('AUTOMATIC', 'MANUAL_PRIVATE', 'MANUAL_PUBLIC', 'RECONCILIATION');

-- CreateEnum
CREATE TYPE "AnchorVerificationStatus" AS ENUM ('VERIFIED', 'PENDING', 'NOT_CONFIRMED', 'MISMATCH', 'MISSING', 'SUPERSEDED', 'ERROR');

-- CreateEnum
CREATE TYPE "AnchorChainStatus" AS ENUM ('VALID', 'BROKEN', 'NOT_APPLICABLE', 'UNKNOWN');

-- CreateTable
CREATE TABLE "TraceabilityEvent" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "outboxEventId" UUID NOT NULL,
    "entityType" VARCHAR(80) NOT NULL,
    "entityId" UUID NOT NULL,
    "eventType" VARCHAR(120) NOT NULL,
    "schemaVersion" VARCHAR(32) NOT NULL,
    "canonicalPayload" JSONB NOT NULL,
    "canonicalPayloadHash" VARCHAR(80) NOT NULL,
    "previousEventHash" VARCHAR(80),
    "chainPosition" INTEGER NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TraceabilityEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TraceabilityEvent_chainPosition_positive" CHECK ("chainPosition" > 0),
    CONSTRAINT "TraceabilityEvent_payloadHash_format" CHECK ("canonicalPayloadHash" ~ '^sha256:[a-f0-9]{64}$'),
    CONSTRAINT "TraceabilityEvent_previousHash_format" CHECK ("previousEventHash" IS NULL OR "previousEventHash" ~ '^sha256:[a-f0-9]{64}$')
);

-- CreateTable
CREATE TABLE "HederaAnchor" (
    "id" UUID NOT NULL,
    "anchorEventId" UUID NOT NULL,
    "traceabilityEventId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "entityType" VARCHAR(80) NOT NULL,
    "entityId" UUID NOT NULL,
    "eventType" VARCHAR(120) NOT NULL,
    "schemaVersion" VARCHAR(32) NOT NULL,
    "canonicalPayloadHash" VARCHAR(80) NOT NULL,
    "previousEventHash" VARCHAR(80),
    "privacyReferenceVersion" VARCHAR(32) NOT NULL,
    "provider" "HederaAnchorProvider" NOT NULL,
    "network" "HederaNetwork" NOT NULL,
    "topicId" VARCHAR(128),
    "status" "HederaAnchorStatus" NOT NULL DEFAULT 'PENDING',
    "submissionTransactionId" VARCHAR(256),
    "submissionTransactionHash" VARCHAR(256),
    "topicSequenceNumber" BIGINT,
    "consensusTimestamp" VARCHAR(64),
    "runningHash" VARCHAR(256),
    "runningHashVersion" BIGINT,
    "submittedAt" TIMESTAMPTZ(3),
    "confirmedAt" TIMESTAMPTZ(3),
    "supersedesAnchorId" UUID,
    "lastErrorCode" VARCHAR(120),
    "lastErrorMessage" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "HederaAnchor_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "HederaAnchor_payloadHash_format" CHECK ("canonicalPayloadHash" ~ '^sha256:[a-f0-9]{64}$'),
    CONSTRAINT "HederaAnchor_previousHash_format" CHECK ("previousEventHash" IS NULL OR "previousEventHash" ~ '^sha256:[a-f0-9]{64}$'),
    CONSTRAINT "HederaAnchor_provider_network_match" CHECK (("provider" = 'MOCK' AND "network" = 'LOCAL') OR ("provider" = 'SDK' AND "network" <> 'LOCAL')),
    CONSTRAINT "HederaAnchor_sequence_positive" CHECK ("topicSequenceNumber" IS NULL OR "topicSequenceNumber" > 0),
    CONSTRAINT "HederaAnchor_runningHashVersion_nonnegative" CHECK ("runningHashVersion" IS NULL OR "runningHashVersion" >= 0),
    CONSTRAINT "HederaAnchor_not_self_superseding" CHECK ("supersedesAnchorId" IS NULL OR "supersedesAnchorId" <> "id"),
    CONSTRAINT "HederaAnchor_confirmed_fields_present" CHECK ("status" NOT IN ('CONFIRMED', 'SUPERSEDED') OR ("topicId" IS NOT NULL AND "submissionTransactionId" IS NOT NULL AND "topicSequenceNumber" IS NOT NULL AND "consensusTimestamp" IS NOT NULL AND "submittedAt" IS NOT NULL AND "confirmedAt" IS NOT NULL))
);

-- CreateTable
CREATE TABLE "HederaAnchorAttempt" (
    "id" UUID NOT NULL,
    "anchorId" UUID NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "operation" "HederaAnchorAttemptOperation" NOT NULL,
    "status" "HederaAnchorAttemptStatus" NOT NULL,
    "provider" "HederaAnchorProvider" NOT NULL,
    "network" "HederaNetwork" NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "transactionId" VARCHAR(256),
    "errorCode" VARCHAR(120),
    "errorCategory" VARCHAR(80),
    "errorMessage" VARCHAR(500),
    "retryAt" TIMESTAMPTZ(3),
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HederaAnchorAttempt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "HederaAnchorAttempt_attemptNumber_positive" CHECK ("attemptNumber" > 0),
    CONSTRAINT "HederaAnchorAttempt_completion_order" CHECK ("completedAt" IS NULL OR "completedAt" >= "startedAt")
);

-- CreateTable
CREATE TABLE "HederaTopicCheckpoint" (
    "id" UUID NOT NULL,
    "provider" "HederaAnchorProvider" NOT NULL,
    "network" "HederaNetwork" NOT NULL,
    "topicId" VARCHAR(128) NOT NULL,
    "lastSequenceNumber" BIGINT NOT NULL,
    "lastConsensusTimestamp" VARCHAR(64) NOT NULL,
    "lastRunningHash" VARCHAR(256),
    "checkedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "HederaTopicCheckpoint_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "HederaTopicCheckpoint_sequence_nonnegative" CHECK ("lastSequenceNumber" >= 0)
);

-- CreateTable
CREATE TABLE "AnchorVerification" (
    "id" UUID NOT NULL,
    "anchorId" UUID NOT NULL,
    "verificationType" "AnchorVerificationType" NOT NULL,
    "status" "AnchorVerificationStatus" NOT NULL,
    "calculatedPayloadHash" VARCHAR(80) NOT NULL,
    "expectedPayloadHash" VARCHAR(80) NOT NULL,
    "mirrorPayloadHash" VARCHAR(80),
    "chainStatus" "AnchorChainStatus" NOT NULL,
    "verifiedAt" TIMESTAMPTZ(3) NOT NULL,
    "requestedByUserId" UUID,
    "requestId" VARCHAR(128),
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnchorVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TraceabilityEvent_outboxEventId_key" ON "TraceabilityEvent"("outboxEventId");

-- CreateIndex
CREATE INDEX "TraceabilityEvent_organizationId_eventType_occurredAt_idx" ON "TraceabilityEvent"("organizationId", "eventType", "occurredAt");

-- CreateIndex
CREATE INDEX "TraceabilityEvent_organizationId_entityType_entityId_occurr_idx" ON "TraceabilityEvent"("organizationId", "entityType", "entityId", "occurredAt");

-- CreateIndex
CREATE INDEX "TraceabilityEvent_canonicalPayloadHash_idx" ON "TraceabilityEvent"("canonicalPayloadHash");

-- CreateIndex
CREATE UNIQUE INDEX "TraceabilityEvent_organizationId_entityType_entityId_chainP_key" ON "TraceabilityEvent"("organizationId", "entityType", "entityId", "chainPosition");

-- CreateIndex
CREATE UNIQUE INDEX "HederaAnchor_anchorEventId_key" ON "HederaAnchor"("anchorEventId");

-- CreateIndex
CREATE UNIQUE INDEX "HederaAnchor_traceabilityEventId_key" ON "HederaAnchor"("traceabilityEventId");

-- CreateIndex
CREATE UNIQUE INDEX "HederaAnchor_supersedesAnchorId_key" ON "HederaAnchor"("supersedesAnchorId");

-- CreateIndex
CREATE INDEX "HederaAnchor_organizationId_status_createdAt_idx" ON "HederaAnchor"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "HederaAnchor_organizationId_entityType_entityId_createdAt_idx" ON "HederaAnchor"("organizationId", "entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "HederaAnchor_status_createdAt_idx" ON "HederaAnchor"("status", "createdAt");

-- CreateIndex
CREATE INDEX "HederaAnchor_topicId_topicSequenceNumber_idx" ON "HederaAnchor"("topicId", "topicSequenceNumber");

-- CreateIndex
CREATE INDEX "HederaAnchor_consensusTimestamp_idx" ON "HederaAnchor"("consensusTimestamp");

-- CreateIndex
CREATE INDEX "HederaAnchor_submissionTransactionId_idx" ON "HederaAnchor"("submissionTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "HederaAnchor_provider_network_topicId_topicSequenceNumber_key" ON "HederaAnchor"("provider", "network", "topicId", "topicSequenceNumber");

-- CreateIndex
CREATE INDEX "HederaAnchorAttempt_anchorId_startedAt_idx" ON "HederaAnchorAttempt"("anchorId", "startedAt");

-- CreateIndex
CREATE INDEX "HederaAnchorAttempt_status_retryAt_idx" ON "HederaAnchorAttempt"("status", "retryAt");

-- CreateIndex
CREATE UNIQUE INDEX "HederaAnchorAttempt_anchorId_operation_attemptNumber_key" ON "HederaAnchorAttempt"("anchorId", "operation", "attemptNumber");

-- CreateIndex
CREATE INDEX "HederaTopicCheckpoint_topicId_lastSequenceNumber_idx" ON "HederaTopicCheckpoint"("topicId", "lastSequenceNumber");

-- CreateIndex
CREATE INDEX "HederaTopicCheckpoint_checkedAt_idx" ON "HederaTopicCheckpoint"("checkedAt");

-- CreateIndex
CREATE UNIQUE INDEX "HederaTopicCheckpoint_provider_network_topicId_key" ON "HederaTopicCheckpoint"("provider", "network", "topicId");

-- CreateIndex
CREATE INDEX "AnchorVerification_anchorId_verifiedAt_idx" ON "AnchorVerification"("anchorId", "verifiedAt");

-- CreateIndex
CREATE INDEX "AnchorVerification_status_verifiedAt_idx" ON "AnchorVerification"("status", "verifiedAt");

-- CreateIndex
CREATE INDEX "AnchorVerification_requestedByUserId_verifiedAt_idx" ON "AnchorVerification"("requestedByUserId", "verifiedAt");

-- CreateIndex
CREATE INDEX "AnchorVerification_requestId_idx" ON "AnchorVerification"("requestId");

-- AddForeignKey
ALTER TABLE "TraceabilityEvent" ADD CONSTRAINT "TraceabilityEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraceabilityEvent" ADD CONSTRAINT "TraceabilityEvent_outboxEventId_fkey" FOREIGN KEY ("outboxEventId") REFERENCES "OutboxEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HederaAnchor" ADD CONSTRAINT "HederaAnchor_traceabilityEventId_fkey" FOREIGN KEY ("traceabilityEventId") REFERENCES "TraceabilityEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HederaAnchor" ADD CONSTRAINT "HederaAnchor_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HederaAnchor" ADD CONSTRAINT "HederaAnchor_supersedesAnchorId_fkey" FOREIGN KEY ("supersedesAnchorId") REFERENCES "HederaAnchor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HederaAnchorAttempt" ADD CONSTRAINT "HederaAnchorAttempt_anchorId_fkey" FOREIGN KEY ("anchorId") REFERENCES "HederaAnchor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnchorVerification" ADD CONSTRAINT "AnchorVerification_anchorId_fkey" FOREIGN KEY ("anchorId") REFERENCES "HederaAnchor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnchorVerification" ADD CONSTRAINT "AnchorVerification_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Immutable traceability and verification history cannot be removed or rewritten.
CREATE FUNCTION "prevent_hedera_history_mutation"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TraceabilityEvent_append_only"
BEFORE UPDATE OR DELETE ON "TraceabilityEvent"
FOR EACH ROW EXECUTE FUNCTION "prevent_hedera_history_mutation"();

CREATE TRIGGER "AnchorVerification_append_only"
BEFORE UPDATE OR DELETE ON "AnchorVerification"
FOR EACH ROW EXECUTE FUNCTION "prevent_hedera_history_mutation"();

CREATE FUNCTION "protect_hedera_anchor_history"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'HederaAnchor is append-only';
    END IF;

    IF OLD."status" IN ('CONFIRMED', 'SUPERSEDED') AND NOT (
        OLD."status" = 'CONFIRMED'
        AND NEW."status" = 'SUPERSEDED'
        AND NEW."id" = OLD."id"
        AND NEW."anchorEventId" = OLD."anchorEventId"
        AND NEW."traceabilityEventId" = OLD."traceabilityEventId"
        AND NEW."organizationId" = OLD."organizationId"
        AND NEW."entityType" = OLD."entityType"
        AND NEW."entityId" = OLD."entityId"
        AND NEW."eventType" = OLD."eventType"
        AND NEW."schemaVersion" = OLD."schemaVersion"
        AND NEW."canonicalPayloadHash" = OLD."canonicalPayloadHash"
        AND NEW."previousEventHash" IS NOT DISTINCT FROM OLD."previousEventHash"
        AND NEW."privacyReferenceVersion" = OLD."privacyReferenceVersion"
        AND NEW."provider" = OLD."provider"
        AND NEW."network" = OLD."network"
        AND NEW."topicId" = OLD."topicId"
        AND NEW."submissionTransactionId" = OLD."submissionTransactionId"
        AND NEW."submissionTransactionHash" IS NOT DISTINCT FROM OLD."submissionTransactionHash"
        AND NEW."topicSequenceNumber" = OLD."topicSequenceNumber"
        AND NEW."consensusTimestamp" = OLD."consensusTimestamp"
        AND NEW."runningHash" IS NOT DISTINCT FROM OLD."runningHash"
        AND NEW."runningHashVersion" IS NOT DISTINCT FROM OLD."runningHashVersion"
        AND NEW."submittedAt" = OLD."submittedAt"
        AND NEW."confirmedAt" = OLD."confirmedAt"
        AND NEW."supersedesAnchorId" IS NOT DISTINCT FROM OLD."supersedesAnchorId"
        AND NEW."lastErrorCode" IS NOT DISTINCT FROM OLD."lastErrorCode"
        AND NEW."lastErrorMessage" IS NOT DISTINCT FROM OLD."lastErrorMessage"
        AND NEW."createdAt" = OLD."createdAt"
    ) THEN
        RAISE EXCEPTION 'Confirmed HederaAnchor evidence is immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "HederaAnchor_preserve_history"
BEFORE UPDATE OR DELETE ON "HederaAnchor"
FOR EACH ROW EXECUTE FUNCTION "protect_hedera_anchor_history"();
