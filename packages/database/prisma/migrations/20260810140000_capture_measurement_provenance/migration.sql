CREATE TYPE "WeighingInstrumentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'RETIRED');

CREATE TABLE "WeighingInstrument" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "serialNumber" VARCHAR(120) NOT NULL,
    "type" VARCHAR(120) NOT NULL,
    "calibratedAt" DATE NOT NULL,
    "calibrationCertificateReference" VARCHAR(200) NOT NULL,
    "status" "WeighingInstrumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "WeighingInstrument_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DeliveryMeasurement"
    ADD COLUMN "reportedInstrumentId" UUID,
    ADD COLUMN "instrumentId" UUID,
    ADD COLUMN "instrumentFlagged" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "instrumentFlagReason" VARCHAR(80) DEFAULT 'INSTRUMENT_NOT_RECORDED',
    ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "supersedesMeasurementId" UUID,
    ADD COLUMN "supersededAt" TIMESTAMPTZ(3);

DROP INDEX "DeliveryMeasurement_deliveryId_measurementType_key";

CREATE UNIQUE INDEX "WeighingInstrument_organizationId_serialNumber_key"
ON "WeighingInstrument"("organizationId", "serialNumber");
CREATE INDEX "WeighingInstrument_organizationId_status_calibratedAt_idx"
ON "WeighingInstrument"("organizationId", "status", "calibratedAt");
CREATE UNIQUE INDEX "DeliveryMeasurement_supersedesMeasurementId_key"
ON "DeliveryMeasurement"("supersedesMeasurementId");
CREATE UNIQUE INDEX "DeliveryMeasurement_one_live_type_key"
ON "DeliveryMeasurement"("deliveryId", "measurementType") WHERE "supersededAt" IS NULL;
CREATE INDEX "DeliveryMeasurement_deliveryId_measurementType_version_idx"
ON "DeliveryMeasurement"("deliveryId", "measurementType", "version");
CREATE INDEX "DeliveryMeasurement_instrumentId_capturedAt_idx"
ON "DeliveryMeasurement"("instrumentId", "capturedAt");

ALTER TABLE "WeighingInstrument"
ADD CONSTRAINT "WeighingInstrument_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryMeasurement"
ADD CONSTRAINT "DeliveryMeasurement_instrumentId_fkey"
FOREIGN KEY ("instrumentId") REFERENCES "WeighingInstrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryMeasurement"
ADD CONSTRAINT "DeliveryMeasurement_supersedesMeasurementId_fkey"
FOREIGN KEY ("supersedesMeasurementId") REFERENCES "DeliveryMeasurement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeliveryMeasurement"
    ADD CONSTRAINT "DeliveryMeasurement_version_positive" CHECK ("version" > 0),
    ADD CONSTRAINT "DeliveryMeasurement_supersession_state" CHECK (
        ("supersededAt" IS NULL) OR ("supersedesMeasurementId" IS NULL OR "supersededAt" >= "createdAt")
    );
