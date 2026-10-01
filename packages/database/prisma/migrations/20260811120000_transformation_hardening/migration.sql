-- Expected conversion ranges, yield and loss accounting, weight provenance, and
-- supersession for batch transformations.

CREATE TYPE "ConversionBasis" AS ENUM ('MASS', 'VOLUME');
CREATE TYPE "ConversionSource" AS ENUM ('LITERATURE_ESTIMATE', 'MEASURED_LOCAL', 'REGULATORY');
CREATE TYPE "TransformationYieldFlagReason" AS ENUM ('YIELD_OUT_OF_RANGE', 'YIELD_UNVERIFIABLE');
CREATE TYPE "TransformationLossReason" AS ENUM (
  'WATER_LOSS', 'PULP_REMOVAL', 'HULLING_BYPRODUCT', 'SORTING_REJECT', 'SHRINKAGE', 'SPILLAGE', 'OTHER'
);

CREATE TABLE "CommodityFormConversion" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "commodityId" UUID NOT NULL,
    "fromFormId" UUID NOT NULL,
    "toFormId" UUID NOT NULL,
    "minRatio" DECIMAL(12,6) NOT NULL,
    "maxRatio" DECIMAL(12,6) NOT NULL,
    "basis" "ConversionBasis" NOT NULL DEFAULT 'MASS',
    "source" "ConversionSource" NOT NULL DEFAULT 'LITERATURE_ESTIMATE',
    "sourceReference" VARCHAR(300),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "CommodityFormConversion_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CommodityFormConversion"
  ADD CONSTRAINT "CommodityFormConversion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CommodityFormConversion_commodityId_fkey" FOREIGN KEY ("commodityId") REFERENCES "Commodity"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CommodityFormConversion_fromFormId_fkey" FOREIGN KEY ("fromFormId") REFERENCES "CommodityForm"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CommodityFormConversion_toFormId_fkey" FOREIGN KEY ("toFormId") REFERENCES "CommodityForm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CommodityFormConversion"
  ADD CONSTRAINT "CommodityFormConversion_ratio_range_check" CHECK ("minRatio" > 0 AND "maxRatio" >= "minRatio"),
  ADD CONSTRAINT "CommodityFormConversion_distinct_forms_check" CHECK ("fromFormId" <> "toFormId");

CREATE INDEX "CommodityFormConversion_commodityId_fromFormId_toFormId_idx"
  ON "CommodityFormConversion"("commodityId", "fromFormId", "toFormId");

-- NULL organizationId marks the platform default. Postgres does not treat NULLs as
-- equal, so the default needs its own partial unique index to stay singular.
CREATE UNIQUE INDEX "CommodityFormConversion_platform_default_key"
  ON "CommodityFormConversion"("commodityId", "fromFormId", "toFormId")
  WHERE "organizationId" IS NULL;
CREATE UNIQUE INDEX "CommodityFormConversion_organization_key"
  ON "CommodityFormConversion"("organizationId", "commodityId", "fromFormId", "toFormId")
  WHERE "organizationId" IS NOT NULL;

ALTER TABLE "BatchTransformation"
  ADD COLUMN "yieldRatio" DECIMAL(12,6),
  ADD COLUMN "yieldFlagged" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "yieldFlagReason" "TransformationYieldFlagReason",
  ADD COLUMN "conversionId" UUID,
  ADD COLUMN "lossQuantity" DECIMAL(18,4),
  ADD COLUMN "lossReason" "TransformationLossReason",
  ADD COLUMN "lossNote" VARCHAR(500),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "supersedesTransformationId" UUID,
  ADD COLUMN "supersededAt" TIMESTAMPTZ(3),
  ADD COLUMN "supersededByUserId" UUID,
  ADD COLUMN "supersessionReason" VARCHAR(500);

