-- Farmer attribution must survive a transformation. DERIVED contributions carry the
-- delivery-level attribution of the input batches onto each output batch. They record
-- no quantity movement: there is deliberately no inventory ledger entry for them and
-- they do not increment ProduceBatch.initialQuantity, so DIRECT and DERIVED rows must
-- never be summed together.
CREATE TYPE "FarmerBatchContributionOrigin" AS ENUM ('DIRECT', 'DERIVED');

ALTER TABLE "FarmerBatchContribution"
  ADD COLUMN "origin" "FarmerBatchContributionOrigin" NOT NULL DEFAULT 'DIRECT',
  ADD COLUMN "transformationId" UUID;

ALTER TABLE "FarmerBatchContribution"
  ADD CONSTRAINT "FarmerBatchContribution_transformationId_fkey"
  FOREIGN KEY ("transformationId") REFERENCES "BatchTransformation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- A DERIVED row is only meaningful with the transformation that produced it, and a
-- DIRECT row must never claim one.
ALTER TABLE "FarmerBatchContribution"
  ADD CONSTRAINT "FarmerBatchContribution_origin_transformation_check"
  CHECK (
    ("origin" = 'DERIVED' AND "transformationId" IS NOT NULL)
    OR ("origin" = 'DIRECT' AND "transformationId" IS NULL)
  );

CREATE INDEX "FarmerBatchContribution_batchId_reversedAt_idx"
  ON "FarmerBatchContribution"("batchId", "reversedAt");

CREATE INDEX "FarmerBatchContribution_transformationId_idx"
  ON "FarmerBatchContribution"("transformationId");
