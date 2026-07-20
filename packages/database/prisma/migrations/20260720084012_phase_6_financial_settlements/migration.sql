-- CreateEnum
CREATE TYPE "SaleProceedsStatus" AS ENUM ('DRAFT', 'RECORDED', 'VERIFIED', 'PARTIALLY_RECEIVED', 'REVERSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SaleProceedsSource" AS ENUM ('MANUAL_EXTERNAL_REFERENCE', 'BANK_STATEMENT', 'MOBILE_MONEY_STATEMENT', 'PAYMENT_PROVIDER', 'OTHER');

-- CreateEnum
CREATE TYPE "SettlementRunStatus" AS ENUM ('DRAFT', 'CALCULATING', 'CALCULATED', 'EXCEPTIONS_PENDING', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PAYMENT_IN_PROGRESS', 'PARTIALLY_PAID', 'PAID', 'FAILED', 'CANCELLED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "SettlementAllocationMethod" AS ENUM ('PROPORTIONAL_BY_ACCEPTED_QUANTITY', 'PROPORTIONAL_BY_CONTRIBUTION_VALUE', 'CONTRACTUAL_FIXED_RATE');

-- CreateEnum
CREATE TYPE "FarmerSettlementStatus" AS ENUM ('DRAFT', 'CALCULATED', 'EXCEPTION', 'APPROVED', 'CANCELLED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "FarmerSettlementPaymentStatus" AS ENUM ('NOT_INSTRUCTED', 'INSTRUCTION_PENDING', 'INSTRUCTED', 'PROCESSING', 'PARTIALLY_PAID', 'PAID', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "DeductionPolicyType" AS ENUM ('FIXED_AMOUNT', 'PERCENTAGE', 'PER_QUANTITY_UNIT');

-- CreateEnum
CREATE TYPE "DeductionPolicyBasis" AS ENUM ('GROSS_ENTITLEMENT', 'DELIVERED_QUANTITY', 'ACCEPTED_QUANTITY');

-- CreateEnum
CREATE TYPE "DeductionPolicyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "SettlementDeductionSource" AS ENUM ('POLICY', 'MANUAL_ADJUSTMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "SettlementExceptionSeverity" AS ENUM ('INFO', 'WARNING', 'BLOCKING');

-- CreateEnum
CREATE TYPE "SettlementExceptionStatus" AS ENUM ('OPEN', 'RESOLVED', 'WAIVED');

-- CreateEnum
CREATE TYPE "FarmerPaymentMethodType" AS ENUM ('MOBILE_MONEY', 'BANK_ACCOUNT', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "FarmerPaymentMethodStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "PaymentInstructionStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'QUEUED', 'SUBMITTED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REVERSED', 'REQUIRES_REVIEW');

-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('CREATED', 'SUBMITTED', 'PENDING', 'SUCCESSFUL', 'FAILED', 'TIMED_OUT', 'UNKNOWN', 'REVERSED');

-- CreateEnum
CREATE TYPE "PaymentReconciliationSource" AS ENUM ('MANUAL', 'PROVIDER_CALLBACK', 'PROVIDER_QUERY', 'BANK_STATEMENT', 'MOBILE_MONEY_STATEMENT');

-- CreateEnum
CREATE TYPE "PaymentReconciliationStatus" AS ENUM ('UNMATCHED', 'POSSIBLE_MATCH', 'MATCHED', 'CONFIRMED', 'REJECTED', 'DUPLICATE', 'REVERSED');

-- CreateEnum
CREATE TYPE "FarmerStatementStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'VOID');

-- AlterEnum
ALTER TYPE "ConsentType" ADD VALUE 'SETTLEMENT_DEDUCTION';

-- AlterTable
ALTER TABLE "BuyerAcceptance" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "FarmerBatchContribution" ADD COLUMN     "reversalReason" VARCHAR(500),
ADD COLUMN     "reversedAt" TIMESTAMPTZ(3),
ADD COLUMN     "reversedByUserId" UUID;

-- CreateTable
CREATE TABLE "SaleProceedsRecord" (
    "id" UUID NOT NULL,
    "publicId" VARCHAR(128) NOT NULL,
    "proceedsNumber" VARCHAR(80) NOT NULL,
    "organizationId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "buyerOrganizationId" UUID NOT NULL,
    "status" "SaleProceedsStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" CHAR(3) NOT NULL,
    "expectedAmountMinor" BIGINT NOT NULL,
    "recordedAmountMinor" BIGINT NOT NULL,
    "source" "SaleProceedsSource" NOT NULL,
    "externalReference" VARCHAR(255),
    "valueDate" DATE,
    "recordedByUserId" UUID NOT NULL,
    "verifiedByUserId" UUID,
    "verifiedAt" TIMESTAMPTZ(3),
    "reversedAt" TIMESTAMPTZ(3),
    "reversalReason" VARCHAR(500),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancellationReason" VARCHAR(500),
    "notes" VARCHAR(1000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SaleProceedsRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementRun" (
    "id" UUID NOT NULL,
    "publicId" VARCHAR(128) NOT NULL,
    "settlementNumber" VARCHAR(80) NOT NULL,
    "organizationId" UUID NOT NULL,
    "status" "SettlementRunStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" CHAR(3) NOT NULL,
    "allocationMethod" "SettlementAllocationMethod" NOT NULL DEFAULT 'PROPORTIONAL_BY_ACCEPTED_QUANTITY',
    "calculationVersion" VARCHAR(40) NOT NULL,
    "roundingPolicyVersion" VARCHAR(40) NOT NULL,
    "sourceTotalMinor" BIGINT NOT NULL DEFAULT 0,
    "grossAllocatedMinor" BIGINT NOT NULL DEFAULT 0,
    "deductionsTotalMinor" BIGINT NOT NULL DEFAULT 0,
    "adjustmentsTotalMinor" BIGINT NOT NULL DEFAULT 0,
    "netSettlementTotalMinor" BIGINT NOT NULL DEFAULT 0,
    "roundingResidualMinor" BIGINT NOT NULL DEFAULT 0,
    "lineageSnapshotHash" VARCHAR(128),
    "calculationSnapshot" JSONB,
    "calculatedAt" TIMESTAMPTZ(3),
    "calculatedByUserId" UUID,
    "submittedForApprovalAt" TIMESTAMPTZ(3),
    "submittedByUserId" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "approvedByUserId" UUID,
    "rejectedAt" TIMESTAMPTZ(3),
    "rejectedByUserId" UUID,
    "rejectionReason" VARCHAR(500),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancellationReason" VARCHAR(500),
    "supersedesSettlementRunId" UUID,
    "supersededBySettlementRunId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SettlementRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementRunStatusEvent" (
    "id" UUID NOT NULL,
    "settlementRunId" UUID NOT NULL,
    "fromStatus" "SettlementRunStatus",
    "toStatus" "SettlementRunStatus" NOT NULL,
    "reason" VARCHAR(500),
    "actorUserId" UUID NOT NULL,
    "actorOrganizationId" UUID NOT NULL,
    "metadata" JSONB NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettlementRunStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementRunOrder" (
    "id" UUID NOT NULL,
    "settlementRunId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "buyerAcceptanceId" UUID NOT NULL,
    "saleProceedsRecordId" UUID NOT NULL,
    "acceptedQuantity" DECIMAL(18,4) NOT NULL,
    "quantityUnit" "QuantityUnit" NOT NULL DEFAULT 'KG',
    "allocatableAmountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "sourceVersion" INTEGER NOT NULL,
    "acceptanceSourceVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettlementRunOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementAllocation" (
    "id" UUID NOT NULL,
    "settlementRunId" UUID NOT NULL,
    "settlementRunOrderId" UUID NOT NULL,
    "farmerId" UUID NOT NULL,
    "deliveryId" UUID NOT NULL,
    "lotId" UUID NOT NULL,
    "attributableQuantity" DECIMAL(18,4) NOT NULL,
    "quantityUnit" "QuantityUnit" NOT NULL DEFAULT 'KG',
    "allocationRatioNumerator" BIGINT NOT NULL,
    "allocationRatioDenominator" BIGINT NOT NULL,
    "exactAmountRepresentation" VARCHAR(255) NOT NULL,
    "allocatedGrossAmountMinor" BIGINT NOT NULL,
    "roundingAdjustmentMinor" BIGINT NOT NULL DEFAULT 0,
    "calculationMetadata" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettlementAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FarmerSettlement" (
    "id" UUID NOT NULL,
    "publicId" VARCHAR(128) NOT NULL,
    "farmerSettlementNumber" VARCHAR(80) NOT NULL,
    "settlementRunId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "farmerId" UUID NOT NULL,
    "status" "FarmerSettlementStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" CHAR(3) NOT NULL,
    "grossEntitlementMinor" BIGINT NOT NULL,
    "deductionsTotalMinor" BIGINT NOT NULL DEFAULT 0,
    "adjustmentsTotalMinor" BIGINT NOT NULL DEFAULT 0,
    "netEntitlementMinor" BIGINT NOT NULL,
    "statementVersion" INTEGER NOT NULL DEFAULT 0,
    "approvedAt" TIMESTAMPTZ(3),
    "paymentStatus" "FarmerSettlementPaymentStatus" NOT NULL DEFAULT 'NOT_INSTRUCTED',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FarmerSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeductionPolicy" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "type" "DeductionPolicyType" NOT NULL,
    "basis" "DeductionPolicyBasis" NOT NULL,
    "value" DECIMAL(20,8) NOT NULL,
    "currency" CHAR(3),
    "maximumAmountMinor" BIGINT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "status" "DeductionPolicyStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "policyVersion" INTEGER NOT NULL,
    "requiresFarmerConsent" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" UUID NOT NULL,
    "approvedByUserId" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DeductionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementDeduction" (
    "id" UUID NOT NULL,
    "farmerSettlementId" UUID NOT NULL,
    "deductionPolicyId" UUID,
    "code" VARCHAR(80) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "basisAmountMinor" BIGINT,
    "basisQuantity" DECIMAL(18,4),
    "rate" DECIMAL(20,8),
    "amountMinor" BIGINT NOT NULL,
    "reason" VARCHAR(500),
    "source" "SettlementDeductionSource" NOT NULL,
    "createdByUserId" UUID,
    "approvedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettlementDeduction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementException" (
    "id" UUID NOT NULL,
    "settlementRunId" UUID NOT NULL,
    "farmerSettlementId" UUID,
    "orderId" UUID,
    "code" VARCHAR(120) NOT NULL,
    "severity" "SettlementExceptionSeverity" NOT NULL,
    "status" "SettlementExceptionStatus" NOT NULL DEFAULT 'OPEN',
    "waivable" BOOLEAN NOT NULL DEFAULT true,
    "message" VARCHAR(1000) NOT NULL,
    "details" JSONB NOT NULL,
    "resolvedByUserId" UUID,
    "resolvedAt" TIMESTAMPTZ(3),
    "resolution" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SettlementException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FarmerPaymentMethod" (
    "id" UUID NOT NULL,
    "farmerId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "type" "FarmerPaymentMethodType" NOT NULL,
    "provider" VARCHAR(120) NOT NULL,
    "accountHolderName" VARCHAR(200) NOT NULL,
    "accountIdentifierEncrypted" TEXT,
    "accountIdentifierLast4" VARCHAR(4),
    "status" "FarmerPaymentMethodStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMPTZ(3),
    "verifiedByUserId" UUID,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "FarmerPaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentProviderConfiguration" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "provider" VARCHAR(120) NOT NULL,
    "configurationReference" VARCHAR(255),
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PaymentProviderConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentInstruction" (
    "id" UUID NOT NULL,
    "publicId" VARCHAR(128) NOT NULL,
    "instructionNumber" VARCHAR(80) NOT NULL,
    "organizationId" UUID NOT NULL,
    "farmerSettlementId" UUID NOT NULL,
    "farmerId" UUID NOT NULL,
    "paymentMethodId" UUID NOT NULL,
    "status" "PaymentInstructionStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" CHAR(3) NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "provider" VARCHAR(120) NOT NULL,
    "providerConfigurationId" UUID,
    "idempotencyKey" VARCHAR(255) NOT NULL,
    "scheduledFor" TIMESTAMPTZ(3),
    "createdByUserId" UUID NOT NULL,
    "approvedByUserId" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "submittedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "failedAt" TIMESTAMPTZ(3),
    "failureCode" VARCHAR(120),
    "failureMessage" VARCHAR(500),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PaymentInstruction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" UUID NOT NULL,
    "paymentInstructionId" UUID NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "provider" VARCHAR(120) NOT NULL,
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'CREATED',
    "providerRequestReference" VARCHAR(255),
    "providerTransactionReference" VARCHAR(255),
    "providerStatus" VARCHAR(120),
    "submittedAt" TIMESTAMPTZ(3),
    "confirmedAt" TIMESTAMPTZ(3),
    "failedAt" TIMESTAMPTZ(3),
    "errorCode" VARCHAR(120),
    "errorMessage" VARCHAR(500),
    "nextRetryAt" TIMESTAMPTZ(3),
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentReconciliation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "paymentInstructionId" UUID NOT NULL,
    "paymentAttemptId" UUID,
    "source" "PaymentReconciliationSource" NOT NULL,
    "externalReference" VARCHAR(255) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "valueDate" DATE NOT NULL,
    "status" "PaymentReconciliationStatus" NOT NULL DEFAULT 'UNMATCHED',
    "evidenceMetadata" JSONB NOT NULL,
    "matchedByUserId" UUID,
    "reviewedByUserId" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "notes" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PaymentReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FarmerStatement" (
    "id" UUID NOT NULL,
    "publicId" VARCHAR(128) NOT NULL,
    "statementNumber" VARCHAR(80) NOT NULL,
    "farmerSettlementId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "FarmerStatementStatus" NOT NULL DEFAULT 'ACTIVE',
    "issuedAt" TIMESTAMPTZ(3) NOT NULL,
    "issuedByUserId" UUID NOT NULL,
    "documentKey" VARCHAR(500),
    "checksum" VARCHAR(128) NOT NULL,
    "supersededById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FarmerStatement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SaleProceedsRecord_publicId_key" ON "SaleProceedsRecord"("publicId");

-- CreateIndex
CREATE INDEX "SaleProceedsRecord_organizationId_status_createdAt_idx" ON "SaleProceedsRecord"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SaleProceedsRecord_orderId_status_idx" ON "SaleProceedsRecord"("orderId", "status");

-- CreateIndex
CREATE INDEX "SaleProceedsRecord_buyerOrganizationId_status_valueDate_idx" ON "SaleProceedsRecord"("buyerOrganizationId", "status", "valueDate");

-- CreateIndex
CREATE UNIQUE INDEX "SaleProceedsRecord_organizationId_proceedsNumber_key" ON "SaleProceedsRecord"("organizationId", "proceedsNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SaleProceedsRecord_organizationId_source_externalReference_key" ON "SaleProceedsRecord"("organizationId", "source", "externalReference");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementRun_publicId_key" ON "SettlementRun"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementRun_supersedesSettlementRunId_key" ON "SettlementRun"("supersedesSettlementRunId");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementRun_supersededBySettlementRunId_key" ON "SettlementRun"("supersededBySettlementRunId");

-- CreateIndex
CREATE INDEX "SettlementRun_organizationId_status_createdAt_idx" ON "SettlementRun"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SettlementRun_status_submittedForApprovalAt_idx" ON "SettlementRun"("status", "submittedForApprovalAt");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementRun_organizationId_settlementNumber_key" ON "SettlementRun"("organizationId", "settlementNumber");

-- CreateIndex
CREATE INDEX "SettlementRunStatusEvent_settlementRunId_occurredAt_idx" ON "SettlementRunStatusEvent"("settlementRunId", "occurredAt");

-- CreateIndex
CREATE INDEX "SettlementRunStatusEvent_actorOrganizationId_occurredAt_idx" ON "SettlementRunStatusEvent"("actorOrganizationId", "occurredAt");

-- CreateIndex
CREATE INDEX "SettlementRunOrder_orderId_createdAt_idx" ON "SettlementRunOrder"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "SettlementRunOrder_buyerAcceptanceId_createdAt_idx" ON "SettlementRunOrder"("buyerAcceptanceId", "createdAt");

-- CreateIndex
CREATE INDEX "SettlementRunOrder_saleProceedsRecordId_idx" ON "SettlementRunOrder"("saleProceedsRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementRunOrder_settlementRunId_buyerAcceptanceId_key" ON "SettlementRunOrder"("settlementRunId", "buyerAcceptanceId");

-- CreateIndex
CREATE INDEX "SettlementAllocation_settlementRunId_farmerId_idx" ON "SettlementAllocation"("settlementRunId", "farmerId");

-- CreateIndex
CREATE INDEX "SettlementAllocation_farmerId_deliveryId_idx" ON "SettlementAllocation"("farmerId", "deliveryId");

-- CreateIndex
CREATE INDEX "SettlementAllocation_lotId_idx" ON "SettlementAllocation"("lotId");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementAllocation_settlementRunOrderId_deliveryId_key" ON "SettlementAllocation"("settlementRunOrderId", "deliveryId");

-- CreateIndex
CREATE UNIQUE INDEX "FarmerSettlement_publicId_key" ON "FarmerSettlement"("publicId");

-- CreateIndex
CREATE INDEX "FarmerSettlement_organizationId_status_paymentStatus_create_idx" ON "FarmerSettlement"("organizationId", "status", "paymentStatus", "createdAt");

-- CreateIndex
CREATE INDEX "FarmerSettlement_farmerId_createdAt_idx" ON "FarmerSettlement"("farmerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FarmerSettlement_settlementRunId_farmerId_key" ON "FarmerSettlement"("settlementRunId", "farmerId");

-- CreateIndex
CREATE UNIQUE INDEX "FarmerSettlement_organizationId_farmerSettlementNumber_key" ON "FarmerSettlement"("organizationId", "farmerSettlementNumber");

-- CreateIndex
CREATE INDEX "DeductionPolicy_organizationId_status_effectiveFrom_effecti_idx" ON "DeductionPolicy"("organizationId", "status", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "DeductionPolicy_organizationId_code_policyVersion_idx" ON "DeductionPolicy"("organizationId", "code", "policyVersion");

-- CreateIndex
CREATE UNIQUE INDEX "DeductionPolicy_organizationId_code_policyVersion_key" ON "DeductionPolicy"("organizationId", "code", "policyVersion");

-- CreateIndex
CREATE INDEX "SettlementDeduction_farmerSettlementId_createdAt_idx" ON "SettlementDeduction"("farmerSettlementId", "createdAt");

-- CreateIndex
CREATE INDEX "SettlementDeduction_deductionPolicyId_idx" ON "SettlementDeduction"("deductionPolicyId");

-- CreateIndex
CREATE INDEX "SettlementException_settlementRunId_status_severity_idx" ON "SettlementException"("settlementRunId", "status", "severity");

-- CreateIndex
CREATE INDEX "SettlementException_farmerSettlementId_status_idx" ON "SettlementException"("farmerSettlementId", "status");

-- CreateIndex
CREATE INDEX "SettlementException_orderId_code_idx" ON "SettlementException"("orderId", "code");

-- CreateIndex
CREATE INDEX "FarmerPaymentMethod_organizationId_farmerId_status_idx" ON "FarmerPaymentMethod"("organizationId", "farmerId", "status");

-- CreateIndex
CREATE INDEX "FarmerPaymentMethod_farmerId_isDefault_status_idx" ON "FarmerPaymentMethod"("farmerId", "isDefault", "status");

-- CreateIndex
CREATE INDEX "PaymentProviderConfiguration_organizationId_enabled_idx" ON "PaymentProviderConfiguration"("organizationId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProviderConfiguration_organizationId_provider_key" ON "PaymentProviderConfiguration"("organizationId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentInstruction_publicId_key" ON "PaymentInstruction"("publicId");

-- CreateIndex
CREATE INDEX "PaymentInstruction_organizationId_status_createdAt_idx" ON "PaymentInstruction"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentInstruction_farmerSettlementId_status_idx" ON "PaymentInstruction"("farmerSettlementId", "status");

-- CreateIndex
CREATE INDEX "PaymentInstruction_farmerId_status_idx" ON "PaymentInstruction"("farmerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentInstruction_organizationId_instructionNumber_key" ON "PaymentInstruction"("organizationId", "instructionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentInstruction_organizationId_idempotencyKey_key" ON "PaymentInstruction"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentAttempt_provider_providerTransactionReference_idx" ON "PaymentAttempt"("provider", "providerTransactionReference");

-- CreateIndex
CREATE INDEX "PaymentAttempt_status_nextRetryAt_idx" ON "PaymentAttempt"("status", "nextRetryAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_paymentInstructionId_attemptNumber_key" ON "PaymentAttempt"("paymentInstructionId", "attemptNumber");

-- CreateIndex
CREATE INDEX "PaymentReconciliation_organizationId_status_valueDate_idx" ON "PaymentReconciliation"("organizationId", "status", "valueDate");

-- CreateIndex
CREATE INDEX "PaymentReconciliation_paymentInstructionId_status_idx" ON "PaymentReconciliation"("paymentInstructionId", "status");

-- CreateIndex
CREATE INDEX "PaymentReconciliation_paymentAttemptId_idx" ON "PaymentReconciliation"("paymentAttemptId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReconciliation_organizationId_source_externalReferen_key" ON "PaymentReconciliation"("organizationId", "source", "externalReference");

-- CreateIndex
CREATE UNIQUE INDEX "FarmerStatement_publicId_key" ON "FarmerStatement"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "FarmerStatement_supersededById_key" ON "FarmerStatement"("supersededById");

-- CreateIndex
CREATE INDEX "FarmerStatement_farmerSettlementId_status_issuedAt_idx" ON "FarmerStatement"("farmerSettlementId", "status", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FarmerStatement_farmerSettlementId_version_key" ON "FarmerStatement"("farmerSettlementId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "FarmerStatement_farmerSettlementId_statementNumber_key" ON "FarmerStatement"("farmerSettlementId", "statementNumber");

-- CreateIndex
CREATE INDEX "FarmerBatchContribution_reversedAt_idx" ON "FarmerBatchContribution"("reversedAt");

-- AddForeignKey
ALTER TABLE "FarmerBatchContribution" ADD CONSTRAINT "FarmerBatchContribution_reversedByUserId_fkey" FOREIGN KEY ("reversedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleProceedsRecord" ADD CONSTRAINT "SaleProceedsRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleProceedsRecord" ADD CONSTRAINT "SaleProceedsRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleProceedsRecord" ADD CONSTRAINT "SaleProceedsRecord_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "SalesContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleProceedsRecord" ADD CONSTRAINT "SaleProceedsRecord_buyerOrganizationId_fkey" FOREIGN KEY ("buyerOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleProceedsRecord" ADD CONSTRAINT "SaleProceedsRecord_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleProceedsRecord" ADD CONSTRAINT "SaleProceedsRecord_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementRun" ADD CONSTRAINT "SettlementRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementRun" ADD CONSTRAINT "SettlementRun_calculatedByUserId_fkey" FOREIGN KEY ("calculatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementRun" ADD CONSTRAINT "SettlementRun_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementRun" ADD CONSTRAINT "SettlementRun_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementRun" ADD CONSTRAINT "SettlementRun_rejectedByUserId_fkey" FOREIGN KEY ("rejectedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementRun" ADD CONSTRAINT "SettlementRun_supersedesSettlementRunId_fkey" FOREIGN KEY ("supersedesSettlementRunId") REFERENCES "SettlementRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementRun" ADD CONSTRAINT "SettlementRun_supersededBySettlementRunId_fkey" FOREIGN KEY ("supersededBySettlementRunId") REFERENCES "SettlementRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementRunStatusEvent" ADD CONSTRAINT "SettlementRunStatusEvent_settlementRunId_fkey" FOREIGN KEY ("settlementRunId") REFERENCES "SettlementRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementRunStatusEvent" ADD CONSTRAINT "SettlementRunStatusEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementRunStatusEvent" ADD CONSTRAINT "SettlementRunStatusEvent_actorOrganizationId_fkey" FOREIGN KEY ("actorOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementRunOrder" ADD CONSTRAINT "SettlementRunOrder_settlementRunId_fkey" FOREIGN KEY ("settlementRunId") REFERENCES "SettlementRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementRunOrder" ADD CONSTRAINT "SettlementRunOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementRunOrder" ADD CONSTRAINT "SettlementRunOrder_buyerAcceptanceId_fkey" FOREIGN KEY ("buyerAcceptanceId") REFERENCES "BuyerAcceptance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementRunOrder" ADD CONSTRAINT "SettlementRunOrder_saleProceedsRecordId_fkey" FOREIGN KEY ("saleProceedsRecordId") REFERENCES "SaleProceedsRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementAllocation" ADD CONSTRAINT "SettlementAllocation_settlementRunId_fkey" FOREIGN KEY ("settlementRunId") REFERENCES "SettlementRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementAllocation" ADD CONSTRAINT "SettlementAllocation_settlementRunOrderId_fkey" FOREIGN KEY ("settlementRunOrderId") REFERENCES "SettlementRunOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementAllocation" ADD CONSTRAINT "SettlementAllocation_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementAllocation" ADD CONSTRAINT "SettlementAllocation_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementAllocation" ADD CONSTRAINT "SettlementAllocation_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "CooperativeLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmerSettlement" ADD CONSTRAINT "FarmerSettlement_settlementRunId_fkey" FOREIGN KEY ("settlementRunId") REFERENCES "SettlementRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmerSettlement" ADD CONSTRAINT "FarmerSettlement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmerSettlement" ADD CONSTRAINT "FarmerSettlement_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeductionPolicy" ADD CONSTRAINT "DeductionPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeductionPolicy" ADD CONSTRAINT "DeductionPolicy_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeductionPolicy" ADD CONSTRAINT "DeductionPolicy_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementDeduction" ADD CONSTRAINT "SettlementDeduction_farmerSettlementId_fkey" FOREIGN KEY ("farmerSettlementId") REFERENCES "FarmerSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementDeduction" ADD CONSTRAINT "SettlementDeduction_deductionPolicyId_fkey" FOREIGN KEY ("deductionPolicyId") REFERENCES "DeductionPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementDeduction" ADD CONSTRAINT "SettlementDeduction_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementDeduction" ADD CONSTRAINT "SettlementDeduction_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementException" ADD CONSTRAINT "SettlementException_settlementRunId_fkey" FOREIGN KEY ("settlementRunId") REFERENCES "SettlementRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementException" ADD CONSTRAINT "SettlementException_farmerSettlementId_fkey" FOREIGN KEY ("farmerSettlementId") REFERENCES "FarmerSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementException" ADD CONSTRAINT "SettlementException_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementException" ADD CONSTRAINT "SettlementException_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmerPaymentMethod" ADD CONSTRAINT "FarmerPaymentMethod_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmerPaymentMethod" ADD CONSTRAINT "FarmerPaymentMethod_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmerPaymentMethod" ADD CONSTRAINT "FarmerPaymentMethod_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmerPaymentMethod" ADD CONSTRAINT "FarmerPaymentMethod_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProviderConfiguration" ADD CONSTRAINT "PaymentProviderConfiguration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentInstruction" ADD CONSTRAINT "PaymentInstruction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentInstruction" ADD CONSTRAINT "PaymentInstruction_farmerSettlementId_fkey" FOREIGN KEY ("farmerSettlementId") REFERENCES "FarmerSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentInstruction" ADD CONSTRAINT "PaymentInstruction_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentInstruction" ADD CONSTRAINT "PaymentInstruction_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "FarmerPaymentMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentInstruction" ADD CONSTRAINT "PaymentInstruction_providerConfigurationId_fkey" FOREIGN KEY ("providerConfigurationId") REFERENCES "PaymentProviderConfiguration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentInstruction" ADD CONSTRAINT "PaymentInstruction_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentInstruction" ADD CONSTRAINT "PaymentInstruction_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_paymentInstructionId_fkey" FOREIGN KEY ("paymentInstructionId") REFERENCES "PaymentInstruction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReconciliation" ADD CONSTRAINT "PaymentReconciliation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReconciliation" ADD CONSTRAINT "PaymentReconciliation_paymentInstructionId_fkey" FOREIGN KEY ("paymentInstructionId") REFERENCES "PaymentInstruction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReconciliation" ADD CONSTRAINT "PaymentReconciliation_paymentAttemptId_fkey" FOREIGN KEY ("paymentAttemptId") REFERENCES "PaymentAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReconciliation" ADD CONSTRAINT "PaymentReconciliation_matchedByUserId_fkey" FOREIGN KEY ("matchedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReconciliation" ADD CONSTRAINT "PaymentReconciliation_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmerStatement" ADD CONSTRAINT "FarmerStatement_farmerSettlementId_fkey" FOREIGN KEY ("farmerSettlementId") REFERENCES "FarmerSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmerStatement" ADD CONSTRAINT "FarmerStatement_issuedByUserId_fkey" FOREIGN KEY ("issuedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmerStatement" ADD CONSTRAINT "FarmerStatement_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "FarmerStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Phase 6 financial invariants.
ALTER TABLE "BuyerAcceptance"
    ADD CONSTRAINT "BuyerAcceptance_version_positive" CHECK ("version" > 0);

ALTER TABLE "FarmerBatchContribution"
    ADD CONSTRAINT "FarmerBatchContribution_reversal_fields_check" CHECK (
        ("reversedAt" IS NULL AND "reversalReason" IS NULL AND "reversedByUserId" IS NULL)
        OR ("reversedAt" IS NOT NULL AND "reversalReason" IS NOT NULL AND "reversedByUserId" IS NOT NULL)
    );

ALTER TABLE "SaleProceedsRecord"
    ADD CONSTRAINT "SaleProceedsRecord_money_nonnegative" CHECK ("expectedAmountMinor" >= 0 AND "recordedAmountMinor" >= 0),
    ADD CONSTRAINT "SaleProceedsRecord_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$'),
    ADD CONSTRAINT "SaleProceedsRecord_version_positive" CHECK ("version" > 0),
    ADD CONSTRAINT "SaleProceedsRecord_distinct_verifier" CHECK ("verifiedByUserId" IS NULL OR "verifiedByUserId" <> "recordedByUserId"),
    ADD CONSTRAINT "SaleProceedsRecord_verification_fields" CHECK (("verifiedByUserId" IS NULL) = ("verifiedAt" IS NULL)),
    ADD CONSTRAINT "SaleProceedsRecord_reversal_fields" CHECK (("reversedAt" IS NULL) = ("reversalReason" IS NULL)),
    ADD CONSTRAINT "SaleProceedsRecord_cancellation_fields" CHECK (("cancelledAt" IS NULL) = ("cancellationReason" IS NULL));

ALTER TABLE "SettlementRun"
    ADD CONSTRAINT "SettlementRun_money_nonnegative" CHECK (
        "sourceTotalMinor" >= 0 AND "grossAllocatedMinor" >= 0 AND
        "deductionsTotalMinor" >= 0 AND "netSettlementTotalMinor" >= 0
    ),
    ADD CONSTRAINT "SettlementRun_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$'),
    ADD CONSTRAINT "SettlementRun_version_positive" CHECK ("version" > 0),
    ADD CONSTRAINT "SettlementRun_mvp_allocation_method" CHECK ("allocationMethod" = 'PROPORTIONAL_BY_ACCEPTED_QUANTITY'),
    ADD CONSTRAINT "SettlementRun_distinct_approver" CHECK ("approvedByUserId" IS NULL OR "approvedByUserId" <> "calculatedByUserId"),
    ADD CONSTRAINT "SettlementRun_distinct_submitter_approver" CHECK ("approvedByUserId" IS NULL OR "approvedByUserId" <> "submittedByUserId"),
    ADD CONSTRAINT "SettlementRun_approval_fields" CHECK (("approvedByUserId" IS NULL) = ("approvedAt" IS NULL)),
    ADD CONSTRAINT "SettlementRun_rejection_fields" CHECK (("rejectedAt" IS NULL AND "rejectedByUserId" IS NULL AND "rejectionReason" IS NULL) OR ("rejectedAt" IS NOT NULL AND "rejectedByUserId" IS NOT NULL AND "rejectionReason" IS NOT NULL)),
    ADD CONSTRAINT "SettlementRun_cancellation_fields" CHECK (("cancelledAt" IS NULL) = ("cancellationReason" IS NULL)),
    ADD CONSTRAINT "SettlementRun_not_self_superseding" CHECK (
        ("supersedesSettlementRunId" IS NULL OR "supersedesSettlementRunId" <> "id") AND
        ("supersededBySettlementRunId" IS NULL OR "supersededBySettlementRunId" <> "id")
    );

ALTER TABLE "SettlementRunOrder"
    ADD CONSTRAINT "SettlementRunOrder_quantity_positive" CHECK ("acceptedQuantity" > 0),
    ADD CONSTRAINT "SettlementRunOrder_money_nonnegative" CHECK ("allocatableAmountMinor" >= 0),
    ADD CONSTRAINT "SettlementRunOrder_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$'),
    ADD CONSTRAINT "SettlementRunOrder_versions_positive" CHECK ("sourceVersion" > 0 AND "acceptanceSourceVersion" > 0);

ALTER TABLE "SettlementAllocation"
    ADD CONSTRAINT "SettlementAllocation_quantity_positive" CHECK ("attributableQuantity" > 0),
    ADD CONSTRAINT "SettlementAllocation_ratio_positive" CHECK ("allocationRatioNumerator" > 0 AND "allocationRatioDenominator" > 0),
    ADD CONSTRAINT "SettlementAllocation_money_nonnegative" CHECK ("allocatedGrossAmountMinor" >= 0);

ALTER TABLE "FarmerSettlement"
    ADD CONSTRAINT "FarmerSettlement_money_nonnegative" CHECK (
        "grossEntitlementMinor" >= 0 AND "deductionsTotalMinor" >= 0 AND "netEntitlementMinor" >= 0
    ),
    ADD CONSTRAINT "FarmerSettlement_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$'),
    ADD CONSTRAINT "FarmerSettlement_statement_version_nonnegative" CHECK ("statementVersion" >= 0);

ALTER TABLE "DeductionPolicy"
    ADD CONSTRAINT "DeductionPolicy_value_nonnegative" CHECK ("value" >= 0),
    ADD CONSTRAINT "DeductionPolicy_percentage_bounded" CHECK ("type" <> 'PERCENTAGE' OR "value" <= 100),
    ADD CONSTRAINT "DeductionPolicy_maximum_nonnegative" CHECK ("maximumAmountMinor" IS NULL OR "maximumAmountMinor" >= 0),
    ADD CONSTRAINT "DeductionPolicy_priority_nonnegative" CHECK ("priority" >= 0),
    ADD CONSTRAINT "DeductionPolicy_version_positive" CHECK ("policyVersion" > 0),
    ADD CONSTRAINT "DeductionPolicy_currency_format" CHECK ("currency" IS NULL OR "currency" ~ '^[A-Z]{3}$'),
    ADD CONSTRAINT "DeductionPolicy_effective_dates" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"),
    ADD CONSTRAINT "DeductionPolicy_distinct_approver" CHECK ("approvedByUserId" IS NULL OR "approvedByUserId" <> "createdByUserId"),
    ADD CONSTRAINT "DeductionPolicy_approval_fields" CHECK (("approvedByUserId" IS NULL) = ("approvedAt" IS NULL));

ALTER TABLE "SettlementDeduction"
    ADD CONSTRAINT "SettlementDeduction_basis_nonnegative" CHECK (("basisAmountMinor" IS NULL OR "basisAmountMinor" >= 0) AND ("basisQuantity" IS NULL OR "basisQuantity" > 0)),
    ADD CONSTRAINT "SettlementDeduction_rate_nonnegative" CHECK ("rate" IS NULL OR "rate" >= 0),
    ADD CONSTRAINT "SettlementDeduction_amount_nonnegative" CHECK ("amountMinor" >= 0),
    ADD CONSTRAINT "SettlementDeduction_distinct_approver" CHECK ("approvedByUserId" IS NULL OR "createdByUserId" IS NULL OR "approvedByUserId" <> "createdByUserId");

ALTER TABLE "FarmerPaymentMethod"
    ADD CONSTRAINT "FarmerPaymentMethod_identifier_shape" CHECK (
        ("type" = 'CASH' AND "accountIdentifierEncrypted" IS NULL AND "accountIdentifierLast4" IS NULL)
        OR ("type" <> 'CASH' AND "accountIdentifierEncrypted" IS NOT NULL AND "accountIdentifierLast4" ~ '^[0-9A-Za-z]{4}$')
    ),
    ADD CONSTRAINT "FarmerPaymentMethod_distinct_verifier" CHECK ("verifiedByUserId" IS NULL OR "verifiedByUserId" <> "createdByUserId"),
    ADD CONSTRAINT "FarmerPaymentMethod_verification_fields" CHECK (("verifiedByUserId" IS NULL) = ("verifiedAt" IS NULL));

ALTER TABLE "PaymentProviderConfiguration"
    ADD CONSTRAINT "PaymentProviderConfiguration_allowed_provider" CHECK ("provider" IN ('manual', 'mock'));

ALTER TABLE "PaymentInstruction"
    ADD CONSTRAINT "PaymentInstruction_amount_positive" CHECK ("amountMinor" > 0),
    ADD CONSTRAINT "PaymentInstruction_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$'),
    ADD CONSTRAINT "PaymentInstruction_version_positive" CHECK ("version" > 0),
    ADD CONSTRAINT "PaymentInstruction_allowed_provider" CHECK ("provider" IN ('manual', 'mock')),
    ADD CONSTRAINT "PaymentInstruction_distinct_approver" CHECK ("approvedByUserId" IS NULL OR "approvedByUserId" <> "createdByUserId"),
    ADD CONSTRAINT "PaymentInstruction_approval_fields" CHECK (("approvedByUserId" IS NULL) = ("approvedAt" IS NULL));

ALTER TABLE "PaymentAttempt"
    ADD CONSTRAINT "PaymentAttempt_number_positive" CHECK ("attemptNumber" > 0),
    ADD CONSTRAINT "PaymentAttempt_allowed_provider" CHECK ("provider" IN ('manual', 'mock')),
    ADD CONSTRAINT "PaymentAttempt_confirmation_order" CHECK ("confirmedAt" IS NULL OR ("submittedAt" IS NOT NULL AND "confirmedAt" >= "submittedAt"));

ALTER TABLE "PaymentReconciliation"
    ADD CONSTRAINT "PaymentReconciliation_amount_positive" CHECK ("amountMinor" > 0),
    ADD CONSTRAINT "PaymentReconciliation_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$'),
    ADD CONSTRAINT "PaymentReconciliation_distinct_reviewer" CHECK ("reviewedByUserId" IS NULL OR "matchedByUserId" IS NULL OR "reviewedByUserId" <> "matchedByUserId"),
    ADD CONSTRAINT "PaymentReconciliation_review_fields" CHECK (("reviewedByUserId" IS NULL) = ("reviewedAt" IS NULL));

ALTER TABLE "FarmerStatement"
    ADD CONSTRAINT "FarmerStatement_version_positive" CHECK ("version" > 0),
    ADD CONSTRAINT "FarmerStatement_not_self_superseding" CHECK ("supersededById" IS NULL OR "supersededById" <> "id"),
    ADD CONSTRAINT "FarmerStatement_checksum_format" CHECK ("checksum" ~ '^sha256:[a-f0-9]{64}$');

-- Calculated allocations, status history, deductions, and statements are append-only.
CREATE OR REPLACE FUNCTION phase_6_reject_mutation()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "SettlementRunStatusEvent_append_only"
BEFORE UPDATE OR DELETE ON "SettlementRunStatusEvent"
FOR EACH ROW EXECUTE FUNCTION phase_6_reject_mutation();

CREATE TRIGGER "SettlementRunOrder_append_only"
BEFORE UPDATE OR DELETE ON "SettlementRunOrder"
FOR EACH ROW EXECUTE FUNCTION phase_6_reject_mutation();

CREATE TRIGGER "SettlementAllocation_append_only"
BEFORE UPDATE OR DELETE ON "SettlementAllocation"
FOR EACH ROW EXECUTE FUNCTION phase_6_reject_mutation();

CREATE TRIGGER "SettlementDeduction_append_only"
BEFORE UPDATE OR DELETE ON "SettlementDeduction"
FOR EACH ROW EXECUTE FUNCTION phase_6_reject_mutation();

CREATE TRIGGER "FarmerStatement_append_only"
BEFORE UPDATE OR DELETE ON "FarmerStatement"
FOR EACH ROW EXECUTE FUNCTION phase_6_reject_mutation();

CREATE OR REPLACE FUNCTION phase_6_preserve_approved_settlement()
RETURNS trigger AS $$
BEGIN
    IF OLD."status" IN ('APPROVED', 'PAYMENT_IN_PROGRESS', 'PARTIALLY_PAID', 'PAID') AND (
        NEW."organizationId" IS DISTINCT FROM OLD."organizationId" OR
        NEW."currency" IS DISTINCT FROM OLD."currency" OR
        NEW."allocationMethod" IS DISTINCT FROM OLD."allocationMethod" OR
        NEW."calculationVersion" IS DISTINCT FROM OLD."calculationVersion" OR
        NEW."roundingPolicyVersion" IS DISTINCT FROM OLD."roundingPolicyVersion" OR
        NEW."sourceTotalMinor" IS DISTINCT FROM OLD."sourceTotalMinor" OR
        NEW."grossAllocatedMinor" IS DISTINCT FROM OLD."grossAllocatedMinor" OR
        NEW."deductionsTotalMinor" IS DISTINCT FROM OLD."deductionsTotalMinor" OR
        NEW."adjustmentsTotalMinor" IS DISTINCT FROM OLD."adjustmentsTotalMinor" OR
        NEW."netSettlementTotalMinor" IS DISTINCT FROM OLD."netSettlementTotalMinor" OR
        NEW."roundingResidualMinor" IS DISTINCT FROM OLD."roundingResidualMinor" OR
        NEW."lineageSnapshotHash" IS DISTINCT FROM OLD."lineageSnapshotHash" OR
        NEW."calculationSnapshot" IS DISTINCT FROM OLD."calculationSnapshot" OR
        NEW."calculatedAt" IS DISTINCT FROM OLD."calculatedAt" OR
        NEW."calculatedByUserId" IS DISTINCT FROM OLD."calculatedByUserId" OR
        NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt" OR
        NEW."approvedByUserId" IS DISTINCT FROM OLD."approvedByUserId"
    ) THEN
        RAISE EXCEPTION 'Approved settlement financial data is immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "SettlementRun_preserve_approved_financials"
BEFORE UPDATE ON "SettlementRun"
FOR EACH ROW EXECUTE FUNCTION phase_6_preserve_approved_settlement();

CREATE OR REPLACE FUNCTION phase_6_preserve_approved_farmer_settlement()
RETURNS trigger AS $$
BEGIN
    IF OLD."status" = 'APPROVED' AND (
        NEW."settlementRunId" IS DISTINCT FROM OLD."settlementRunId" OR
        NEW."organizationId" IS DISTINCT FROM OLD."organizationId" OR
        NEW."farmerId" IS DISTINCT FROM OLD."farmerId" OR
        NEW."currency" IS DISTINCT FROM OLD."currency" OR
        NEW."grossEntitlementMinor" IS DISTINCT FROM OLD."grossEntitlementMinor" OR
        NEW."deductionsTotalMinor" IS DISTINCT FROM OLD."deductionsTotalMinor" OR
        NEW."adjustmentsTotalMinor" IS DISTINCT FROM OLD."adjustmentsTotalMinor" OR
        NEW."netEntitlementMinor" IS DISTINCT FROM OLD."netEntitlementMinor" OR
        NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt"
    ) THEN
        RAISE EXCEPTION 'Approved farmer settlement financial data is immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FarmerSettlement_preserve_approved_financials"
BEFORE UPDATE ON "FarmerSettlement"
FOR EACH ROW EXECUTE FUNCTION phase_6_preserve_approved_farmer_settlement();

CREATE OR REPLACE FUNCTION phase_6_preserve_terminal_payment_attempt()
RETURNS trigger AS $$
BEGIN
    IF OLD."status" IN ('SUCCESSFUL', 'FAILED', 'REVERSED') THEN
        RAISE EXCEPTION 'Terminal payment attempt evidence is immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PaymentAttempt_preserve_terminal_evidence"
BEFORE UPDATE OR DELETE ON "PaymentAttempt"
FOR EACH ROW EXECUTE FUNCTION phase_6_preserve_terminal_payment_attempt();