ALTER TABLE "BatchTransformation"
  ADD CONSTRAINT "BatchTransformation_conversionId_fkey" FOREIGN KEY ("conversionId") REFERENCES "CommodityFormConversion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BatchTransformation_supersedesTransformationId_fkey" FOREIGN KEY ("supersedesTransformationId") REFERENCES "BatchTransformation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BatchTransformation_supersededByUserId_fkey" FOREIGN KEY ("supersededByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "BatchTransformation_supersedesTransformationId_key"
  ON "BatchTransformation"("supersedesTransformationId");
CREATE INDEX "BatchTransformation_organizationId_yieldFlagged_completedAt_idx"
  ON "BatchTransformation"("organizationId", "yieldFlagged", "completedAt");
CREATE INDEX "BatchTransformation_supersededAt_idx" ON "BatchTransformation"("supersededAt");

ALTER TABLE "BatchTransformation"
  ADD CONSTRAINT "BatchTransformation_version_positive" CHECK ("version" > 0),
  -- A flag needs a reason and a reason needs a flag.
  ADD CONSTRAINT "BatchTransformation_yield_flag_check" CHECK (
    ("yieldFlagged" = true AND "yieldFlagReason" IS NOT NULL)
    OR ("yieldFlagged" = false AND "yieldFlagReason" IS NULL)
  ),
  -- An unexplained OTHER tells a reader nothing, so it must carry a note.
  ADD CONSTRAINT "BatchTransformation_loss_note_check" CHECK (
    "lossReason" IS DISTINCT FROM 'OTHER' OR "lossNote" IS NOT NULL
  ),
  ADD CONSTRAINT "BatchTransformation_supersession_state" CHECK (
    ("supersededAt" IS NULL AND "supersededByUserId" IS NULL AND "supersessionReason" IS NULL)
    OR ("supersededAt" IS NOT NULL AND "supersededByUserId" IS NOT NULL AND "supersessionReason" IS NOT NULL)
  );

ALTER TABLE "BatchTransformationInput"
  ADD COLUMN "captureMethod" "MeasurementCaptureMethod" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "reportedInstrumentId" UUID,
  ADD COLUMN "instrumentId" UUID,
  ADD COLUMN "instrumentFlagged" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "instrumentFlagReason" VARCHAR(80) DEFAULT 'INSTRUMENT_NOT_RECORDED',
  ADD COLUMN "recordedByUserId" UUID;

ALTER TABLE "BatchTransformationOutput"
  ADD COLUMN "captureMethod" "MeasurementCaptureMethod" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "reportedInstrumentId" UUID,
  ADD COLUMN "instrumentId" UUID,
  ADD COLUMN "instrumentFlagged" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "instrumentFlagReason" VARCHAR(80) DEFAULT 'INSTRUMENT_NOT_RECORDED',
  ADD COLUMN "recordedByUserId" UUID;

ALTER TABLE "BatchTransformationInput"
  ADD CONSTRAINT "BatchTransformationInput_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "WeighingInstrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BatchTransformationInput_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BatchTransformationInput_instrument_flag_check" CHECK (
    ("instrumentFlagged" = true AND "instrumentFlagReason" IS NOT NULL)
    OR ("instrumentFlagged" = false AND "instrumentFlagReason" IS NULL)
  );

ALTER TABLE "BatchTransformationOutput"
  ADD CONSTRAINT "BatchTransformationOutput_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "WeighingInstrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BatchTransformationOutput_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BatchTransformationOutput_instrument_flag_check" CHECK (
    ("instrumentFlagged" = true AND "instrumentFlagReason" IS NOT NULL)
    OR ("instrumentFlagged" = false AND "instrumentFlagReason" IS NULL)
  );

CREATE INDEX "BatchTransformationInput_instrumentId_createdAt_idx" ON "BatchTransformationInput"("instrumentId", "createdAt");
CREATE INDEX "BatchTransformationOutput_instrumentId_createdAt_idx" ON "BatchTransformationOutput"("instrumentId", "createdAt");

-- Resolving a lot to its farmers reads only live contributions and only three columns.
-- Measured at 100k rows, the non-covering index still left the planner preferring a full
-- scan because every probe needed a heap fetch. Partial plus INCLUDE makes it index-only.
CREATE INDEX "FarmerBatchContribution_live_attribution_idx"
  ON "FarmerBatchContribution" ("batchId")
  INCLUDE ("deliveryId", "quantity")
  WHERE "reversedAt" IS NULL;

-- The ledger is append-only and its quantities must stay positive, so a superseded
-- transformation is undone by appending mirrored reversal entries rather than by
-- deleting or negating the originals.
ALTER TABLE "InventoryLedgerEntry" DROP CONSTRAINT "InventoryLedgerEntry_shape_check";
ALTER TABLE "InventoryLedgerEntry"
    ADD CONSTRAINT "InventoryLedgerEntry_shape_check" CHECK (
        ("entryType" = 'DELIVERY_CONTRIBUTION' AND "sourceType" = 'DELIVERY' AND "destinationType" = 'BATCH')
        OR ("entryType" = 'TRANSFORMATION_INPUT' AND "sourceType" = 'BATCH' AND "destinationType" IS NULL)
        OR ("entryType" = 'TRANSFORMATION_OUTPUT' AND "sourceType" IS NULL AND "destinationType" = 'BATCH')
        OR ("entryType" = 'LOT_ALLOCATION' AND "sourceType" = 'BATCH' AND "destinationType" = 'LOT')
        OR ("entryType" = 'TRANSFORMATION_INPUT_REVERSAL' AND "sourceType" = 'BATCH' AND "destinationType" IS NULL)
        OR ("entryType" = 'TRANSFORMATION_OUTPUT_REVERSAL' AND "sourceType" IS NULL AND "destinationType" = 'BATCH')
    );

-- A cancelled batch keeps its sealedAt. Reversing a transformation must not erase the
-- fact that its output was once sealed and presented as real inventory.
ALTER TABLE "ProduceBatch" DROP CONSTRAINT "ProduceBatch_sealedAt_status_check";
ALTER TABLE "ProduceBatch"
    ADD CONSTRAINT "ProduceBatch_sealedAt_status_check" CHECK (
        ("status" IN ('SEALED', 'CONSUMED') AND "sealedAt" IS NOT NULL)
        OR ("status" = 'CANCELLED')
        OR ("status" NOT IN ('SEALED', 'CONSUMED', 'CANCELLED') AND "sealedAt" IS NULL)
    );

