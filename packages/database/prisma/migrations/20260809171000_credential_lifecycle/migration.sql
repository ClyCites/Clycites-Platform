CREATE TYPE "AccountClass" AS ENUM ('STAFF', 'FARMER');

ALTER TABLE "User"
ADD COLUMN "accountClass" "AccountClass" NOT NULL DEFAULT 'STAFF';

CREATE TABLE "UserInvitation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tokenHash" VARCHAR(64) NOT NULL,
  "userId" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "invitedByUserId" UUID NOT NULL,
  "accountClass" "AccountClass" NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "acceptedAt" TIMESTAMPTZ(3),
  "revokedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "UserInvitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PasswordReset" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tokenHash" VARCHAR(64) NOT NULL,
  "userId" UUID NOT NULL,
  "accountClass" "AccountClass" NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "consumedAt" TIMESTAMPTZ(3),
  "revokedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailVerification" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tokenHash" VARCHAR(64) NOT NULL,
  "userId" UUID NOT NULL,
  "email" VARCHAR(320) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "consumedAt" TIMESTAMPTZ(3),
  "revokedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "EmailVerification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserInvitation_tokenHash_key" ON "UserInvitation"("tokenHash");
CREATE INDEX "UserInvitation_organizationId_userId_acceptedAt_revokedAt_idx" ON "UserInvitation"("organizationId", "userId", "acceptedAt", "revokedAt");
CREATE INDEX "UserInvitation_invitedByUserId_createdAt_idx" ON "UserInvitation"("invitedByUserId", "createdAt");
CREATE INDEX "UserInvitation_expiresAt_idx" ON "UserInvitation"("expiresAt");
CREATE UNIQUE INDEX "PasswordReset_tokenHash_key" ON "PasswordReset"("tokenHash");
CREATE INDEX "PasswordReset_userId_consumedAt_revokedAt_idx" ON "PasswordReset"("userId", "consumedAt", "revokedAt");
CREATE INDEX "PasswordReset_expiresAt_idx" ON "PasswordReset"("expiresAt");
CREATE UNIQUE INDEX "EmailVerification_tokenHash_key" ON "EmailVerification"("tokenHash");
CREATE INDEX "EmailVerification_userId_consumedAt_revokedAt_idx" ON "EmailVerification"("userId", "consumedAt", "revokedAt");
CREATE INDEX "EmailVerification_expiresAt_idx" ON "EmailVerification"("expiresAt");

ALTER TABLE "UserInvitation" ADD CONSTRAINT "UserInvitation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserInvitation" ADD CONSTRAINT "UserInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserInvitation" ADD CONSTRAINT "UserInvitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmailVerification" ADD CONSTRAINT "EmailVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
