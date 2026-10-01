-- Commerce layer hardening (WP14).

CREATE TYPE "ExchangeRateSource" AS ENUM ('CENTRAL_BANK', 'COMMERCIAL_BANK', 'CONTRACT_FIXED', 'MANUAL');
CREATE TYPE "FarmerAdvanceStatus" AS ENUM ('OUTSTANDING', 'RECOVERED', 'WRITTEN_OFF');

-- Exchange rates are recorded, never updated. A correction is a new row.
CREATE TABLE "ExchangeRate" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "baseCurrency" CHAR(3) NOT NULL,
    "quoteCurrency" CHAR(3) NOT NULL,
    "rate" DECIMAL(20,8) NOT NULL,
    "source" "ExchangeRateSource" NOT NULL,
    "sourceReference" VARCHAR(300),
    "effectiveAt" TIMESTAMPTZ(3) NOT NULL,
    "recordedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_recordedByUserId_fkey"
    FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_rate_positive_check" CHECK ("rate" > 0);
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_distinct_currencies_check" CHECK ("baseCurrency" <> "quoteCurrency");

CREATE INDEX "ExchangeRate_baseCurrency_quoteCurrency_effectiveAt_idx" ON "ExchangeRate" ("baseCurrency", "quoteCurrency", "effectiveAt");
CREATE INDEX "ExchangeRate_organizationId_effectiveAt_idx" ON "ExchangeRate" ("organizationId", "effectiveAt");

CREATE TRIGGER "ExchangeRate_append_only"
BEFORE UPDATE OR DELETE ON "ExchangeRate"
FOR EACH ROW EXECUTE FUNCTION phase_6_reject_mutation();

-- A run converting between currencies pins the rate it used, so a later rate cannot move it.
ALTER TABLE "SettlementRun" ADD COLUMN "sourceCurrency" CHAR(3);
ALTER TABLE "SettlementRun" ADD COLUMN "exchangeRateId" UUID;
ALTER TABLE "SettlementRun" ADD COLUMN "exchangeRateApplied" DECIMAL(20,8);

ALTER TABLE "SettlementRun" ADD CONSTRAINT "SettlementRun_exchangeRateId_fkey"
    FOREIGN KEY ("exchangeRateId") REFERENCES "ExchangeRate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SettlementRun" ADD CONSTRAINT "SettlementRun_exchange_rate_required_check" CHECK (
    "sourceCurrency" IS NULL
    OR "sourceCurrency" = "currency"
    OR "exchangeRateId" IS NOT NULL
);
ALTER TABLE "SettlementRun" ADD CONSTRAINT "SettlementRun_exchange_rate_snapshot_check" CHECK (
    ("exchangeRateId" IS NULL) = ("exchangeRateApplied" IS NULL)
);

CREATE INDEX "SettlementRun_exchangeRateId_idx" ON "SettlementRun" ("exchangeRateId");

-- A settlement pays zero or more. Deductions that outrun the entitlement are carried, not dropped.
ALTER TABLE "FarmerSettlement" ADD COLUMN "carriedForwardMinor" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "FarmerSettlement" ADD CONSTRAINT "FarmerSettlement_net_non_negative_check" CHECK ("netEntitlementMinor" >= 0);
ALTER TABLE "FarmerSettlement" ADD CONSTRAINT "FarmerSettlement_carried_forward_non_negative_check" CHECK ("carriedForwardMinor" >= 0);
ALTER TABLE "FarmerSettlement" ADD CONSTRAINT "FarmerSettlement_gross_non_negative_check" CHECK ("grossEntitlementMinor" >= 0);
-- deductionsTotalMinor is what was actually taken, so carriedForwardMinor is not a second subtraction.
ALTER TABLE "FarmerSettlement" ADD CONSTRAINT "FarmerSettlement_identity_check" CHECK (
    "netEntitlementMinor" = "grossEntitlementMinor" - "deductionsTotalMinor" + "adjustmentsTotalMinor"
);
-- Nothing is carried unless the entitlement was exhausted first.
ALTER TABLE "FarmerSettlement" ADD CONSTRAINT "FarmerSettlement_carry_forward_exhausted_check" CHECK (
    "carriedForwardMinor" = 0 OR "netEntitlementMinor" = 0
);

