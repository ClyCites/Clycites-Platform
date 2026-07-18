CREATE TYPE "OutboxEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

CREATE TABLE "SystemSetting" (
    "id" UUID NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OutboxEvent" (
    "id" UUID NOT NULL,
    "aggregateType" VARCHAR(128) NOT NULL,
    "aggregateId" UUID NOT NULL,
    "eventType" VARCHAR(128) NOT NULL,
    "schemaVersion" VARCHAR(32) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxEventStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3),
    "processedAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IdempotencyRecord" (
    "id" UUID NOT NULL,
    "scopeId" VARCHAR(128) NOT NULL DEFAULT 'global',
    "idempotencyKey" VARCHAR(255) NOT NULL,
    "requestFingerprint" VARCHAR(128) NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key");
CREATE INDEX "OutboxEvent_status_nextAttemptAt_createdAt_idx" ON "OutboxEvent"("status", "nextAttemptAt", "createdAt");
CREATE INDEX "OutboxEvent_aggregateType_aggregateId_createdAt_idx" ON "OutboxEvent"("aggregateType", "aggregateId", "createdAt");
CREATE INDEX "OutboxEvent_eventType_createdAt_idx" ON "OutboxEvent"("eventType", "createdAt");
CREATE UNIQUE INDEX "IdempotencyRecord_scopeId_idempotencyKey_key" ON "IdempotencyRecord"("scopeId", "idempotencyKey");
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");
CREATE INDEX "IdempotencyRecord_requestFingerprint_idx" ON "IdempotencyRecord"("requestFingerprint");
