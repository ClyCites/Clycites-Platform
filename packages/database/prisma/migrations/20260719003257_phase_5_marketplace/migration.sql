-- CreateEnum
CREATE TYPE "MarketplaceListingStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PAUSED', 'UNDER_OFFER', 'PARTIALLY_RESERVED', 'FULLY_RESERVED', 'CLOSED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ListingPricingMethod" AS ENUM ('FIXED_PRICE', 'NEGOTIABLE', 'REQUEST_FOR_OFFERS');

-- CreateEnum
CREATE TYPE "ListingVisibility" AS ENUM ('PUBLIC_BUYERS', 'INVITED_BUYERS', 'PRIVATE');

-- CreateEnum
CREATE TYPE "ListingInvitationStatus" AS ENUM ('INVITED', 'VIEWED', 'DECLINED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'COUNTERED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "LotReservationStatus" AS ENUM ('ACTIVE', 'CONTRACTED', 'CONSUMED', 'RELEASED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SalesContractStatus" AS ENUM ('DRAFT', 'PENDING_SELLER_APPROVAL', 'PENDING_BUYER_APPROVAL', 'ACTIVE', 'FULFILLED', 'CANCELLED', 'EXPIRED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "ContractAmendmentStatus" AS ENUM ('PROPOSED', 'PENDING_COUNTERPARTY', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('PENDING_FULFILLMENT', 'READY_FOR_DISPATCH', 'DISPATCHED', 'IN_TRANSIT', 'RECEIVED', 'PENDING_BUYER_INSPECTION', 'ACCEPTED', 'REJECTED', 'COMPLETED', 'CANCELLED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "BuyerInspectionStatus" AS ENUM ('DRAFT', 'COMPLETED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "BuyerAcceptanceDecision" AS ENUM ('ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TraceabilityShareStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "TraceabilityShareScope" AS ENUM ('LOT_SUMMARY', 'QUALITY_DETAILS', 'CUSTODY_DETAILS', 'TRACEABILITY_LINEAGE', 'DOCUMENTS');

-- AlterTable
ALTER TABLE "CooperativeLot" ADD COLUMN     "saleHoldAt" TIMESTAMPTZ(3),
ADD COLUMN     "saleHoldReason" VARCHAR(500);

-- CreateTable
CREATE TABLE "MarketplaceListing" (
    "id" UUID NOT NULL,
    "publicId" VARCHAR(128) NOT NULL,
    "listingNumber" VARCHAR(80) NOT NULL,
    "sellerOrganizationId" UUID NOT NULL,
    "lotId" UUID NOT NULL,
    "status" "MarketplaceListingStatus" NOT NULL DEFAULT 'DRAFT',
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000),
    "listedQuantity" DECIMAL(18,4) NOT NULL,
    "availableQuantity" DECIMAL(18,4) NOT NULL,
    "quantityUnit" "QuantityUnit" NOT NULL DEFAULT 'KG',
    "currency" CHAR(3) NOT NULL,
    "pricingMethod" "ListingPricingMethod" NOT NULL,
    "askingUnitPriceMinor" BIGINT,
    "minimumOfferUnitPriceMinor" BIGINT,
    "minimumOfferQuantity" DECIMAL(18,4),
    "allowPartialQuantity" BOOLEAN NOT NULL DEFAULT false,
    "visibility" "ListingVisibility" NOT NULL DEFAULT 'PUBLIC_BUYERS',
    "publishedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "createdByUserId" UUID NOT NULL,
    "updatedByUserId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MarketplaceListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceListingVersion" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "MarketplaceListingStatus" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000),
    "listedQuantity" DECIMAL(18,4) NOT NULL,
    "quantityUnit" "QuantityUnit" NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "pricingMethod" "ListingPricingMethod" NOT NULL,
    "askingUnitPriceMinor" BIGINT,
    "minimumOfferQuantity" DECIMAL(18,4),
    "allowPartialQuantity" BOOLEAN NOT NULL,
    "visibility" "ListingVisibility" NOT NULL,
    "expiresAt" TIMESTAMPTZ(3),
    "recordedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceListingVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingInvitation" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "buyerOrganizationId" UUID NOT NULL,
    "status" "ListingInvitationStatus" NOT NULL DEFAULT 'INVITED',
    "invitedByUserId" UUID NOT NULL,
    "invitedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ListingInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" UUID NOT NULL,
    "publicId" VARCHAR(128) NOT NULL,
    "offerNumber" VARCHAR(80) NOT NULL,
    "listingId" UUID NOT NULL,
    "sellerOrganizationId" UUID NOT NULL,
    "buyerOrganizationId" UUID NOT NULL,
    "parentOfferId" UUID,
    "rootOfferId" UUID,
    "roundNumber" INTEGER NOT NULL DEFAULT 1,
    "status" "OfferStatus" NOT NULL DEFAULT 'DRAFT',
    "quantity" DECIMAL(18,4) NOT NULL,
    "quantityUnit" "QuantityUnit" NOT NULL DEFAULT 'KG',
    "unitPriceMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "totalAmountMinor" BIGINT NOT NULL,
    "deliveryTerm" VARCHAR(200) NOT NULL,
    "proposedDeliveryDate" DATE,
    "validUntil" TIMESTAMPTZ(3) NOT NULL,
    "message" VARCHAR(1000),
    "submittedByUserId" UUID NOT NULL,
    "respondedByUserId" UUID,
    "respondedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LotReservation" (
    "id" UUID NOT NULL,
    "reservationNumber" VARCHAR(80) NOT NULL,
    "lotId" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "sellerOrganizationId" UUID NOT NULL,
    "buyerOrganizationId" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit" "QuantityUnit" NOT NULL DEFAULT 'KG',
    "status" "LotReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "reservedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "releasedAt" TIMESTAMPTZ(3),
    "releaseReason" VARCHAR(500),
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "LotReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesContract" (
    "id" UUID NOT NULL,
    "publicId" VARCHAR(128) NOT NULL,
    "contractNumber" VARCHAR(80) NOT NULL,
    "listingId" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "reservationId" UUID NOT NULL,
    "sellerOrganizationId" UUID NOT NULL,
    "buyerOrganizationId" UUID NOT NULL,
    "lotId" UUID NOT NULL,
    "status" "SalesContractStatus" NOT NULL DEFAULT 'PENDING_SELLER_APPROVAL',
    "quantity" DECIMAL(18,4) NOT NULL,
    "quantityUnit" "QuantityUnit" NOT NULL DEFAULT 'KG',
    "unitPriceMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "totalAmountMinor" BIGINT NOT NULL,
    "deliveryTerm" VARCHAR(200) NOT NULL,
    "deliveryLocationId" UUID,
    "expectedDeliveryDate" DATE,
    "paymentTerms" VARCHAR(1000) NOT NULL,
    "qualityTerms" JSONB NOT NULL,
    "additionalTerms" VARCHAR(2000),
    "sellerApprovedByUserId" UUID,
    "sellerApprovedAt" TIMESTAMPTZ(3),
    "buyerApprovedByUserId" UUID,
    "buyerApprovedAt" TIMESTAMPTZ(3),
    "activatedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancellationReason" VARCHAR(500),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SalesContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractAmendment" (
    "id" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "amendmentNumber" INTEGER NOT NULL,
    "status" "ContractAmendmentStatus" NOT NULL DEFAULT 'PROPOSED',
    "reason" VARCHAR(500) NOT NULL,
    "proposedChanges" JSONB NOT NULL,
    "requestedByOrganizationId" UUID NOT NULL,
    "requestedByUserId" UUID NOT NULL,
    "sellerApprovedByUserId" UUID,
    "buyerApprovedByUserId" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "rejectedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ContractAmendment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" UUID NOT NULL,
    "publicId" VARCHAR(128) NOT NULL,
    "orderNumber" VARCHAR(80) NOT NULL,
    "contractId" UUID NOT NULL,
    "reservationId" UUID NOT NULL,
    "custodyTransferId" UUID,
    "sellerOrganizationId" UUID NOT NULL,
    "buyerOrganizationId" UUID NOT NULL,
    "lotId" UUID NOT NULL,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'PENDING_FULFILLMENT',
    "quantity" DECIMAL(18,4) NOT NULL,
    "quantityUnit" "QuantityUnit" NOT NULL DEFAULT 'KG',
    "unitPriceMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "totalAmountMinor" BIGINT NOT NULL,
    "fulfillmentMethod" VARCHAR(120) NOT NULL,
    "expectedDispatchAt" TIMESTAMPTZ(3),
    "dispatchedAt" TIMESTAMPTZ(3),
    "receivedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancellationReason" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStatusEvent" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "fromStatus" "SalesOrderStatus",
    "toStatus" "SalesOrderStatus" NOT NULL,
    "reasonCode" VARCHAR(120),
    "reason" VARCHAR(500),
    "actorUserId" UUID NOT NULL,
    "actorOrganizationId" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerInspection" (
    "id" UUID NOT NULL,
    "inspectionNumber" VARCHAR(80) NOT NULL,
    "orderId" UUID NOT NULL,
    "lotId" UUID NOT NULL,
    "buyerOrganizationId" UUID NOT NULL,
    "status" "BuyerInspectionStatus" NOT NULL DEFAULT 'DRAFT',
    "inspectedByUserId" UUID NOT NULL,
    "sampledAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "notes" VARCHAR(1000),
    "supersedesInspectionId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BuyerInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerInspectionMeasurement" (
    "id" UUID NOT NULL,
    "inspectionId" UUID NOT NULL,
    "qualityAttributeDefinitionId" UUID NOT NULL,
    "decimalValue" DECIMAL(18,6),
    "integerValue" INTEGER,
    "textValue" VARCHAR(500),
    "booleanValue" BOOLEAN,
    "enumValue" VARCHAR(120),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuyerInspectionMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerAcceptance" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "buyerInspectionId" UUID,
    "decision" "BuyerAcceptanceDecision" NOT NULL,
    "acceptedQuantity" DECIMAL(18,4) NOT NULL,
    "rejectedQuantity" DECIMAL(18,4) NOT NULL,
    "unit" "QuantityUnit" NOT NULL DEFAULT 'KG',
    "reasonCode" VARCHAR(120),
    "reason" VARCHAR(1000),
    "decidedByUserId" UUID NOT NULL,
    "decidedAt" TIMESTAMPTZ(3) NOT NULL,
    "supersedesAcceptanceId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuyerAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TraceabilityShare" (
    "id" UUID NOT NULL,
    "publicId" VARCHAR(128) NOT NULL,
    "sellerOrganizationId" UUID NOT NULL,
    "buyerOrganizationId" UUID NOT NULL,
    "listingId" UUID,
    "contractId" UUID,
    "lotId" UUID NOT NULL,
    "status" "TraceabilityShareStatus" NOT NULL DEFAULT 'ACTIVE',
    "scopes" "TraceabilityShareScope"[],
    "accessTokenHash" VARCHAR(255),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TraceabilityShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceListing_publicId_key" ON "MarketplaceListing"("publicId");

-- CreateIndex
CREATE INDEX "MarketplaceListing_sellerOrganizationId_status_createdAt_idx" ON "MarketplaceListing"("sellerOrganizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MarketplaceListing_lotId_status_idx" ON "MarketplaceListing"("lotId", "status");

-- CreateIndex
CREATE INDEX "MarketplaceListing_status_visibility_expiresAt_idx" ON "MarketplaceListing"("status", "visibility", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceListing_sellerOrganizationId_listingNumber_key" ON "MarketplaceListing"("sellerOrganizationId", "listingNumber");

-- CreateIndex
CREATE INDEX "MarketplaceListingVersion_listingId_createdAt_idx" ON "MarketplaceListingVersion"("listingId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceListingVersion_listingId_version_key" ON "MarketplaceListingVersion"("listingId", "version");

-- CreateIndex
CREATE INDEX "ListingInvitation_buyerOrganizationId_status_expiresAt_idx" ON "ListingInvitation"("buyerOrganizationId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "ListingInvitation_listingId_status_idx" ON "ListingInvitation"("listingId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ListingInvitation_listingId_buyerOrganizationId_key" ON "ListingInvitation"("listingId", "buyerOrganizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_publicId_key" ON "Offer"("publicId");

-- CreateIndex
CREATE INDEX "Offer_listingId_status_createdAt_idx" ON "Offer"("listingId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Offer_sellerOrganizationId_status_createdAt_idx" ON "Offer"("sellerOrganizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Offer_buyerOrganizationId_status_createdAt_idx" ON "Offer"("buyerOrganizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Offer_rootOfferId_roundNumber_idx" ON "Offer"("rootOfferId", "roundNumber");

-- CreateIndex
CREATE INDEX "Offer_status_validUntil_idx" ON "Offer"("status", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_buyerOrganizationId_offerNumber_key" ON "Offer"("buyerOrganizationId", "offerNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_parentOfferId_key" ON "Offer"("parentOfferId");

-- CreateIndex
CREATE UNIQUE INDEX "LotReservation_offerId_key" ON "LotReservation"("offerId");

-- CreateIndex
-- CreateIndex
CREATE INDEX "LotReservation_lotId_status_expiresAt_idx" ON "LotReservation"("lotId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "LotReservation_listingId_status_idx" ON "LotReservation"("listingId", "status");

-- CreateIndex
CREATE INDEX "LotReservation_buyerOrganizationId_status_createdAt_idx" ON "LotReservation"("buyerOrganizationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LotReservation_sellerOrganizationId_reservationNumber_key" ON "LotReservation"("sellerOrganizationId", "reservationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SalesContract_publicId_key" ON "SalesContract"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesContract_offerId_key" ON "SalesContract"("offerId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesContract_reservationId_key" ON "SalesContract"("reservationId");

-- CreateIndex
CREATE INDEX "SalesContract_sellerOrganizationId_status_createdAt_idx" ON "SalesContract"("sellerOrganizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SalesContract_buyerOrganizationId_status_createdAt_idx" ON "SalesContract"("buyerOrganizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SalesContract_lotId_status_idx" ON "SalesContract"("lotId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SalesContract_sellerOrganizationId_contractNumber_key" ON "SalesContract"("sellerOrganizationId", "contractNumber");

-- CreateIndex
CREATE INDEX "ContractAmendment_contractId_status_createdAt_idx" ON "ContractAmendment"("contractId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ContractAmendment_requestedByOrganizationId_status_idx" ON "ContractAmendment"("requestedByOrganizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ContractAmendment_contractId_amendmentNumber_key" ON "ContractAmendment"("contractId", "amendmentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_publicId_key" ON "SalesOrder"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_contractId_key" ON "SalesOrder"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_reservationId_key" ON "SalesOrder"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_custodyTransferId_key" ON "SalesOrder"("custodyTransferId");

-- CreateIndex
CREATE INDEX "SalesOrder_sellerOrganizationId_status_createdAt_idx" ON "SalesOrder"("sellerOrganizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SalesOrder_buyerOrganizationId_status_createdAt_idx" ON "SalesOrder"("buyerOrganizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SalesOrder_lotId_status_idx" ON "SalesOrder"("lotId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_sellerOrganizationId_orderNumber_key" ON "SalesOrder"("sellerOrganizationId", "orderNumber");

-- CreateIndex
CREATE INDEX "OrderStatusEvent_orderId_occurredAt_idx" ON "OrderStatusEvent"("orderId", "occurredAt");

-- CreateIndex
CREATE INDEX "OrderStatusEvent_actorOrganizationId_occurredAt_idx" ON "OrderStatusEvent"("actorOrganizationId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "BuyerInspection_supersedesInspectionId_key" ON "BuyerInspection"("supersedesInspectionId");

-- CreateIndex
CREATE INDEX "BuyerInspection_orderId_status_createdAt_idx" ON "BuyerInspection"("orderId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "BuyerInspection_lotId_createdAt_idx" ON "BuyerInspection"("lotId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BuyerInspection_buyerOrganizationId_inspectionNumber_key" ON "BuyerInspection"("buyerOrganizationId", "inspectionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BuyerInspectionMeasurement_inspectionId_qualityAttributeDef_key" ON "BuyerInspectionMeasurement"("inspectionId", "qualityAttributeDefinitionId");

-- CreateIndex
CREATE INDEX "BuyerAcceptance_orderId_decidedAt_idx" ON "BuyerAcceptance"("orderId", "decidedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BuyerAcceptance_supersedesAcceptanceId_key" ON "BuyerAcceptance"("supersedesAcceptanceId");

-- CreateIndex
CREATE INDEX "BuyerAcceptance_buyerInspectionId_idx" ON "BuyerAcceptance"("buyerInspectionId");

-- CreateIndex
CREATE INDEX "BuyerAcceptance_decidedAt_idx" ON "BuyerAcceptance"("decidedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TraceabilityShare_publicId_key" ON "TraceabilityShare"("publicId");

-- CreateIndex
CREATE INDEX "TraceabilityShare_sellerOrganizationId_status_expiresAt_idx" ON "TraceabilityShare"("sellerOrganizationId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "TraceabilityShare_buyerOrganizationId_status_expiresAt_idx" ON "TraceabilityShare"("buyerOrganizationId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "TraceabilityShare_listingId_status_idx" ON "TraceabilityShare"("listingId", "status");

-- CreateIndex
CREATE INDEX "TraceabilityShare_contractId_status_idx" ON "TraceabilityShare"("contractId", "status");

-- CreateIndex
CREATE INDEX "TraceabilityShare_lotId_status_idx" ON "TraceabilityShare"("lotId", "status");

-- Commercial invariants
ALTER TABLE "MarketplaceListing"
    ADD CONSTRAINT "MarketplaceListing_quantity_check" CHECK ("listedQuantity" > 0 AND "availableQuantity" >= 0 AND "availableQuantity" <= "listedQuantity"),
    ADD CONSTRAINT "MarketplaceListing_money_check" CHECK ("askingUnitPriceMinor" IS NULL OR "askingUnitPriceMinor" >= 0),
    ADD CONSTRAINT "MarketplaceListing_minimum_money_check" CHECK ("minimumOfferUnitPriceMinor" IS NULL OR "minimumOfferUnitPriceMinor" >= 0),
    ADD CONSTRAINT "MarketplaceListing_minimum_quantity_check" CHECK ("minimumOfferQuantity" IS NULL OR ("minimumOfferQuantity" > 0 AND "minimumOfferQuantity" <= "listedQuantity")),
    ADD CONSTRAINT "MarketplaceListing_version_check" CHECK ("version" > 0),
    ADD CONSTRAINT "MarketplaceListing_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "MarketplaceListingVersion"
    ADD CONSTRAINT "MarketplaceListingVersion_quantity_check" CHECK ("listedQuantity" > 0),
    ADD CONSTRAINT "MarketplaceListingVersion_money_check" CHECK ("askingUnitPriceMinor" IS NULL OR "askingUnitPriceMinor" >= 0),
    ADD CONSTRAINT "MarketplaceListingVersion_version_check" CHECK ("version" > 0),
    ADD CONSTRAINT "MarketplaceListingVersion_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "Offer"
    ADD CONSTRAINT "Offer_quantity_check" CHECK ("quantity" > 0),
    ADD CONSTRAINT "Offer_money_check" CHECK ("unitPriceMinor" >= 0 AND "totalAmountMinor" >= 0),
    ADD CONSTRAINT "Offer_round_check" CHECK ("roundNumber" > 0),
    ADD CONSTRAINT "Offer_version_check" CHECK ("version" > 0),
    ADD CONSTRAINT "Offer_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
    ADD CONSTRAINT "Offer_distinct_parties_check" CHECK ("sellerOrganizationId" <> "buyerOrganizationId");

ALTER TABLE "LotReservation"
    ADD CONSTRAINT "LotReservation_quantity_check" CHECK ("quantity" > 0),
    ADD CONSTRAINT "LotReservation_version_check" CHECK ("version" > 0),
    ADD CONSTRAINT "LotReservation_distinct_parties_check" CHECK ("sellerOrganizationId" <> "buyerOrganizationId");

ALTER TABLE "SalesContract"
    ADD CONSTRAINT "SalesContract_quantity_check" CHECK ("quantity" > 0),
    ADD CONSTRAINT "SalesContract_money_check" CHECK ("unitPriceMinor" >= 0 AND "totalAmountMinor" >= 0),
    ADD CONSTRAINT "SalesContract_version_check" CHECK ("version" > 0),
    ADD CONSTRAINT "SalesContract_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
    ADD CONSTRAINT "SalesContract_distinct_parties_check" CHECK ("sellerOrganizationId" <> "buyerOrganizationId"),
    ADD CONSTRAINT "SalesContract_distinct_approvers_check" CHECK ("sellerApprovedByUserId" IS NULL OR "buyerApprovedByUserId" IS NULL OR "sellerApprovedByUserId" <> "buyerApprovedByUserId");

ALTER TABLE "ContractAmendment"
    ADD CONSTRAINT "ContractAmendment_number_check" CHECK ("amendmentNumber" > 0);

ALTER TABLE "SalesOrder"
    ADD CONSTRAINT "SalesOrder_quantity_check" CHECK ("quantity" > 0),
    ADD CONSTRAINT "SalesOrder_money_check" CHECK ("unitPriceMinor" >= 0 AND "totalAmountMinor" >= 0),
    ADD CONSTRAINT "SalesOrder_version_check" CHECK ("version" > 0),
    ADD CONSTRAINT "SalesOrder_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
    ADD CONSTRAINT "SalesOrder_distinct_parties_check" CHECK ("sellerOrganizationId" <> "buyerOrganizationId");

ALTER TABLE "BuyerAcceptance"
    ADD CONSTRAINT "BuyerAcceptance_quantity_check" CHECK ("acceptedQuantity" >= 0 AND "rejectedQuantity" >= 0 AND ("acceptedQuantity" + "rejectedQuantity") > 0),
    ADD CONSTRAINT "BuyerAcceptance_reason_check" CHECK ("decision" = 'ACCEPTED' OR ("reason" IS NOT NULL AND length(trim("reason")) > 0));

ALTER TABLE "TraceabilityShare"
    ADD CONSTRAINT "TraceabilityShare_scope_check" CHECK (cardinality("scopes") > 0),
    ADD CONSTRAINT "TraceabilityShare_distinct_parties_check" CHECK ("sellerOrganizationId" <> "buyerOrganizationId");

-- Restrictive foreign keys preserve commercial and evidence history.
ALTER TABLE "MarketplaceListing"
    ADD CONSTRAINT "MarketplaceListing_sellerOrganizationId_fkey" FOREIGN KEY ("sellerOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "MarketplaceListing_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "CooperativeLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "MarketplaceListing_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "MarketplaceListing_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MarketplaceListingVersion"
    ADD CONSTRAINT "MarketplaceListingVersion_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "MarketplaceListingVersion_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ListingInvitation"
    ADD CONSTRAINT "ListingInvitation_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ListingInvitation_buyerOrganizationId_fkey" FOREIGN KEY ("buyerOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ListingInvitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Offer"
    ADD CONSTRAINT "Offer_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "Offer_sellerOrganizationId_fkey" FOREIGN KEY ("sellerOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "Offer_buyerOrganizationId_fkey" FOREIGN KEY ("buyerOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "Offer_parentOfferId_fkey" FOREIGN KEY ("parentOfferId") REFERENCES "Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "Offer_rootOfferId_fkey" FOREIGN KEY ("rootOfferId") REFERENCES "Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "Offer_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "Offer_respondedByUserId_fkey" FOREIGN KEY ("respondedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LotReservation"
    ADD CONSTRAINT "LotReservation_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "CooperativeLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "LotReservation_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "LotReservation_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "LotReservation_sellerOrganizationId_fkey" FOREIGN KEY ("sellerOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "LotReservation_buyerOrganizationId_fkey" FOREIGN KEY ("buyerOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SalesContract"
    ADD CONSTRAINT "SalesContract_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "SalesContract_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "SalesContract_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "LotReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "SalesContract_sellerOrganizationId_fkey" FOREIGN KEY ("sellerOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "SalesContract_buyerOrganizationId_fkey" FOREIGN KEY ("buyerOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "SalesContract_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "CooperativeLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "SalesContract_deliveryLocationId_fkey" FOREIGN KEY ("deliveryLocationId") REFERENCES "StorageLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "SalesContract_sellerApprovedByUserId_fkey" FOREIGN KEY ("sellerApprovedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "SalesContract_buyerApprovedByUserId_fkey" FOREIGN KEY ("buyerApprovedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ContractAmendment"
    ADD CONSTRAINT "ContractAmendment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "SalesContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ContractAmendment_requestedByOrganizationId_fkey" FOREIGN KEY ("requestedByOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ContractAmendment_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ContractAmendment_sellerApprovedByUserId_fkey" FOREIGN KEY ("sellerApprovedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ContractAmendment_buyerApprovedByUserId_fkey" FOREIGN KEY ("buyerApprovedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SalesOrder"
    ADD CONSTRAINT "SalesOrder_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "SalesContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "SalesOrder_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "LotReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "SalesOrder_custodyTransferId_fkey" FOREIGN KEY ("custodyTransferId") REFERENCES "CustodyTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "SalesOrder_sellerOrganizationId_fkey" FOREIGN KEY ("sellerOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "SalesOrder_buyerOrganizationId_fkey" FOREIGN KEY ("buyerOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "SalesOrder_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "CooperativeLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderStatusEvent"
    ADD CONSTRAINT "OrderStatusEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "OrderStatusEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "OrderStatusEvent_actorOrganizationId_fkey" FOREIGN KEY ("actorOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BuyerInspection"
    ADD CONSTRAINT "BuyerInspection_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "BuyerInspection_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "CooperativeLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "BuyerInspection_buyerOrganizationId_fkey" FOREIGN KEY ("buyerOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "BuyerInspection_inspectedByUserId_fkey" FOREIGN KEY ("inspectedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "BuyerInspection_supersedesInspectionId_fkey" FOREIGN KEY ("supersedesInspectionId") REFERENCES "BuyerInspection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BuyerInspectionMeasurement"
    ADD CONSTRAINT "BuyerInspectionMeasurement_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "BuyerInspection"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "BuyerInspectionMeasurement_qualityAttributeDefinitionId_fkey" FOREIGN KEY ("qualityAttributeDefinitionId") REFERENCES "QualityAttributeDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "BuyerInspectionMeasurement_single_value_check" CHECK (num_nonnulls("decimalValue", "integerValue", "textValue", "booleanValue", "enumValue") = 1);

ALTER TABLE "BuyerAcceptance"
    ADD CONSTRAINT "BuyerAcceptance_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "BuyerAcceptance_buyerInspectionId_fkey" FOREIGN KEY ("buyerInspectionId") REFERENCES "BuyerInspection"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "BuyerAcceptance_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "BuyerAcceptance_supersedesAcceptanceId_fkey" FOREIGN KEY ("supersedesAcceptanceId") REFERENCES "BuyerAcceptance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TraceabilityShare"
    ADD CONSTRAINT "TraceabilityShare_sellerOrganizationId_fkey" FOREIGN KEY ("sellerOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "TraceabilityShare_buyerOrganizationId_fkey" FOREIGN KEY ("buyerOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "TraceabilityShare_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "TraceabilityShare_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "SalesContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "TraceabilityShare_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "CooperativeLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "TraceabilityShare_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "reject_phase_five_history_mutation"()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "MarketplaceListingVersion_append_only"
BEFORE UPDATE OR DELETE ON "MarketplaceListingVersion"
FOR EACH ROW EXECUTE FUNCTION "reject_phase_five_history_mutation"();

CREATE TRIGGER "OrderStatusEvent_append_only"
BEFORE UPDATE OR DELETE ON "OrderStatusEvent"
FOR EACH ROW EXECUTE FUNCTION "reject_phase_five_history_mutation"();

CREATE TRIGGER "BuyerAcceptance_append_only"
BEFORE UPDATE OR DELETE ON "BuyerAcceptance"
FOR EACH ROW EXECUTE FUNCTION "reject_phase_five_history_mutation"();
