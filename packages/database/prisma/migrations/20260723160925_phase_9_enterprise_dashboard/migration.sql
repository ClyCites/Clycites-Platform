-- CreateEnum
CREATE TYPE "OrganizationDomainStatus" AS ENUM ('PENDING', 'VERIFYING', 'VERIFIED', 'FAILED', 'DISABLED');

-- CreateEnum
CREATE TYPE "DomainTlsStatus" AS ENUM ('NONE', 'PENDING', 'ACTIVE', 'FAILED');

-- CreateEnum
CREATE TYPE "FeatureRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "FeatureDefinitionStatus" AS ENUM ('ACTIVE', 'DEPRECATED', 'DISABLED');

-- CreateEnum
CREATE TYPE "CustomRoleStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SavedDashboardViewScope" AS ENUM ('PRIVATE', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('FARMER_REGISTRY', 'DELIVERY_SUMMARY', 'QUALITY_SUMMARY', 'TRACEABILITY', 'MARKETPLACE_SUMMARY', 'SETTLEMENT_SUMMARY', 'PAYMENT_RECONCILIATION', 'AUDIT_ACTIVITY', 'OPERATIONAL_HEALTH');

-- CreateEnum
CREATE TYPE "ReportFormat" AS ENUM ('CSV', 'JSON', 'PDF');

-- CreateEnum
CREATE TYPE "ReportDefinitionStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ReportExportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "Pilot" DROP CONSTRAINT "Pilot_approvedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "Pilot" DROP CONSTRAINT "Pilot_createdByUserId_fkey";

-- DropForeignKey
ALTER TABLE "PilotBaselineMetric" DROP CONSTRAINT "PilotBaselineMetric_collectedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "PilotBaselineMetric" DROP CONSTRAINT "PilotBaselineMetric_verifiedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "PilotCollectionPoint" DROP CONSTRAINT "PilotCollectionPoint_collectionPointId_fkey";

-- DropForeignKey
ALTER TABLE "PilotConfiguration" DROP CONSTRAINT "PilotConfiguration_changedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "PilotConfiguration" DROP CONSTRAINT "PilotConfiguration_retentionPolicy_fkey";

-- DropForeignKey
ALTER TABLE "PilotDecision" DROP CONSTRAINT "PilotDecision_approvedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "PilotDecision" DROP CONSTRAINT "PilotDecision_decidedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "PilotDeviceAssignment" DROP CONSTRAINT "PilotDeviceAssignment_assignedUserId_fkey";

-- DropForeignKey
ALTER TABLE "PilotDeviceAssignment" DROP CONSTRAINT "PilotDeviceAssignment_collectionPointId_fkey";

-- DropForeignKey
ALTER TABLE "PilotDeviceAssignment" DROP CONSTRAINT "PilotDeviceAssignment_deviceId_fkey";

-- DropForeignKey
ALTER TABLE "PilotFarmerImport" DROP CONSTRAINT "PilotFarmerImport_confirmedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "PilotFarmerImport" DROP CONSTRAINT "PilotFarmerImport_createdByUserId_fkey";

-- DropForeignKey
ALTER TABLE "PilotFarmerImportRow" DROP CONSTRAINT "PilotFarmerImportRow_existingFarmerId_fkey";

-- DropForeignKey
ALTER TABLE "PilotFarmerImportRow" DROP CONSTRAINT "PilotFarmerImportRow_importedFarmerId_fkey";

-- DropForeignKey
ALTER TABLE "PilotFeedback" DROP CONSTRAINT "PilotFeedback_assignedToUserId_fkey";

-- DropForeignKey
ALTER TABLE "PilotFieldObservation" DROP CONSTRAINT "PilotFieldObservation_observedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "PilotMetricObservation" DROP CONSTRAINT "PilotMetricObservation_reviewedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "PilotParticipant" DROP CONSTRAINT "PilotParticipant_collectionPointId_fkey";

-- DropForeignKey
ALTER TABLE "PilotParticipant" DROP CONSTRAINT "PilotParticipant_farmerId_fkey";

-- DropForeignKey
ALTER TABLE "PilotParticipant" DROP CONSTRAINT "PilotParticipant_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "PilotParticipant" DROP CONSTRAINT "PilotParticipant_userId_fkey";

-- DropForeignKey
ALTER TABLE "PilotStatusEvent" DROP CONSTRAINT "PilotStatusEvent_actorUserId_fkey";

-- DropForeignKey
ALTER TABLE "PilotSupportCase" DROP CONSTRAINT "PilotSupportCase_assignedToUserId_fkey";

-- DropForeignKey
ALTER TABLE "PilotSupportCase" DROP CONSTRAINT "PilotSupportCase_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "PilotSupportCase" DROP CONSTRAINT "PilotSupportCase_participantId_fkey";

-- DropForeignKey
ALTER TABLE "TrainingAssignment" DROP CONSTRAINT "TrainingAssignment_verifiedByUserId_fkey";

-- DropIndex
DROP INDEX "PilotSupportCase_escalatedIncidentId_idx";

-- CreateTable
CREATE TABLE "OrganizationBranding" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "displayName" VARCHAR(200) NOT NULL,
    "shortName" VARCHAR(80),
    "logoObjectKey" VARCHAR(512),
    "iconObjectKey" VARCHAR(512),
    "primaryColor" VARCHAR(32),
    "secondaryColor" VARCHAR(32),
    "accentColor" VARCHAR(32),
    "supportEmail" VARCHAR(320),
    "supportPhone" VARCHAR(32),
    "locale" VARCHAR(20) NOT NULL DEFAULT 'en-UG',
    "timezone" VARCHAR(80) NOT NULL DEFAULT 'Africa/Kampala',
    "currency" VARCHAR(8) NOT NULL DEFAULT 'UGX',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" UUID NOT NULL,
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrganizationBranding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationDomain" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "hostname" VARCHAR(253) NOT NULL,
    "status" "OrganizationDomainStatus" NOT NULL DEFAULT 'PENDING',
    "verificationTokenHash" VARCHAR(128),
    "verifiedAt" TIMESTAMPTZ(3),
    "tlsStatus" "DomainTlsStatus" DEFAULT 'NONE',
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrganizationDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureDefinition" (
    "id" UUID NOT NULL,
    "code" VARCHAR(120) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "riskLevel" "FeatureRiskLevel" NOT NULL DEFAULT 'LOW',
    "defaultEnabled" BOOLEAN NOT NULL DEFAULT false,
    "status" "FeatureDefinitionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FeatureDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationFeature" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "featureDefinitionId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "configuration" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrganizationFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomRole" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "status" "CustomRoleStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" UUID NOT NULL,
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CustomRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomRolePermission" (
    "id" UUID NOT NULL,
    "customRoleId" UUID NOT NULL,
    "permissionCode" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomRolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipCustomRole" (
    "id" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "customRoleId" UUID NOT NULL,
    "assignedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipCustomRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedDashboardView" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "scope" "SavedDashboardViewScope" NOT NULL DEFAULT 'PRIVATE',
    "configuration" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SavedDashboardView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportDefinition" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "reportType" "ReportType" NOT NULL,
    "filters" JSONB NOT NULL,
    "columns" JSONB NOT NULL,
    "format" "ReportFormat" NOT NULL DEFAULT 'CSV',
    "status" "ReportDefinitionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ReportDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportExport" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "reportDefinitionId" UUID,
    "requestedByUserId" UUID NOT NULL,
    "format" "ReportFormat" NOT NULL,
    "status" "ReportExportStatus" NOT NULL DEFAULT 'PENDING',
    "objectKey" VARCHAR(512),
    "checksum" VARCHAR(128),
    "rowCount" INTEGER,
    "expiresAt" TIMESTAMPTZ(3),
    "failureCode" VARCHAR(120),
    "requestId" VARCHAR(128),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ReportExport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationBranding_organizationId_key" ON "OrganizationBranding"("organizationId");

-- CreateIndex
CREATE INDEX "OrganizationBranding_organizationId_idx" ON "OrganizationBranding"("organizationId");

-- CreateIndex
CREATE INDEX "OrganizationDomain_organizationId_status_idx" ON "OrganizationDomain"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationDomain_hostname_key" ON "OrganizationDomain"("hostname");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureDefinition_code_key" ON "FeatureDefinition"("code");

-- CreateIndex
CREATE INDEX "FeatureDefinition_status_code_idx" ON "FeatureDefinition"("status", "code");

-- CreateIndex
CREATE INDEX "OrganizationFeature_organizationId_enabled_idx" ON "OrganizationFeature"("organizationId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationFeature_organizationId_featureDefinitionId_key" ON "OrganizationFeature"("organizationId", "featureDefinitionId");

-- CreateIndex
CREATE INDEX "CustomRole_organizationId_status_idx" ON "CustomRole"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CustomRole_organizationId_name_key" ON "CustomRole"("organizationId", "name");

-- CreateIndex
CREATE INDEX "CustomRolePermission_customRoleId_idx" ON "CustomRolePermission"("customRoleId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomRolePermission_customRoleId_permissionCode_key" ON "CustomRolePermission"("customRoleId", "permissionCode");

-- CreateIndex
CREATE INDEX "MembershipCustomRole_customRoleId_idx" ON "MembershipCustomRole"("customRoleId");

-- CreateIndex
CREATE INDEX "MembershipCustomRole_membershipId_idx" ON "MembershipCustomRole"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipCustomRole_membershipId_customRoleId_key" ON "MembershipCustomRole"("membershipId", "customRoleId");

-- CreateIndex
CREATE INDEX "SavedDashboardView_organizationId_scope_idx" ON "SavedDashboardView"("organizationId", "scope");

-- CreateIndex
CREATE INDEX "SavedDashboardView_userId_idx" ON "SavedDashboardView"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedDashboardView_organizationId_userId_name_key" ON "SavedDashboardView"("organizationId", "userId", "name");

-- CreateIndex
CREATE INDEX "ReportDefinition_organizationId_status_idx" ON "ReportDefinition"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ReportDefinition_organizationId_reportType_idx" ON "ReportDefinition"("organizationId", "reportType");

-- CreateIndex
CREATE INDEX "ReportExport_organizationId_status_createdAt_idx" ON "ReportExport"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ReportExport_reportDefinitionId_idx" ON "ReportExport"("reportDefinitionId");

-- CreateIndex
CREATE INDEX "ReportExport_expiresAt_idx" ON "ReportExport"("expiresAt");

-- AddForeignKey
ALTER TABLE "OrganizationBranding" ADD CONSTRAINT "OrganizationBranding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationDomain" ADD CONSTRAINT "OrganizationDomain_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationFeature" ADD CONSTRAINT "OrganizationFeature_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationFeature" ADD CONSTRAINT "OrganizationFeature_featureDefinitionId_fkey" FOREIGN KEY ("featureDefinitionId") REFERENCES "FeatureDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomRole" ADD CONSTRAINT "CustomRole_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomRolePermission" ADD CONSTRAINT "CustomRolePermission_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "CustomRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipCustomRole" ADD CONSTRAINT "MembershipCustomRole_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "OrganizationMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipCustomRole" ADD CONSTRAINT "MembershipCustomRole_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "CustomRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedDashboardView" ADD CONSTRAINT "SavedDashboardView_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportDefinition" ADD CONSTRAINT "ReportDefinition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportExport" ADD CONSTRAINT "ReportExport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportExport" ADD CONSTRAINT "ReportExport_reportDefinitionId_fkey" FOREIGN KEY ("reportDefinitionId") REFERENCES "ReportDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
