-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('PLATFORM_ADMIN');

-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('COOPERATIVE', 'BUYER', 'PROCESSOR', 'EXPORTER', 'LOGISTICS_PROVIDER');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OrganizationRole" AS ENUM ('COOPERATIVE_ADMIN', 'COLLECTION_AGENT', 'FINANCE_OFFICER', 'QUALITY_INSPECTOR', 'BUYER', 'VIEWER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "CollectionPointStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "FarmerStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'INACTIVE', 'DECEASED');

-- CreateEnum
CREATE TYPE "FarmerMembershipStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'LEFT');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('FEMALE', 'MALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "AreaUnit" AS ENUM ('ACRE', 'HECTARE');

-- CreateEnum
CREATE TYPE "FarmStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QrIdentityStatus" AS ENUM ('ACTIVE', 'REVOKED', 'REPLACED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('DATA_PROCESSING', 'SMS_NOTIFICATIONS', 'TRACEABILITY', 'MARKETPLACE_VISIBILITY');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('GRANTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ConsentCaptureMethod" AS ENUM ('DIGITAL_SIGNATURE', 'CHECKBOX', 'PAPER_FORM', 'VERBAL_WITNESSED');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'SYSTEM');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320),
    "phone" VARCHAR(32),
    "passwordHash" VARCHAR(255) NOT NULL,
    "firstName" VARCHAR(100) NOT NULL,
    "lastName" VARCHAR(100) NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "platformRole" "PlatformRole",
    "emailVerifiedAt" TIMESTAMPTZ(3),
    "phoneVerifiedAt" TIMESTAMPTZ(3),
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "refreshTokenHash" VARCHAR(255) NOT NULL,
    "deviceName" VARCHAR(160),
    "ipAddress" INET,
    "userAgent" VARCHAR(512),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "lastUsedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "type" "OrganizationType" NOT NULL,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'PENDING',
    "registrationNumber" VARCHAR(120),
    "phone" VARCHAR(32),
    "email" VARCHAR(320),
    "district" VARCHAR(120),
    "subCounty" VARCHAR(120),
    "address" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMembership" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "OrganizationRole" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'INVITED',
    "invitedByUserId" UUID,
    "joinedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionPoint" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "status" "CollectionPointStatus" NOT NULL DEFAULT 'ACTIVE',
    "district" VARCHAR(120) NOT NULL,
    "subCounty" VARCHAR(120),
    "parish" VARCHAR(120),
    "village" VARCHAR(120),
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(10,6),
    "timezone" VARCHAR(80) NOT NULL DEFAULT 'Africa/Kampala',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "CollectionPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Farmer" (
    "id" UUID NOT NULL,
    "farmerNumber" VARCHAR(40) NOT NULL,
    "firstName" VARCHAR(100) NOT NULL,
    "middleName" VARCHAR(100),
    "lastName" VARCHAR(100) NOT NULL,
    "preferredName" VARCHAR(100),
    "gender" "Gender",
    "dateOfBirth" DATE,
    "primaryPhone" VARCHAR(32),
    "alternativePhone" VARCHAR(32),
    "email" VARCHAR(320),
    "district" VARCHAR(120) NOT NULL,
    "subCounty" VARCHAR(120),
    "parish" VARCHAR(120),
    "village" VARCHAR(120),
    "status" "FarmerStatus" NOT NULL DEFAULT 'DRAFT',
    "userId" UUID,
    "registeredByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Farmer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FarmerOrganizationMembership" (
    "id" UUID NOT NULL,
    "farmerId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "membershipNumber" VARCHAR(80),
    "status" "FarmerMembershipStatus" NOT NULL DEFAULT 'PENDING',
    "joinedAt" TIMESTAMPTZ(3),
    "leftAt" TIMESTAMPTZ(3),
    "registeredAtCollectionPointId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FarmerOrganizationMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Farm" (
    "id" UUID NOT NULL,
    "farmerId" UUID NOT NULL,
    "organizationId" UUID,
    "name" VARCHAR(200) NOT NULL,
    "district" VARCHAR(120) NOT NULL,
    "subCounty" VARCHAR(120),
    "parish" VARCHAR(120),
    "village" VARCHAR(120),
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(10,6),
    "totalArea" DECIMAL(12,4) NOT NULL,
    "areaUnit" "AreaUnit" NOT NULL,
    "ownershipType" VARCHAR(80),
    "waterSource" VARCHAR(120),
    "status" "FarmStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Farm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FarmerQrIdentity" (
    "id" UUID NOT NULL,
    "farmerId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "publicId" VARCHAR(128) NOT NULL,
    "status" "QrIdentityStatus" NOT NULL DEFAULT 'ACTIVE',
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "replacedById" UUID,
    "issuedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FarmerQrIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FarmerConsent" (
    "id" UUID NOT NULL,
    "farmerId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "consentType" "ConsentType" NOT NULL,
    "policyVersion" VARCHAR(40) NOT NULL,
    "status" "ConsentStatus" NOT NULL,
    "capturedByUserId" UUID NOT NULL,
    "captureMethod" "ConsentCaptureMethod" NOT NULL,
    "capturedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMPTZ(3),
    "notes" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FarmerConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "actorUserId" UUID,
    "actorType" "AuditActorType" NOT NULL,
    "action" VARCHAR(120) NOT NULL,
    "entityType" VARCHAR(120) NOT NULL,
    "entityId" UUID NOT NULL,
    "requestId" VARCHAR(128) NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_phone_idx" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_status_deletedAt_idx" ON "User"("status", "deletedAt");

-- CreateIndex
CREATE INDEX "Session_userId_revokedAt_expiresAt_idx" ON "Session"("userId", "revokedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_status_type_deletedAt_idx" ON "Organization"("status", "type", "deletedAt");

-- CreateIndex
CREATE INDEX "Organization_name_idx" ON "Organization"("name");

-- CreateIndex
CREATE INDEX "OrganizationMembership_userId_status_idx" ON "OrganizationMembership"("userId", "status");

-- CreateIndex
CREATE INDEX "OrganizationMembership_organizationId_status_role_idx" ON "OrganizationMembership"("organizationId", "status", "role");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMembership_organizationId_userId_key" ON "OrganizationMembership"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "CollectionPoint_organizationId_status_deletedAt_idx" ON "CollectionPoint"("organizationId", "status", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionPoint_organizationId_code_key" ON "CollectionPoint"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Farmer_farmerNumber_key" ON "Farmer"("farmerNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Farmer_userId_key" ON "Farmer"("userId");

-- CreateIndex
CREATE INDEX "Farmer_status_deletedAt_idx" ON "Farmer"("status", "deletedAt");

-- CreateIndex
CREATE INDEX "Farmer_lastName_firstName_idx" ON "Farmer"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "Farmer_primaryPhone_idx" ON "Farmer"("primaryPhone");

-- CreateIndex
CREATE INDEX "FarmerOrganizationMembership_organizationId_status_createdA_idx" ON "FarmerOrganizationMembership"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "FarmerOrganizationMembership_farmerId_status_idx" ON "FarmerOrganizationMembership"("farmerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FarmerOrganizationMembership_farmerId_organizationId_key" ON "FarmerOrganizationMembership"("farmerId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "FarmerOrganizationMembership_organizationId_membershipNumbe_key" ON "FarmerOrganizationMembership"("organizationId", "membershipNumber");

-- CreateIndex
CREATE INDEX "Farm_farmerId_status_deletedAt_idx" ON "Farm"("farmerId", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "Farm_organizationId_status_deletedAt_idx" ON "Farm"("organizationId", "status", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FarmerQrIdentity_publicId_key" ON "FarmerQrIdentity"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "FarmerQrIdentity_replacedById_key" ON "FarmerQrIdentity"("replacedById");

-- CreateIndex
CREATE INDEX "FarmerQrIdentity_farmerId_organizationId_status_idx" ON "FarmerQrIdentity"("farmerId", "organizationId", "status");

-- CreateIndex
CREATE INDEX "FarmerQrIdentity_organizationId_publicId_status_idx" ON "FarmerQrIdentity"("organizationId", "publicId", "status");

-- CreateIndex
CREATE INDEX "FarmerQrIdentity_expiresAt_idx" ON "FarmerQrIdentity"("expiresAt");

-- Prisma cannot express partial indexes; this enforces the active-card invariant at the database boundary.
CREATE UNIQUE INDEX "FarmerQrIdentity_one_active_per_farmer_organization"
ON "FarmerQrIdentity"("farmerId", "organizationId")
WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE INDEX "FarmerConsent_farmerId_organizationId_consentType_capturedA_idx" ON "FarmerConsent"("farmerId", "organizationId", "consentType", "capturedAt");

-- CreateIndex
CREATE INDEX "FarmerConsent_organizationId_status_capturedAt_idx" ON "FarmerConsent"("organizationId", "status", "capturedAt");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_createdAt_idx" ON "AuditEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUserId_createdAt_idx" ON "AuditEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_createdAt_idx" ON "AuditEvent"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_requestId_idx" ON "AuditEvent"("requestId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPoint" ADD CONSTRAINT "CollectionPoint_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Farmer" ADD CONSTRAINT "Farmer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Farmer" ADD CONSTRAINT "Farmer_registeredByUserId_fkey" FOREIGN KEY ("registeredByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmerOrganizationMembership" ADD CONSTRAINT "FarmerOrganizationMembership_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmerOrganizationMembership" ADD CONSTRAINT "FarmerOrganizationMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmerOrganizationMembership" ADD CONSTRAINT "FarmerOrganizationMembership_registeredAtCollectionPointId_fkey" FOREIGN KEY ("registeredAtCollectionPointId") REFERENCES "CollectionPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Farm" ADD CONSTRAINT "Farm_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Farm" ADD CONSTRAINT "Farm_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmerQrIdentity" ADD CONSTRAINT "FarmerQrIdentity_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmerQrIdentity" ADD CONSTRAINT "FarmerQrIdentity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmerQrIdentity" ADD CONSTRAINT "FarmerQrIdentity_issuedByUserId_fkey" FOREIGN KEY ("issuedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmerQrIdentity" ADD CONSTRAINT "FarmerQrIdentity_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "FarmerQrIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmerConsent" ADD CONSTRAINT "FarmerConsent_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmerConsent" ADD CONSTRAINT "FarmerConsent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmerConsent" ADD CONSTRAINT "FarmerConsent_capturedByUserId_fkey" FOREIGN KEY ("capturedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
