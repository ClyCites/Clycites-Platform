-- CreateEnum
CREATE TYPE "CommodityStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "QuantityUnit" AS ENUM ('KG');

-- CreateEnum
CREATE TYPE "QualityDataType" AS ENUM ('DECIMAL', 'INTEGER', 'TEXT', 'ENUM', 'BOOLEAN');

-- CreateEnum
CREATE TYPE "ConfigurationStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ACTIVE', 'REVOKED', 'LOST', 'REPLACED');

-- CreateEnum
CREATE TYPE "CollectionSessionStatus" AS ENUM ('OPEN', 'CLOSED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PENDING_CONFIRMATION', 'ACCEPTED', 'CORRECTION_PENDING', 'CORRECTED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliverySource" AS ENUM ('ONLINE', 'OFFLINE_SYNC');

-- CreateEnum
CREATE TYPE "DeliveryMeasurementType" AS ENUM ('WEIGHT');

-- CreateEnum
CREATE TYPE "MeasurementCaptureMethod" AS ENUM ('MANUAL', 'DEVICE_IMPORT');

-- CreateEnum
CREATE TYPE "PriceSource" AS ENUM ('COLLECTION_POINT', 'CONTRACT', 'MANUAL_OVERRIDE');

-- CreateEnum
CREATE TYPE "DeliveryConfirmationMethod" AS ENUM ('FARMER_PIN', 'SMS_OTP', 'SIGNATURE', 'VERBAL_WITNESSED', 'PRINTED_RECEIPT_ACKNOWLEDGEMENT');

-- CreateEnum
CREATE TYPE "DeliveryConfirmationStatus" AS ENUM ('CONFIRMED', 'DECLINED');

-- CreateEnum
CREATE TYPE "DeliveryReceiptStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'VOID');

-- CreateEnum
CREATE TYPE "DeliveryCorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryCorrectionReasonCode" AS ENUM ('WEIGHT_ENTRY_ERROR', 'WRONG_FARMER', 'WRONG_COMMODITY_FORM', 'QUALITY_ENTRY_ERROR', 'PRICE_ENTRY_ERROR', 'DUPLICATE_DELIVERY', 'OTHER');

-- CreateEnum
CREATE TYPE "OfflineOperationStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'REJECTED', 'CONFLICT');

-- CreateEnum
CREATE TYPE "OfflineOperationType" AS ENUM ('CREATE_DELIVERY', 'CONFIRM_DELIVERY', 'SUBMIT_DELIVERY', 'REQUEST_DELIVERY_CORRECTION');

-- CreateEnum
CREATE TYPE "OfflineEntityType" AS ENUM ('DELIVERY', 'DELIVERY_CORRECTION');

-- CreateTable
CREATE TABLE "Commodity" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "status" "CommodityStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Commodity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommodityForm" (
    "id" UUID NOT NULL,
    "commodityId" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "defaultUnit" "QuantityUnit" NOT NULL DEFAULT 'KG',
    "status" "CommodityStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CommodityForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityAttributeDefinition" (
    "id" UUID NOT NULL,
    "commodityFormId" UUID NOT NULL,
    "organizationId" UUID,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "dataType" "QualityDataType" NOT NULL,
    "unit" VARCHAR(32),
    "required" BOOLEAN NOT NULL DEFAULT false,
    "minimumValue" DECIMAL(18,6),
    "maximumValue" DECIMAL(18,6),
    "allowedValues" JSONB,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "ConfigurationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "QualityAttributeDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegisteredDevice" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "assignedUserId" UUID NOT NULL,
    "devicePublicId" VARCHAR(128) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "platform" VARCHAR(80) NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSeenAt" TIMESTAMPTZ(3),
    "registeredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RegisteredDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionSession" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "collectionPointId" UUID NOT NULL,
    "agentUserId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "businessDate" DATE NOT NULL,
    "status" "CollectionSessionStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMPTZ(3),
    "notes" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CollectionSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" UUID NOT NULL,
    "publicId" VARCHAR(128) NOT NULL,
    "deliveryNumber" VARCHAR(80) NOT NULL,
    "organizationId" UUID NOT NULL,
    "collectionPointId" UUID NOT NULL,
    "collectionSessionId" UUID NOT NULL,
    "farmerId" UUID NOT NULL,
    "farmerOrganizationMembershipId" UUID NOT NULL,
    "farmId" UUID,
    "commodityId" UUID NOT NULL,
    "commodityFormId" UUID NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'DRAFT',
    "source" "DeliverySource" NOT NULL,
    "clientCreatedAt" TIMESTAMPTZ(3) NOT NULL,
    "serverReceivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientClockOffsetSeconds" INTEGER,
    "clientClockFlagged" BOOLEAN NOT NULL DEFAULT false,
    "acceptedAt" TIMESTAMPTZ(3),
    "acceptedByUserId" UUID,
    "confirmedAt" TIMESTAMPTZ(3),
    "confirmationMethod" "DeliveryConfirmationMethod",
    "notes" VARCHAR(1000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "lockVersion" INTEGER NOT NULL DEFAULT 1,
    "supersedesDeliveryId" UUID,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryMeasurement" (
    "id" UUID NOT NULL,
    "deliveryId" UUID NOT NULL,
    "measurementType" "DeliveryMeasurementType" NOT NULL,
    "grossQuantity" DECIMAL(18,4),
    "tareQuantity" DECIMAL(18,4),
    "netQuantity" DECIMAL(18,4) NOT NULL,
    "unit" "QuantityUnit" NOT NULL,
    "captureMethod" "MeasurementCaptureMethod" NOT NULL DEFAULT 'MANUAL',
    "capturedByUserId" UUID NOT NULL,
    "capturedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryPricing" (
    "id" UUID NOT NULL,
    "deliveryId" UUID NOT NULL,
    "unitPriceMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'UGX',
    "quantity" DECIMAL(18,4) NOT NULL,
    "quantityUnit" "QuantityUnit" NOT NULL,
    "grossAmountMinor" BIGINT NOT NULL,
    "adjustmentAmountMinor" BIGINT NOT NULL DEFAULT 0,
    "netAmountMinor" BIGINT NOT NULL,
    "priceSource" "PriceSource" NOT NULL,
    "priceReference" VARCHAR(160),
    "overrideReason" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryPricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryQualityMeasurement" (
    "id" UUID NOT NULL,
    "deliveryId" UUID NOT NULL,
    "qualityAttributeDefinitionId" UUID NOT NULL,
    "decimalValue" DECIMAL(18,6),
    "integerValue" INTEGER,
    "textValue" VARCHAR(500),
    "booleanValue" BOOLEAN,
    "enumValue" VARCHAR(120),
    "capturedByUserId" UUID NOT NULL,
    "capturedAt" TIMESTAMPTZ(3) NOT NULL,
    "notes" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryQualityMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryConfirmation" (
    "id" UUID NOT NULL,
    "deliveryId" UUID NOT NULL,
    "method" "DeliveryConfirmationMethod" NOT NULL,
    "status" "DeliveryConfirmationStatus" NOT NULL,
    "confirmedByName" VARCHAR(200),
    "confirmedByFarmerId" UUID,
    "confirmationReference" VARCHAR(160),
    "witnessUserId" UUID,
    "confirmedAt" TIMESTAMPTZ(3) NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryReceipt" (
    "id" UUID NOT NULL,
    "deliveryId" UUID NOT NULL,
    "receiptNumber" VARCHAR(80) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "DeliveryReceiptStatus" NOT NULL DEFAULT 'ACTIVE',
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedByUserId" UUID NOT NULL,
    "renderedDocumentKey" VARCHAR(500),
    "checksum" VARCHAR(128) NOT NULL,
    "supersededById" UUID,
    "reprintCount" INTEGER NOT NULL DEFAULT 0,
    "lastReprintedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryCorrectionRequest" (
    "id" UUID NOT NULL,
    "deliveryId" UUID NOT NULL,
    "requestedByUserId" UUID NOT NULL,
    "reasonCode" "DeliveryCorrectionReasonCode" NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "proposedChanges" JSONB NOT NULL,
    "status" "DeliveryCorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByUserId" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "reviewNotes" VARCHAR(1000),
    "replacementDeliveryVersionId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DeliveryCorrectionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineOperation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "clientOperationId" UUID NOT NULL,
    "operationType" "OfflineOperationType" NOT NULL,
    "entityType" "OfflineEntityType" NOT NULL,
    "clientEntityId" UUID NOT NULL,
    "payloadHash" VARCHAR(128) NOT NULL,
    "status" "OfflineOperationStatus" NOT NULL DEFAULT 'RECEIVED',
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "errorCode" VARCHAR(120),
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfflineOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Commodity_code_key" ON "Commodity"("code");

-- CreateIndex
CREATE INDEX "Commodity_status_code_idx" ON "Commodity"("status", "code");

-- CreateIndex
CREATE INDEX "CommodityForm_commodityId_status_code_idx" ON "CommodityForm"("commodityId", "status", "code");

-- CreateIndex
CREATE UNIQUE INDEX "CommodityForm_commodityId_code_key" ON "CommodityForm"("commodityId", "code");

-- CreateIndex
CREATE INDEX "QualityAttributeDefinition_commodityFormId_organizationId_s_idx" ON "QualityAttributeDefinition"("commodityFormId", "organizationId", "status", "displayOrder");

-- CreateIndex
CREATE INDEX "QualityAttributeDefinition_organizationId_status_updatedAt_idx" ON "QualityAttributeDefinition"("organizationId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "QualityAttributeDefinition_commodityFormId_organizationId_c_key" ON "QualityAttributeDefinition"("commodityFormId", "organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "RegisteredDevice_devicePublicId_key" ON "RegisteredDevice"("devicePublicId");

-- CreateIndex
CREATE INDEX "RegisteredDevice_organizationId_status_assignedUserId_idx" ON "RegisteredDevice"("organizationId", "status", "assignedUserId");

-- CreateIndex
CREATE INDEX "RegisteredDevice_assignedUserId_status_lastSeenAt_idx" ON "RegisteredDevice"("assignedUserId", "status", "lastSeenAt");

-- CreateIndex
CREATE INDEX "CollectionSession_organizationId_status_businessDate_opened_idx" ON "CollectionSession"("organizationId", "status", "businessDate", "openedAt");

-- CreateIndex
CREATE INDEX "CollectionSession_agentUserId_deviceId_collectionPointId_st_idx" ON "CollectionSession"("agentUserId", "deviceId", "collectionPointId", "status");

-- CreateIndex
CREATE INDEX "CollectionSession_collectionPointId_businessDate_status_idx" ON "CollectionSession"("collectionPointId", "businessDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_publicId_key" ON "Delivery"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_supersedesDeliveryId_key" ON "Delivery"("supersedesDeliveryId");

-- CreateIndex
CREATE INDEX "Delivery_organizationId_status_serverReceivedAt_idx" ON "Delivery"("organizationId", "status", "serverReceivedAt");

-- CreateIndex
CREATE INDEX "Delivery_organizationId_collectionPointId_serverReceivedAt_idx" ON "Delivery"("organizationId", "collectionPointId", "serverReceivedAt");

-- CreateIndex
CREATE INDEX "Delivery_organizationId_farmerId_serverReceivedAt_idx" ON "Delivery"("organizationId", "farmerId", "serverReceivedAt");

-- CreateIndex
CREATE INDEX "Delivery_collectionSessionId_status_createdAt_idx" ON "Delivery"("collectionSessionId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Delivery_supersedesDeliveryId_idx" ON "Delivery"("supersedesDeliveryId");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_organizationId_deliveryNumber_version_key" ON "Delivery"("organizationId", "deliveryNumber", "version");

-- CreateIndex
CREATE INDEX "DeliveryMeasurement_capturedByUserId_capturedAt_idx" ON "DeliveryMeasurement"("capturedByUserId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryMeasurement_deliveryId_measurementType_key" ON "DeliveryMeasurement"("deliveryId", "measurementType");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryPricing_deliveryId_key" ON "DeliveryPricing"("deliveryId");

-- CreateIndex
CREATE INDEX "DeliveryQualityMeasurement_qualityAttributeDefinitionId_cap_idx" ON "DeliveryQualityMeasurement"("qualityAttributeDefinitionId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryQualityMeasurement_deliveryId_qualityAttributeDefin_key" ON "DeliveryQualityMeasurement"("deliveryId", "qualityAttributeDefinitionId");

-- CreateIndex
CREATE INDEX "DeliveryConfirmation_deliveryId_confirmedAt_idx" ON "DeliveryConfirmation"("deliveryId", "confirmedAt");

-- CreateIndex
CREATE INDEX "DeliveryConfirmation_witnessUserId_confirmedAt_idx" ON "DeliveryConfirmation"("witnessUserId", "confirmedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryReceipt_receiptNumber_key" ON "DeliveryReceipt"("receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryReceipt_supersededById_key" ON "DeliveryReceipt"("supersededById");

-- CreateIndex
CREATE INDEX "DeliveryReceipt_deliveryId_status_issuedAt_idx" ON "DeliveryReceipt"("deliveryId", "status", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryReceipt_deliveryId_version_key" ON "DeliveryReceipt"("deliveryId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryCorrectionRequest_replacementDeliveryVersionId_key" ON "DeliveryCorrectionRequest"("replacementDeliveryVersionId");

-- CreateIndex
CREATE INDEX "DeliveryCorrectionRequest_deliveryId_status_createdAt_idx" ON "DeliveryCorrectionRequest"("deliveryId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryCorrectionRequest_requestedByUserId_status_createdA_idx" ON "DeliveryCorrectionRequest"("requestedByUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "OfflineOperation_organizationId_status_receivedAt_idx" ON "OfflineOperation"("organizationId", "status", "receivedAt");

-- CreateIndex
CREATE INDEX "OfflineOperation_userId_receivedAt_idx" ON "OfflineOperation"("userId", "receivedAt");

-- CreateIndex
CREATE INDEX "OfflineOperation_clientEntityId_operationType_idx" ON "OfflineOperation"("clientEntityId", "operationType");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineOperation_deviceId_clientOperationId_key" ON "OfflineOperation"("deviceId", "clientOperationId");

-- Platform defaults use a nullable organization, which requires a partial index for true uniqueness.
CREATE UNIQUE INDEX "QualityAttributeDefinition_platform_default_code_key"
ON "QualityAttributeDefinition"("commodityFormId", "code")
WHERE "organizationId" IS NULL;

-- An agent may have only one open session for the same device and collection point.
CREATE UNIQUE INDEX "CollectionSession_one_open_agent_device_point_key"
ON "CollectionSession"("organizationId", "agentUserId", "deviceId", "collectionPointId")
WHERE "status" = 'OPEN';

CREATE UNIQUE INDEX "DeliveryCorrectionRequest_one_pending_per_delivery_key"
ON "DeliveryCorrectionRequest"("deliveryId")
WHERE "status" = 'PENDING';

CREATE UNIQUE INDEX "DeliveryReceipt_one_active_per_delivery_key"
ON "DeliveryReceipt"("deliveryId")
WHERE "status" = 'ACTIVE';

ALTER TABLE "QualityAttributeDefinition"
ADD CONSTRAINT "QualityAttributeDefinition_valid_range_check"
CHECK ("minimumValue" IS NULL OR "maximumValue" IS NULL OR "minimumValue" <= "maximumValue"),
ADD CONSTRAINT "QualityAttributeDefinition_enum_values_check"
CHECK (
    ("dataType" = 'ENUM' AND jsonb_typeof("allowedValues") = 'array' AND jsonb_array_length("allowedValues") > 0)
    OR ("dataType" <> 'ENUM' AND "allowedValues" IS NULL)
),
ADD CONSTRAINT "QualityAttributeDefinition_numeric_bounds_check"
CHECK ("dataType" IN ('DECIMAL', 'INTEGER') OR ("minimumValue" IS NULL AND "maximumValue" IS NULL)),
ADD CONSTRAINT "QualityAttributeDefinition_display_order_check"
CHECK ("displayOrder" >= 0);

ALTER TABLE "RegisteredDevice"
ADD CONSTRAINT "RegisteredDevice_revocation_timestamp_check"
CHECK (("status" = 'ACTIVE' AND "revokedAt" IS NULL) OR ("status" <> 'ACTIVE' AND "revokedAt" IS NOT NULL));

ALTER TABLE "CollectionSession"
ADD CONSTRAINT "CollectionSession_closed_timestamp_check"
CHECK (("status" = 'OPEN' AND "closedAt" IS NULL) OR ("status" <> 'OPEN' AND "closedAt" IS NOT NULL));

ALTER TABLE "Delivery"
ADD CONSTRAINT "Delivery_version_positive_check" CHECK ("version" > 0),
ADD CONSTRAINT "Delivery_lock_version_positive_check" CHECK ("lockVersion" > 0);

ALTER TABLE "DeliveryMeasurement"
ADD CONSTRAINT "DeliveryMeasurement_valid_weight_check"
CHECK (
    "netQuantity" > 0
    AND (
        ("grossQuantity" IS NULL AND "tareQuantity" IS NULL)
        OR (
            "grossQuantity" IS NOT NULL
            AND "grossQuantity" > 0
            AND COALESCE("tareQuantity", 0) >= 0
            AND COALESCE("tareQuantity", 0) <= "grossQuantity"
            AND "netQuantity" = "grossQuantity" - COALESCE("tareQuantity", 0)
        )
    )
);

ALTER TABLE "DeliveryPricing"
ADD CONSTRAINT "DeliveryPricing_valid_amounts_check"
CHECK (
    "unitPriceMinor" >= 0
    AND "quantity" > 0
    AND "grossAmountMinor" >= 0
    AND "netAmountMinor" >= 0
    AND "netAmountMinor" = "grossAmountMinor" + "adjustmentAmountMinor"
),
ADD CONSTRAINT "DeliveryPricing_manual_override_reason_check"
CHECK ("priceSource" <> 'MANUAL_OVERRIDE' OR "overrideReason" IS NOT NULL);

ALTER TABLE "DeliveryQualityMeasurement"
ADD CONSTRAINT "DeliveryQualityMeasurement_one_value_check"
CHECK (num_nonnulls("decimalValue", "integerValue", "textValue", "booleanValue", "enumValue") = 1);

ALTER TABLE "DeliveryReceipt"
ADD CONSTRAINT "DeliveryReceipt_version_positive_check" CHECK ("version" > 0),
ADD CONSTRAINT "DeliveryReceipt_reprint_count_check" CHECK ("reprintCount" >= 0);

ALTER TABLE "DeliveryCorrectionRequest"
ADD CONSTRAINT "DeliveryCorrectionRequest_separation_of_duties_check"
CHECK ("reviewedByUserId" IS NULL OR "reviewedByUserId" <> "requestedByUserId");

ALTER TABLE "OfflineOperation"
ADD CONSTRAINT "OfflineOperation_response_status_check"
CHECK ("responseStatus" IS NULL OR "responseStatus" BETWEEN 100 AND 599);

-- AddForeignKey
ALTER TABLE "CommodityForm" ADD CONSTRAINT "CommodityForm_commodityId_fkey" FOREIGN KEY ("commodityId") REFERENCES "Commodity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityAttributeDefinition" ADD CONSTRAINT "QualityAttributeDefinition_commodityFormId_fkey" FOREIGN KEY ("commodityFormId") REFERENCES "CommodityForm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityAttributeDefinition" ADD CONSTRAINT "QualityAttributeDefinition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegisteredDevice" ADD CONSTRAINT "RegisteredDevice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegisteredDevice" ADD CONSTRAINT "RegisteredDevice_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionSession" ADD CONSTRAINT "CollectionSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionSession" ADD CONSTRAINT "CollectionSession_collectionPointId_fkey" FOREIGN KEY ("collectionPointId") REFERENCES "CollectionPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionSession" ADD CONSTRAINT "CollectionSession_agentUserId_fkey" FOREIGN KEY ("agentUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionSession" ADD CONSTRAINT "CollectionSession_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "RegisteredDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_collectionPointId_fkey" FOREIGN KEY ("collectionPointId") REFERENCES "CollectionPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_collectionSessionId_fkey" FOREIGN KEY ("collectionSessionId") REFERENCES "CollectionSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_farmerOrganizationMembershipId_fkey" FOREIGN KEY ("farmerOrganizationMembershipId") REFERENCES "FarmerOrganizationMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_commodityId_fkey" FOREIGN KEY ("commodityId") REFERENCES "Commodity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_commodityFormId_fkey" FOREIGN KEY ("commodityFormId") REFERENCES "CommodityForm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_supersedesDeliveryId_fkey" FOREIGN KEY ("supersedesDeliveryId") REFERENCES "Delivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryMeasurement" ADD CONSTRAINT "DeliveryMeasurement_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryMeasurement" ADD CONSTRAINT "DeliveryMeasurement_capturedByUserId_fkey" FOREIGN KEY ("capturedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPricing" ADD CONSTRAINT "DeliveryPricing_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryQualityMeasurement" ADD CONSTRAINT "DeliveryQualityMeasurement_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryQualityMeasurement" ADD CONSTRAINT "DeliveryQualityMeasurement_qualityAttributeDefinitionId_fkey" FOREIGN KEY ("qualityAttributeDefinitionId") REFERENCES "QualityAttributeDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryQualityMeasurement" ADD CONSTRAINT "DeliveryQualityMeasurement_capturedByUserId_fkey" FOREIGN KEY ("capturedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryConfirmation" ADD CONSTRAINT "DeliveryConfirmation_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryConfirmation" ADD CONSTRAINT "DeliveryConfirmation_confirmedByFarmerId_fkey" FOREIGN KEY ("confirmedByFarmerId") REFERENCES "Farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryConfirmation" ADD CONSTRAINT "DeliveryConfirmation_witnessUserId_fkey" FOREIGN KEY ("witnessUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryReceipt" ADD CONSTRAINT "DeliveryReceipt_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryReceipt" ADD CONSTRAINT "DeliveryReceipt_issuedByUserId_fkey" FOREIGN KEY ("issuedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryReceipt" ADD CONSTRAINT "DeliveryReceipt_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "DeliveryReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryCorrectionRequest" ADD CONSTRAINT "DeliveryCorrectionRequest_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryCorrectionRequest" ADD CONSTRAINT "DeliveryCorrectionRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryCorrectionRequest" ADD CONSTRAINT "DeliveryCorrectionRequest_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryCorrectionRequest" ADD CONSTRAINT "DeliveryCorrectionRequest_replacementDeliveryVersionId_fkey" FOREIGN KEY ("replacementDeliveryVersionId") REFERENCES "Delivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineOperation" ADD CONSTRAINT "OfflineOperation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineOperation" ADD CONSTRAINT "OfflineOperation_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "RegisteredDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineOperation" ADD CONSTRAINT "OfflineOperation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