CREATE TABLE "FarmerAdvance" (
    "id" UUID NOT NULL,
    "publicId" VARCHAR(128) NOT NULL,
    "organizationId" UUID NOT NULL,
    "farmerId" UUID NOT NULL,
    "status" "FarmerAdvanceStatus" NOT NULL DEFAULT 'OUTSTANDING',
    "currency" CHAR(3) NOT NULL,
    "issuedAmountMinor" BIGINT NOT NULL,
    "outstandingMinor" BIGINT NOT NULL,
    "reference" VARCHAR(160) NOT NULL,
    "issuedAt" TIMESTAMPTZ(3) NOT NULL,
    "issuedByUserId" UUID NOT NULL,
    "writtenOffAt" TIMESTAMPTZ(3),
    "writtenOffByUserId" UUID,
    "writeOffReason" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FarmerAdvance_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "FarmerAdvance" ADD CONSTRAINT "FarmerAdvance_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FarmerAdvance" ADD CONSTRAINT "FarmerAdvance_farmerId_fkey"
    FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FarmerAdvance" ADD CONSTRAINT "FarmerAdvance_issuedByUserId_fkey"
    FOREIGN KEY ("issuedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FarmerAdvance" ADD CONSTRAINT "FarmerAdvance_writtenOffByUserId_fkey"
    FOREIGN KEY ("writtenOffByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FarmerAdvance" ADD CONSTRAINT "FarmerAdvance_issued_positive_check" CHECK ("issuedAmountMinor" > 0);
ALTER TABLE "FarmerAdvance" ADD CONSTRAINT "FarmerAdvance_outstanding_range_check" CHECK (
    "outstandingMinor" >= 0 AND "outstandingMinor" <= "issuedAmountMinor"
);
ALTER TABLE "FarmerAdvance" ADD CONSTRAINT "FarmerAdvance_write_off_state_check" CHECK (
    ("writtenOffAt" IS NULL AND "writtenOffByUserId" IS NULL AND "writeOffReason" IS NULL)
    OR ("writtenOffAt" IS NOT NULL AND "writtenOffByUserId" IS NOT NULL AND "writeOffReason" IS NOT NULL)
);

CREATE UNIQUE INDEX "FarmerAdvance_publicId_key" ON "FarmerAdvance" ("publicId");
CREATE UNIQUE INDEX "FarmerAdvance_organizationId_reference_key" ON "FarmerAdvance" ("organizationId", "reference");
CREATE INDEX "FarmerAdvance_farmerId_status_issuedAt_idx" ON "FarmerAdvance" ("farmerId", "status", "issuedAt");
CREATE INDEX "FarmerAdvance_organizationId_status_idx" ON "FarmerAdvance" ("organizationId", "status");

CREATE TABLE "FarmerAdvanceRecovery" (
    "id" UUID NOT NULL,
    "farmerAdvanceId" UUID NOT NULL,
    "settlementDeductionId" UUID NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "outstandingAfterMinor" BIGINT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FarmerAdvanceRecovery_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "FarmerAdvanceRecovery" ADD CONSTRAINT "FarmerAdvanceRecovery_farmerAdvanceId_fkey"
    FOREIGN KEY ("farmerAdvanceId") REFERENCES "FarmerAdvance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FarmerAdvanceRecovery" ADD CONSTRAINT "FarmerAdvanceRecovery_settlementDeductionId_fkey"
    FOREIGN KEY ("settlementDeductionId") REFERENCES "SettlementDeduction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FarmerAdvanceRecovery" ADD CONSTRAINT "FarmerAdvanceRecovery_amount_positive_check" CHECK ("amountMinor" > 0);
ALTER TABLE "FarmerAdvanceRecovery" ADD CONSTRAINT "FarmerAdvanceRecovery_outstanding_after_non_negative_check" CHECK ("outstandingAfterMinor" >= 0);

CREATE UNIQUE INDEX "FarmerAdvanceRecovery_settlementDeductionId_key" ON "FarmerAdvanceRecovery" ("settlementDeductionId");
CREATE INDEX "FarmerAdvanceRecovery_farmerAdvanceId_createdAt_idx" ON "FarmerAdvanceRecovery" ("farmerAdvanceId", "createdAt");

CREATE TRIGGER "FarmerAdvanceRecovery_append_only"
BEFORE UPDATE OR DELETE ON "FarmerAdvanceRecovery"
FOR EACH ROW EXECUTE FUNCTION phase_6_reject_mutation();

-- The approved-settlement guard predates carriedForwardMinor; extend it to cover the new column.
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
        NEW."carriedForwardMinor" IS DISTINCT FROM OLD."carriedForwardMinor" OR
        NEW."netEntitlementMinor" IS DISTINCT FROM OLD."netEntitlementMinor" OR
        NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt"
    ) THEN
        RAISE EXCEPTION 'Approved farmer settlement financial data is immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- The rate is pinned at calculation; approving must not let it drift.
CREATE OR REPLACE FUNCTION phase_6_preserve_approved_settlement()
RETURNS trigger AS $$
BEGIN
    IF OLD."status" IN ('APPROVED', 'PAYMENT_IN_PROGRESS', 'PARTIALLY_PAID', 'PAID') AND (
        NEW."organizationId" IS DISTINCT FROM OLD."organizationId" OR
        NEW."currency" IS DISTINCT FROM OLD."currency" OR
        NEW."sourceCurrency" IS DISTINCT FROM OLD."sourceCurrency" OR
        NEW."exchangeRateId" IS DISTINCT FROM OLD."exchangeRateId" OR
        NEW."exchangeRateApplied" IS DISTINCT FROM OLD."exchangeRateApplied" OR
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
