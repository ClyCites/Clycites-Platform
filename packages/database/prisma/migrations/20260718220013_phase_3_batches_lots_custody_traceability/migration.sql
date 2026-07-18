-- CreateEnum
CREATE TYPE "StorageLocationStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- Extend Phase 2 synchronization with safe Phase 3 drafts.
ALTER TYPE "OfflineOperationType" ADD VALUE 'CREATE_BATCH';
ALTER TYPE "OfflineOperationType" ADD VALUE 'ADD_BATCH_CONTRIBUTION';
ALTER TYPE "OfflineEntityType" ADD VALUE 'BATCH';

-- CreateEnum
CREATE TYPE "ProduceBatchStatus" AS ENUM ('DRAFT', 'OPEN', 'SEALED', 'CONSUMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BatchOperationType" AS ENUM ('AGGREGATION', 'SPLIT', 'MERGE', 'TRANSFORMATION');

-- CreateEnum
CREATE TYPE "TransformationStatus" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CooperativeLotStatus" AS ENUM ('DRAFT', 'READY', 'APPROVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QualityInspectionStatus" AS ENUM ('DRAFT', 'PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "CustodyTransferStatus" AS ENUM ('DRAFT', 'DISPATCHED', 'RECEIVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TraceabilityPublicationStatus" AS ENUM ('PRIVATE', 'PUBLISHED', 'REVOKED');

-- CreateEnum
CREATE TYPE "InventoryEntityType" AS ENUM ('DELIVERY', 'BATCH', 'LOT');

-- CreateEnum
CREATE TYPE "InventoryLedgerEntryType" AS ENUM ('DELIVERY_CONTRIBUTION', 'TRANSFORMATION_INPUT', 'TRANSFORMATION_OUTPUT', 'LOT_ALLOCATION');

-- CreateTable
CREATE TABLE "StorageLocation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(500),
    "status" "StorageLocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StorageLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProduceBatch" (
    "id" UUID NOT NULL,
    "publicId" VARCHAR(128) NOT NULL,
    "batchNumber" VARCHAR(80) NOT NULL,
    "organizationId" UUID NOT NULL,
    "commodityId" UUID NOT NULL,
    "commodityFormId" UUID NOT NULL,
    "storageLocationId" UUID,
    "operationType" "BatchOperationType" NOT NULL DEFAULT 'AGGREGATION',
    "status" "ProduceBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "initialQuantity" DECIMAL(18,4) NOT NULL,
    "quantityUnit" "QuantityUnit" NOT NULL DEFAULT 'KG',
    "sealedAt" TIMESTAMPTZ(3),
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProduceBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FarmerBatchContribution" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "deliveryId" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit" "QuantityUnit" NOT NULL DEFAULT 'KG',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FarmerBatchContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchTransformation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "transformationNumber" VARCHAR(80) NOT NULL,
    "type" "BatchOperationType" NOT NULL,
    "status" "TransformationStatus" NOT NULL DEFAULT 'DRAFT',
    "description" VARCHAR(1000),
    "completedByUserId" UUID,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BatchTransformation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchTransformationInput" (
    "id" UUID NOT NULL,
    "transformationId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit" "QuantityUnit" NOT NULL DEFAULT 'KG',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatchTransformationInput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchTransformationOutput" (
    "id" UUID NOT NULL,
    "transformationId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit" "QuantityUnit" NOT NULL DEFAULT 'KG',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatchTransformationOutput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CooperativeLot" (
    "id" UUID NOT NULL,
    "publicId" VARCHAR(128) NOT NULL,
    "lotNumber" VARCHAR(80) NOT NULL,
    "organizationId" UUID NOT NULL,
    "commodityId" UUID NOT NULL,
    "commodityFormId" UUID NOT NULL,
    "storageLocationId" UUID,
    "status" "CooperativeLotStatus" NOT NULL DEFAULT 'DRAFT',
    "quantity" DECIMAL(18,4) NOT NULL,
    "quantityUnit" "QuantityUnit" NOT NULL DEFAULT 'KG',
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CooperativeLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CooperativeLotContribution" (
    "id" UUID NOT NULL,
    "lotId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit" "QuantityUnit" NOT NULL DEFAULT 'KG',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CooperativeLotContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityInspection" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "lotId" UUID NOT NULL,
    "status" "QualityInspectionStatus" NOT NULL DEFAULT 'DRAFT',
    "inspectorUserId" UUID NOT NULL,
    "inspectedAt" TIMESTAMPTZ(3) NOT NULL,
    "notes" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualityInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityInspectionMeasurement" (
    "id" UUID NOT NULL,
    "inspectionId" UUID NOT NULL,
    "qualityAttributeDefinitionId" UUID NOT NULL,
    "decimalValue" DECIMAL(18,6),
    "integerValue" INTEGER,
    "textValue" VARCHAR(500),
    "booleanValue" BOOLEAN,
    "enumValue" VARCHAR(120),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualityInspectionMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustodyTransfer" (
    "id" UUID NOT NULL,
    "transferNumber" VARCHAR(80) NOT NULL,
    "lotId" UUID NOT NULL,
    "fromOrganizationId" UUID NOT NULL,
    "toOrganizationId" UUID NOT NULL,
    "originLocationId" UUID,
    "destinationLocationId" UUID,
    "status" "CustodyTransferStatus" NOT NULL DEFAULT 'DRAFT',
    "quantity" DECIMAL(18,4) NOT NULL,
    "quantityUnit" "QuantityUnit" NOT NULL DEFAULT 'KG',
    "initiatedByUserId" UUID NOT NULL,
    "dispatchedAt" TIMESTAMPTZ(3),
    "receivedByUserId" UUID,
    "receivedAt" TIMESTAMPTZ(3),
    "notes" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CustodyTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLedgerEntry" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "commodityId" UUID NOT NULL,
    "commodityFormId" UUID NOT NULL,
    "entryType" "InventoryLedgerEntryType" NOT NULL,
    "sourceType" "InventoryEntityType",
    "sourceId" UUID,
    "destinationType" "InventoryEntityType",
    "destinationId" UUID,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit" "QuantityUnit" NOT NULL DEFAULT 'KG',
    "referenceType" VARCHAR(80) NOT NULL,
    "referenceId" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TraceabilityPublication" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "lotId" UUID NOT NULL,
    "publicId" VARCHAR(128) NOT NULL,
    "status" "TraceabilityPublicationStatus" NOT NULL DEFAULT 'PRIVATE',
    "publishedClaims" JSONB NOT NULL,
    "publishedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "actorUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TraceabilityPublication_pkey" PRIMARY KEY ("id")
);

-- Domain invariants that Prisma cannot express.
ALTER TABLE "ProduceBatch"
    ADD CONSTRAINT "ProduceBatch_initialQuantity_nonnegative" CHECK ("initialQuantity" >= 0),
    ADD CONSTRAINT "ProduceBatch_sealedAt_status_check" CHECK (
        ("status" IN ('SEALED', 'CONSUMED') AND "sealedAt" IS NOT NULL)
        OR ("status" NOT IN ('SEALED', 'CONSUMED') AND "sealedAt" IS NULL)
    );

ALTER TABLE "FarmerBatchContribution"
    ADD CONSTRAINT "FarmerBatchContribution_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "BatchTransformation"
    ADD CONSTRAINT "BatchTransformation_type_check" CHECK ("type" IN ('SPLIT', 'MERGE', 'TRANSFORMATION')),
    ADD CONSTRAINT "BatchTransformation_completion_check" CHECK (
        ("status" = 'COMPLETED' AND "completedByUserId" IS NOT NULL AND "completedAt" IS NOT NULL)
        OR ("status" <> 'COMPLETED' AND "completedAt" IS NULL)
    );

ALTER TABLE "BatchTransformationInput"
    ADD CONSTRAINT "BatchTransformationInput_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "BatchTransformationOutput"
    ADD CONSTRAINT "BatchTransformationOutput_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "CooperativeLot"
    ADD CONSTRAINT "CooperativeLot_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "CooperativeLotContribution"
    ADD CONSTRAINT "CooperativeLotContribution_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "QualityInspectionMeasurement"
    ADD CONSTRAINT "QualityInspectionMeasurement_single_value_check" CHECK (
        num_nonnulls("decimalValue", "integerValue", "textValue", "booleanValue", "enumValue") = 1
    );

ALTER TABLE "CustodyTransfer"
    ADD CONSTRAINT "CustodyTransfer_quantity_positive" CHECK ("quantity" > 0),
    ADD CONSTRAINT "CustodyTransfer_distinct_organizations" CHECK ("fromOrganizationId" <> "toOrganizationId"),
    ADD CONSTRAINT "CustodyTransfer_dispatch_check" CHECK (
        ("status" IN ('DISPATCHED', 'RECEIVED', 'REJECTED') AND "dispatchedAt" IS NOT NULL)
        OR ("status" IN ('DRAFT', 'CANCELLED') AND "dispatchedAt" IS NULL)
    ),
    ADD CONSTRAINT "CustodyTransfer_receipt_check" CHECK (
        ("status" IN ('RECEIVED', 'REJECTED') AND "receivedByUserId" IS NOT NULL AND "receivedAt" IS NOT NULL)
        OR ("status" NOT IN ('RECEIVED', 'REJECTED') AND "receivedByUserId" IS NULL AND "receivedAt" IS NULL)
    );

ALTER TABLE "InventoryLedgerEntry"
    ADD CONSTRAINT "InventoryLedgerEntry_quantity_positive" CHECK ("quantity" > 0),
    ADD CONSTRAINT "InventoryLedgerEntry_source_pair_check" CHECK (("sourceType" IS NULL) = ("sourceId" IS NULL)),
    ADD CONSTRAINT "InventoryLedgerEntry_destination_pair_check" CHECK (("destinationType" IS NULL) = ("destinationId" IS NULL)),
    ADD CONSTRAINT "InventoryLedgerEntry_shape_check" CHECK (
        ("entryType" = 'DELIVERY_CONTRIBUTION' AND "sourceType" = 'DELIVERY' AND "destinationType" = 'BATCH')
        OR ("entryType" = 'TRANSFORMATION_INPUT' AND "sourceType" = 'BATCH' AND "destinationType" IS NULL)
        OR ("entryType" = 'TRANSFORMATION_OUTPUT' AND "sourceType" IS NULL AND "destinationType" = 'BATCH')
        OR ("entryType" = 'LOT_ALLOCATION' AND "sourceType" = 'BATCH' AND "destinationType" = 'LOT')
    );

ALTER TABLE "TraceabilityPublication"
    ADD CONSTRAINT "TraceabilityPublication_status_dates_check" CHECK (
        ("status" = 'PRIVATE' AND "publishedAt" IS NULL AND "revokedAt" IS NULL)
        OR ("status" = 'PUBLISHED' AND "publishedAt" IS NOT NULL AND "revokedAt" IS NULL)
        OR ("status" = 'REVOKED' AND "publishedAt" IS NOT NULL AND "revokedAt" IS NOT NULL)
    );

CREATE FUNCTION forbid_inventory_ledger_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Inventory ledger entries are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "InventoryLedgerEntry_append_only"
BEFORE UPDATE OR DELETE ON "InventoryLedgerEntry"
FOR EACH ROW EXECUTE FUNCTION forbid_inventory_ledger_mutation();

-- CreateIndex
CREATE INDEX "StorageLocation_organizationId_status_name_idx" ON "StorageLocation"("organizationId", "status", "name");

-- CreateIndex
CREATE UNIQUE INDEX "StorageLocation_organizationId_code_key" ON "StorageLocation"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ProduceBatch_publicId_key" ON "ProduceBatch"("publicId");

-- CreateIndex
CREATE INDEX "ProduceBatch_organizationId_status_createdAt_idx" ON "ProduceBatch"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ProduceBatch_commodityFormId_status_createdAt_idx" ON "ProduceBatch"("commodityFormId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ProduceBatch_storageLocationId_status_idx" ON "ProduceBatch"("storageLocationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProduceBatch_organizationId_batchNumber_key" ON "ProduceBatch"("organizationId", "batchNumber");

-- CreateIndex
CREATE INDEX "FarmerBatchContribution_deliveryId_createdAt_idx" ON "FarmerBatchContribution"("deliveryId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FarmerBatchContribution_batchId_deliveryId_key" ON "FarmerBatchContribution"("batchId", "deliveryId");

-- CreateIndex
CREATE INDEX "BatchTransformation_organizationId_status_createdAt_idx" ON "BatchTransformation"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BatchTransformation_organizationId_transformationNumber_key" ON "BatchTransformation"("organizationId", "transformationNumber");

-- CreateIndex
CREATE INDEX "BatchTransformationInput_batchId_createdAt_idx" ON "BatchTransformationInput"("batchId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BatchTransformationInput_transformationId_batchId_key" ON "BatchTransformationInput"("transformationId", "batchId");

-- CreateIndex
CREATE UNIQUE INDEX "BatchTransformationOutput_batchId_key" ON "BatchTransformationOutput"("batchId");

-- CreateIndex
CREATE INDEX "BatchTransformationOutput_transformationId_createdAt_idx" ON "BatchTransformationOutput"("transformationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CooperativeLot_publicId_key" ON "CooperativeLot"("publicId");

-- CreateIndex
CREATE INDEX "CooperativeLot_organizationId_status_createdAt_idx" ON "CooperativeLot"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CooperativeLot_commodityFormId_status_createdAt_idx" ON "CooperativeLot"("commodityFormId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CooperativeLot_organizationId_lotNumber_key" ON "CooperativeLot"("organizationId", "lotNumber");

-- CreateIndex
CREATE INDEX "CooperativeLotContribution_batchId_createdAt_idx" ON "CooperativeLotContribution"("batchId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CooperativeLotContribution_lotId_batchId_key" ON "CooperativeLotContribution"("lotId", "batchId");

-- CreateIndex
CREATE INDEX "QualityInspection_organizationId_status_inspectedAt_idx" ON "QualityInspection"("organizationId", "status", "inspectedAt");

-- CreateIndex
CREATE INDEX "QualityInspection_lotId_inspectedAt_idx" ON "QualityInspection"("lotId", "inspectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "QualityInspectionMeasurement_inspectionId_qualityAttributeD_key" ON "QualityInspectionMeasurement"("inspectionId", "qualityAttributeDefinitionId");

-- CreateIndex
CREATE INDEX "CustodyTransfer_lotId_status_createdAt_idx" ON "CustodyTransfer"("lotId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CustodyTransfer_toOrganizationId_status_createdAt_idx" ON "CustodyTransfer"("toOrganizationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustodyTransfer_fromOrganizationId_transferNumber_key" ON "CustodyTransfer"("fromOrganizationId", "transferNumber");

-- CreateIndex
CREATE INDEX "InventoryLedgerEntry_organizationId_sourceType_sourceId_occ_idx" ON "InventoryLedgerEntry"("organizationId", "sourceType", "sourceId", "occurredAt");

-- CreateIndex
CREATE INDEX "InventoryLedgerEntry_organizationId_destinationType_destina_idx" ON "InventoryLedgerEntry"("organizationId", "destinationType", "destinationId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLedgerEntry_entryType_referenceType_referenceId_key" ON "InventoryLedgerEntry"("entryType", "referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "TraceabilityPublication_lotId_key" ON "TraceabilityPublication"("lotId");

-- CreateIndex
CREATE UNIQUE INDEX "TraceabilityPublication_publicId_key" ON "TraceabilityPublication"("publicId");

-- CreateIndex
CREATE INDEX "TraceabilityPublication_organizationId_status_publishedAt_idx" ON "TraceabilityPublication"("organizationId", "status", "publishedAt");

-- AddForeignKey
ALTER TABLE "StorageLocation" ADD CONSTRAINT "StorageLocation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProduceBatch" ADD CONSTRAINT "ProduceBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProduceBatch" ADD CONSTRAINT "ProduceBatch_commodityId_fkey" FOREIGN KEY ("commodityId") REFERENCES "Commodity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProduceBatch" ADD CONSTRAINT "ProduceBatch_commodityFormId_fkey" FOREIGN KEY ("commodityFormId") REFERENCES "CommodityForm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProduceBatch" ADD CONSTRAINT "ProduceBatch_storageLocationId_fkey" FOREIGN KEY ("storageLocationId") REFERENCES "StorageLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProduceBatch" ADD CONSTRAINT "ProduceBatch_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmerBatchContribution" ADD CONSTRAINT "FarmerBatchContribution_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProduceBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmerBatchContribution" ADD CONSTRAINT "FarmerBatchContribution_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchTransformation" ADD CONSTRAINT "BatchTransformation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchTransformation" ADD CONSTRAINT "BatchTransformation_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchTransformationInput" ADD CONSTRAINT "BatchTransformationInput_transformationId_fkey" FOREIGN KEY ("transformationId") REFERENCES "BatchTransformation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchTransformationInput" ADD CONSTRAINT "BatchTransformationInput_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProduceBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchTransformationOutput" ADD CONSTRAINT "BatchTransformationOutput_transformationId_fkey" FOREIGN KEY ("transformationId") REFERENCES "BatchTransformation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchTransformationOutput" ADD CONSTRAINT "BatchTransformationOutput_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProduceBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CooperativeLot" ADD CONSTRAINT "CooperativeLot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CooperativeLot" ADD CONSTRAINT "CooperativeLot_commodityId_fkey" FOREIGN KEY ("commodityId") REFERENCES "Commodity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CooperativeLot" ADD CONSTRAINT "CooperativeLot_commodityFormId_fkey" FOREIGN KEY ("commodityFormId") REFERENCES "CommodityForm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CooperativeLot" ADD CONSTRAINT "CooperativeLot_storageLocationId_fkey" FOREIGN KEY ("storageLocationId") REFERENCES "StorageLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CooperativeLot" ADD CONSTRAINT "CooperativeLot_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CooperativeLotContribution" ADD CONSTRAINT "CooperativeLotContribution_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "CooperativeLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CooperativeLotContribution" ADD CONSTRAINT "CooperativeLotContribution_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProduceBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityInspection" ADD CONSTRAINT "QualityInspection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityInspection" ADD CONSTRAINT "QualityInspection_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "CooperativeLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityInspection" ADD CONSTRAINT "QualityInspection_inspectorUserId_fkey" FOREIGN KEY ("inspectorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityInspectionMeasurement" ADD CONSTRAINT "QualityInspectionMeasurement_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "QualityInspection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityInspectionMeasurement" ADD CONSTRAINT "QualityInspectionMeasurement_qualityAttributeDefinitionId_fkey" FOREIGN KEY ("qualityAttributeDefinitionId") REFERENCES "QualityAttributeDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyTransfer" ADD CONSTRAINT "CustodyTransfer_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "CooperativeLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyTransfer" ADD CONSTRAINT "CustodyTransfer_fromOrganizationId_fkey" FOREIGN KEY ("fromOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyTransfer" ADD CONSTRAINT "CustodyTransfer_toOrganizationId_fkey" FOREIGN KEY ("toOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyTransfer" ADD CONSTRAINT "CustodyTransfer_originLocationId_fkey" FOREIGN KEY ("originLocationId") REFERENCES "StorageLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyTransfer" ADD CONSTRAINT "CustodyTransfer_destinationLocationId_fkey" FOREIGN KEY ("destinationLocationId") REFERENCES "StorageLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyTransfer" ADD CONSTRAINT "CustodyTransfer_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyTransfer" ADD CONSTRAINT "CustodyTransfer_receivedByUserId_fkey" FOREIGN KEY ("receivedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLedgerEntry" ADD CONSTRAINT "InventoryLedgerEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLedgerEntry" ADD CONSTRAINT "InventoryLedgerEntry_commodityId_fkey" FOREIGN KEY ("commodityId") REFERENCES "Commodity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLedgerEntry" ADD CONSTRAINT "InventoryLedgerEntry_commodityFormId_fkey" FOREIGN KEY ("commodityFormId") REFERENCES "CommodityForm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraceabilityPublication" ADD CONSTRAINT "TraceabilityPublication_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraceabilityPublication" ADD CONSTRAINT "TraceabilityPublication_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "CooperativeLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraceabilityPublication" ADD CONSTRAINT "TraceabilityPublication_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
