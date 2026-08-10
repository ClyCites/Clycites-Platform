CREATE TYPE "MfaChallengePurpose" AS ENUM ('ENROLLMENT', 'LOGIN', 'DEVICE_LOGIN');

ALTER TABLE "User"
ADD COLUMN "mfaSecretEncrypted" TEXT,
ADD COLUMN "mfaEnrolledAt" TIMESTAMPTZ(3);

ALTER TABLE "Session"
ADD COLUMN "mfaSatisfiedAt" TIMESTAMPTZ(3);

CREATE TABLE "MfaChallenge" (
    "id" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" "MfaChallengePurpose" NOT NULL,
    "pendingSecretEncrypted" TEXT,
    "sessionId" UUID,
    "deviceId" UUID,
    "ipAddress" INET,
    "userAgent" VARCHAR(512),
    "attemptsRemaining" INTEGER NOT NULL DEFAULT 5,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MfaChallenge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MfaRecoveryCode" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "codeHash" VARCHAR(64) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MfaRecoveryCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MfaChallenge_tokenHash_key" ON "MfaChallenge"("tokenHash");
CREATE INDEX "MfaChallenge_userId_purpose_consumedAt_expiresAt_idx" ON "MfaChallenge"("userId", "purpose", "consumedAt", "expiresAt");
CREATE UNIQUE INDEX "MfaRecoveryCode_codeHash_key" ON "MfaRecoveryCode"("codeHash");
CREATE INDEX "MfaRecoveryCode_userId_usedAt_idx" ON "MfaRecoveryCode"("userId", "usedAt");

ALTER TABLE "MfaChallenge" ADD CONSTRAINT "MfaChallenge_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MfaRecoveryCode" ADD CONSTRAINT "MfaRecoveryCode_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;