CREATE TYPE "IdentifierKind" AS ENUM ('USERNAME', 'EMAIL', 'PHONE');

ALTER TYPE "ConsentCaptureMethod" ADD VALUE 'SELF_SERVICE';

ALTER TABLE "User"
ADD COLUMN "username" VARCHAR(40),
ADD COLUMN "usernameSetAt" TIMESTAMPTZ(3);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "User"
    WHERE "phone" IS NOT NULL
    GROUP BY "phone"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate User.phone values must be resolved before WP6 migration';
  END IF;
END
$$;

DROP INDEX IF EXISTS "User_phone_idx";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

CREATE TABLE "RetiredIdentifier" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "kind" "IdentifierKind" NOT NULL,
  "valueHash" VARCHAR(64) NOT NULL,
  "userId" UUID NOT NULL,
  "retiredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimableAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "RetiredIdentifier_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FarmerAccountReset" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "codeHash" VARCHAR(64) NOT NULL,
  "farmerId" UUID NOT NULL,
  "initiatedByUserId" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "redeemedAt" TIMESTAMPTZ(3),
  "revokedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FarmerAccountReset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RetiredIdentifier_kind_valueHash_key"
ON "RetiredIdentifier"("kind", "valueHash");
CREATE INDEX "RetiredIdentifier_claimableAt_idx" ON "RetiredIdentifier"("claimableAt");
CREATE INDEX "RetiredIdentifier_userId_retiredAt_idx"
ON "RetiredIdentifier"("userId", "retiredAt");

CREATE UNIQUE INDEX "FarmerAccountReset_codeHash_key" ON "FarmerAccountReset"("codeHash");
CREATE INDEX "FarmerAccountReset_farmerId_redeemedAt_revokedAt_idx"
ON "FarmerAccountReset"("farmerId", "redeemedAt", "revokedAt");
CREATE INDEX "FarmerAccountReset_initiatedByUserId_createdAt_idx"
ON "FarmerAccountReset"("initiatedByUserId", "createdAt");
CREATE INDEX "FarmerAccountReset_organizationId_createdAt_idx"
ON "FarmerAccountReset"("organizationId", "createdAt");
CREATE INDEX "FarmerAccountReset_expiresAt_idx" ON "FarmerAccountReset"("expiresAt");

ALTER TABLE "RetiredIdentifier"
ADD CONSTRAINT "RetiredIdentifier_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FarmerAccountReset"
ADD CONSTRAINT "FarmerAccountReset_farmerId_fkey"
FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FarmerAccountReset"
ADD CONSTRAINT "FarmerAccountReset_initiatedByUserId_fkey"
FOREIGN KEY ("initiatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FarmerAccountReset"
ADD CONSTRAINT "FarmerAccountReset_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
