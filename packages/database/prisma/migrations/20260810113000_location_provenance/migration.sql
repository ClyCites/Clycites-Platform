CREATE TYPE "FarmLocationMethod" AS ENUM ('WALKED_GPS', 'DEVICE_FIX', 'MAP_TRACED', 'DECLARED');

ALTER TABLE "CollectionSession"
ADD COLUMN "openedLatitude" DECIMAL(9,6),
ADD COLUMN "openedLongitude" DECIMAL(10,6),
ADD COLUMN "openedAccuracyMeters" INTEGER,
ADD COLUMN "openedDistanceMeters" INTEGER,
ADD COLUMN "openedLocationFlagged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "closedLatitude" DECIMAL(9,6),
ADD COLUMN "closedLongitude" DECIMAL(10,6),
ADD COLUMN "closedAccuracyMeters" INTEGER,
ADD COLUMN "closedDistanceMeters" INTEGER,
ADD COLUMN "closedLocationFlagged" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Farm"
ADD COLUMN "locationAccuracyMeters" INTEGER,
ADD COLUMN "locationMethod" "FarmLocationMethod",
ADD COLUMN "locatedAt" TIMESTAMPTZ(3),
ADD COLUMN "locatedByUserId" UUID;

UPDATE "Farm"
SET "locationMethod" = 'DECLARED'
WHERE "latitude" IS NOT NULL AND "longitude" IS NOT NULL AND "locationMethod" IS NULL;

UPDATE "CollectionPoint"
SET "status" = 'INACTIVE'
WHERE "status" = 'ACTIVE'
  AND "deletedAt" IS NULL
  AND ("latitude" IS NULL OR "longitude" IS NULL);

UPDATE "Farm"
SET "status" = 'INACTIVE'
WHERE "status" = 'ACTIVE'
  AND "deletedAt" IS NULL
  AND ("latitude" IS NULL OR "longitude" IS NULL OR "locationMethod" IS NULL);

CREATE TABLE "FarmPlot" (
  "id" UUID NOT NULL,
  "farmId" UUID NOT NULL,
  "plotNumber" VARCHAR(40) NOT NULL,
  "boundary" JSONB NOT NULL,
  "vertexCount" INTEGER NOT NULL,
  "centroidLatitude" DECIMAL(9,6) NOT NULL,
  "centroidLongitude" DECIMAL(10,6) NOT NULL,
  "computedHectares" DECIMAL(12,4) NOT NULL,
  "surveyMethod" "FarmLocationMethod" NOT NULL,
  "surveyAccuracyMeters" INTEGER,
  "surveyedAt" TIMESTAMPTZ(3) NOT NULL,
  "surveyedByUserId" UUID NOT NULL,
  "areaDiscrepancyFlagged" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "deletedAt" TIMESTAMPTZ(3),
  CONSTRAINT "FarmPlot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FarmPlot_farmId_plotNumber_key" ON "FarmPlot"("farmId", "plotNumber");
CREATE INDEX "FarmPlot_farmId_deletedAt_idx" ON "FarmPlot"("farmId", "deletedAt");
CREATE INDEX "FarmPlot_surveyedByUserId_surveyedAt_idx" ON "FarmPlot"("surveyedByUserId", "surveyedAt");

ALTER TABLE "Farm"
ADD CONSTRAINT "Farm_locatedByUserId_fkey"
FOREIGN KEY ("locatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FarmPlot"
ADD CONSTRAINT "FarmPlot_farmId_fkey"
FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FarmPlot"
ADD CONSTRAINT "FarmPlot_surveyedByUserId_fkey"
FOREIGN KEY ("surveyedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
