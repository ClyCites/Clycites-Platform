ALTER TABLE "RegisteredDevice"
ADD COLUMN "deviceTokenHash" VARCHAR(64),
ADD COLUMN "deviceTokenIssuedAt" TIMESTAMPTZ(3);

ALTER TABLE "Session"
ADD COLUMN "deviceId" UUID;

CREATE INDEX "Session_deviceId_revokedAt_expiresAt_idx"
ON "Session"("deviceId", "revokedAt", "expiresAt");

ALTER TABLE "Session"
ADD CONSTRAINT "Session_deviceId_fkey"
FOREIGN KEY ("deviceId") REFERENCES "RegisteredDevice"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
