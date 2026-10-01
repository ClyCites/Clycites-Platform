import { z } from 'zod';

// ---------------------------------------------------------------------------
// Phase 2 (schema phase 9): Enterprise Multi-Tenant Administration Dashboard
// ---------------------------------------------------------------------------

const uuid = z.uuid();
const timestamp = z.iso.datetime();
const dateOnly = z.iso.date();
const shortText = z.string().trim().min(1).max(200);
const mediumText = z.string().trim().min(1).max(500);
const longText = z.string().trim().min(1).max(1000);

const hexColor = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Must be a hex color, e.g. #0f766e');

const permissionCode = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/, 'Must be a dotted permission code');

const objectKey = z.string().trim().min(1).max(512);

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const organizationDomainStatusSchema = z.enum([
  'PENDING',
  'VERIFYING',
  'VERIFIED',
  'FAILED',
  'DISABLED',
]);
export const domainTlsStatusSchema = z.enum(['NONE', 'PENDING', 'ACTIVE', 'FAILED']);
export const featureRiskLevelSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export const featureDefinitionStatusSchema = z.enum(['ACTIVE', 'DEPRECATED', 'DISABLED']);
export const customRoleStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']);
export const savedDashboardViewScopeSchema = z.enum(['PRIVATE', 'ORGANIZATION']);
export const reportTypeSchema = z.enum([
  'FARMER_REGISTRY',
  'DELIVERY_SUMMARY',
  'QUALITY_SUMMARY',
  'TRACEABILITY',
  'MARKETPLACE_SUMMARY',
  'SETTLEMENT_SUMMARY',
  'PAYMENT_RECONCILIATION',
  'AUDIT_ACTIVITY',
  'OPERATIONAL_HEALTH',
]);
export const reportFormatSchema = z.enum(['CSV', 'JSON', 'PDF']);
export const reportDefinitionStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);
export const reportExportStatusSchema = z.enum([
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'EXPIRED',
  'CANCELLED',
]);

// ---------------------------------------------------------------------------
// Tenant context (/me/context)
// ---------------------------------------------------------------------------

export const tenantSummarySchema = z.object({
  organizationId: uuid,
  slug: z.string().trim().min(1).max(120),
  displayName: shortText,
  role: z.string().trim().min(1).max(80),
  status: z.enum(['INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED']),
});

export const tenantContextSchema = z.object({
  user: z.object({
    id: uuid,
    email: z.email(),
    displayName: shortText,
    platformRole: z.string().trim().min(1).max(80).nullable(),
  }),
  activeOrganizationId: uuid.nullable(),
  memberships: z.array(tenantSummarySchema).max(200),
  effectivePermissions: z.array(permissionCode).max(1000),
});

export const switchTenantSchema = z
  .object({
    organizationId: uuid,
  })
  .strict();

// ---------------------------------------------------------------------------
// Branding (admin) + public branding
// ---------------------------------------------------------------------------

const brandingBaseSchema = z
  .object({
    displayName: shortText,
    shortName: z.string().trim().min(1).max(80).optional(),
    logoObjectKey: objectKey.optional(),
    iconObjectKey: objectKey.optional(),
    primaryColor: hexColor.optional(),
    secondaryColor: hexColor.optional(),
    accentColor: hexColor.optional(),
    supportEmail: z.email().max(320).optional(),
    supportPhone: z.string().trim().min(3).max(32).optional(),
    locale: z.string().trim().min(2).max(20).optional(),
    timezone: z.string().trim().min(1).max(80).optional(),
    currency: z.string().trim().length(3).optional(),
  })
  .strict();

export const upsertBrandingSchema = brandingBaseSchema.extend({
  version: z.number().int().positive().optional(),
});

export const brandingResponseSchema = z.object({
  organizationId: uuid,
  displayName: shortText,
  shortName: z.string().nullable(),
  logoObjectKey: z.string().nullable(),
  iconObjectKey: z.string().nullable(),
  primaryColor: z.string().nullable(),
  secondaryColor: z.string().nullable(),
  accentColor: z.string().nullable(),
  supportEmail: z.string().nullable(),
  supportPhone: z.string().nullable(),
  locale: z.string(),
  timezone: z.string(),
  currency: z.string(),
  version: z.number().int().positive(),
  updatedAt: timestamp,
});

// Public branding is a deliberately narrow projection (no contact/audit data).
export const publicBrandingSchema = z.object({
  displayName: shortText,
  shortName: z.string().nullable(),
  logoUrl: z.string().nullable(),
  iconUrl: z.string().nullable(),
  primaryColor: z.string().nullable(),
  secondaryColor: z.string().nullable(),
  accentColor: z.string().nullable(),
  locale: z.string(),
});

// ---------------------------------------------------------------------------
// Feature definitions + organization feature values
// ---------------------------------------------------------------------------

export const featureDefinitionSchema = z.object({
  id: uuid,
  code: z.string().trim().min(1).max(120),
  name: shortText,
  description: longText,
  riskLevel: featureRiskLevelSchema,
  defaultEnabled: z.boolean(),
  status: featureDefinitionStatusSchema,
});

export const setOrganizationFeatureSchema = z
  .object({
    featureDefinitionId: uuid,
    enabled: z.boolean(),
    configuration: z.record(z.string().min(1).max(100), z.unknown()).nullable().optional(),
    version: z.number().int().positive().optional(),
    reason: mediumText.optional(),
  })
  .strict();

export const organizationFeatureSchema = z.object({
  featureDefinitionId: uuid,
  code: z.string(),
  name: shortText,
  riskLevel: featureRiskLevelSchema,
  enabled: z.boolean(),
  configuration: z.record(z.string(), z.unknown()).nullable(),
  version: z.number().int().positive(),
  updatedAt: timestamp,
});

// ---------------------------------------------------------------------------
// Custom roles, permissions, effective permissions
// ---------------------------------------------------------------------------

const roleNameSchema = z.string().trim().min(2).max(120);

export const createCustomRoleSchema = z
  .object({
    name: roleNameSchema,
    description: mediumText.optional(),
    permissions: z.array(permissionCode).min(1).max(500),
  })
  .strict();

export const updateCustomRoleSchema = z
  .object({
    name: roleNameSchema.optional(),
    description: mediumText.nullable().optional(),
    status: customRoleStatusSchema.optional(),
    permissions: z.array(permissionCode).min(1).max(500).optional(),
    version: z.number().int().positive(),
  })
  .strict();

export const customRoleSchema = z.object({
  id: uuid,
  organizationId: uuid,
  name: roleNameSchema,
  description: z.string().nullable(),
  status: customRoleStatusSchema,
  permissions: z.array(permissionCode).max(500),
  version: z.number().int().positive(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const assignCustomRoleSchema = z
  .object({
    membershipId: uuid,
    customRoleId: uuid,
  })
  .strict();

export const effectivePermissionsSchema = z.object({
  membershipId: uuid,
  userId: uuid,
  organizationId: uuid,
  baseRole: z.string().trim().min(1).max(80),
  customRoleIds: z.array(uuid).max(100),
  permissions: z.array(permissionCode).max(1000),
});

// ---------------------------------------------------------------------------
// Analytics: date-range, filters, KPI, time-series, categorical
// ---------------------------------------------------------------------------

export const analyticsGranularitySchema = z.enum(['DAY', 'WEEK', 'MONTH']);

export const analyticsDateRangeSchema = z
  .object({
    from: dateOnly,
    to: dateOnly,
  })
  .strict()
  .refine((v) => v.to >= v.from, {
    path: ['to'],
    message: 'End date must be on or after the start date',
  })
  .refine(
    (v) => {
      const days = (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000;
      return days <= 366;
    },
    { path: ['to'], message: 'Date range may not exceed 366 days' },
  );

export const analyticsFilterSchema = z
  .object({
    dateRange: analyticsDateRangeSchema,
    granularity: analyticsGranularitySchema.default('DAY'),
    region: z.string().trim().min(1).max(120).optional(),
    district: z.string().trim().min(1).max(120).optional(),
    collectionPointId: uuid.optional(),
  })
  .strict();

export const kpiCardSchema = z.object({
  key: z.string().trim().min(1).max(80),
  label: shortText,
  value: z.number(),
  unit: z.string().trim().max(20).nullable(),
  deltaPercent: z.number().nullable(),
  trend: z.enum(['UP', 'DOWN', 'FLAT']).nullable(),
});

export const timeSeriesPointSchema = z.object({
  bucket: dateOnly,
  value: z.number(),
});

export const timeSeriesSchema = z.object({
  key: z.string().trim().min(1).max(80),
  label: shortText,
  granularity: analyticsGranularitySchema,
  points: z.array(timeSeriesPointSchema).max(400),
});

export const categoricalDatumSchema = z.object({
  label: shortText,
  value: z.number(),
});

export const categoricalSeriesSchema = z.object({
  key: z.string().trim().min(1).max(80),
  label: shortText,
  data: z.array(categoricalDatumSchema).max(100),
});

export const dashboardOverviewSchema = z.object({
  organizationId: uuid,
  generatedAt: timestamp,
  kpis: z.array(kpiCardSchema).max(24),
  timeSeries: z.array(timeSeriesSchema).max(12),
  breakdowns: z.array(categoricalSeriesSchema).max(12),
});

// Finance analytics kept as a separate, permission-gated surface.
export const financeAnalyticsSchema = z.object({
  organizationId: uuid,
  generatedAt: timestamp,
  currency: z.string().length(3),
  kpis: z.array(kpiCardSchema).max(24),
  settlementTimeSeries: z.array(timeSeriesSchema).max(6),
});

// ---------------------------------------------------------------------------
// Server-driven data tables: pagination, sorting, filtering
// ---------------------------------------------------------------------------

export const sortDirectionSchema = z.enum(['asc', 'desc']);

export const dataTableSortSchema = z
  .object({
    field: z.string().trim().min(1).max(80),
    direction: sortDirectionSchema,
  })
  .strict();

export const dataTableFilterOperatorSchema = z.enum([
  'eq',
  'ne',
  'contains',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
]);

export const dataTableFilterSchema = z
  .object({
    field: z.string().trim().min(1).max(80),
    operator: dataTableFilterOperatorSchema,
    value: z.union([
      z.string().max(200),
      z.number(),
      z.boolean(),
      z.array(z.union([z.string().max(200), z.number()])).max(50),
    ]),
  })
  .strict();

export const dataTableQuerySchema = z
  .object({
    page: z.number().int().positive().max(10_000).default(1),
    pageSize: z.number().int().positive().max(200).default(25),
    search: z.string().trim().max(200).optional(),
    sort: z.array(dataTableSortSchema).max(3).optional(),
    filters: z.array(dataTableFilterSchema).max(20).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Saved dashboard views
// ---------------------------------------------------------------------------

export const upsertSavedViewSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    scope: savedDashboardViewScopeSchema.default('PRIVATE'),
    configuration: z.record(z.string().min(1).max(100), z.unknown()),
    isDefault: z.boolean().default(false),
  })
  .strict();

export const savedViewSchema = z.object({
  id: uuid,
  organizationId: uuid,
  userId: uuid,
  name: z.string(),
  scope: savedDashboardViewScopeSchema,
  configuration: z.record(z.string(), z.unknown()),
  isDefault: z.boolean(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

// ---------------------------------------------------------------------------
// Report definitions + exports
// ---------------------------------------------------------------------------

export const createReportDefinitionSchema = z
  .object({
    name: shortText,
    reportType: reportTypeSchema,
    filters: z.record(z.string().min(1).max(100), z.unknown()),
    columns: z.array(z.string().trim().min(1).max(80)).min(1).max(100),
    format: reportFormatSchema.default('CSV'),
  })
  .strict();

export const updateReportDefinitionSchema = z
  .object({
    name: shortText.optional(),
    filters: z.record(z.string().min(1).max(100), z.unknown()).optional(),
    columns: z.array(z.string().trim().min(1).max(80)).min(1).max(100).optional(),
    format: reportFormatSchema.optional(),
    status: reportDefinitionStatusSchema.optional(),
  })
  .strict();

export const reportDefinitionSchema = z.object({
  id: uuid,
  organizationId: uuid,
  name: shortText,
  reportType: reportTypeSchema,
  filters: z.record(z.string(), z.unknown()),
  columns: z.array(z.string()).max(100),
  format: reportFormatSchema,
  status: reportDefinitionStatusSchema,
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const requestReportExportSchema = z
  .object({
    reportDefinitionId: uuid.optional(),
    reportType: reportTypeSchema.optional(),
    format: reportFormatSchema.optional(),
    filters: z.record(z.string().min(1).max(100), z.unknown()).optional(),
  })
  .strict()
  .refine((v) => Boolean(v.reportDefinitionId) || Boolean(v.reportType), {
    message: 'Either reportDefinitionId or reportType is required',
    path: ['reportDefinitionId'],
  });

export const reportExportSchema = z.object({
  id: uuid,
  organizationId: uuid,
  reportDefinitionId: uuid.nullable(),
  format: reportFormatSchema,
  status: reportExportStatusSchema,
  rowCount: z.number().int().nonnegative().nullable(),
  checksum: z.string().nullable(),
  downloadUrl: z.string().nullable(),
  expiresAt: timestamp.nullable(),
  failureCode: z.string().nullable(),
  createdAt: timestamp,
  completedAt: timestamp.nullable(),
});

// ---------------------------------------------------------------------------
// Audit + operations
// ---------------------------------------------------------------------------

export const auditFilterSchema = z
  .object({
    dateRange: analyticsDateRangeSchema.optional(),
    actorUserId: uuid.optional(),
    action: z.string().trim().min(1).max(120).optional(),
    entityType: z.string().trim().min(1).max(120).optional(),
    entityId: z.string().trim().min(1).max(200).optional(),
    page: z.number().int().positive().max(10_000).default(1),
    pageSize: z.number().int().positive().max(200).default(25),
  })
  .strict();

export const auditEventSchema = z.object({
  id: uuid,
  organizationId: uuid.nullable(),
  actorUserId: uuid.nullable(),
  actorType: z.string(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  requestId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: timestamp,
});

export const operationsSummarySchema = z.object({
  organizationId: uuid,
  generatedAt: timestamp,
  activeUsers24h: z.number().int().nonnegative(),
  pendingReportExports: z.number().int().nonnegative(),
  failedReportExports24h: z.number().int().nonnegative(),
  auditEvents24h: z.number().int().nonnegative(),
  featureFlagChanges7d: z.number().int().nonnegative(),
});

// ---------------------------------------------------------------------------
// Stable error codes
// ---------------------------------------------------------------------------

export const PHASE_NINE_ERROR_CODES = {
  TENANT_NOT_FOUND: 'TENANT_NOT_FOUND',
  TENANT_ACCESS_DENIED: 'TENANT_ACCESS_DENIED',
  TENANT_CONTEXT_REQUIRED: 'TENANT_CONTEXT_REQUIRED',
  TENANT_MEMBERSHIP_INACTIVE: 'TENANT_MEMBERSHIP_INACTIVE',
  ROLE_NOT_FOUND: 'ROLE_NOT_FOUND',
  ROLE_NAME_CONFLICT: 'ROLE_NAME_CONFLICT',
  ROLE_VERSION_CONFLICT: 'ROLE_VERSION_CONFLICT',
  ROLE_PERMISSION_INVALID: 'ROLE_PERMISSION_INVALID',
  ROLE_ASSIGNMENT_CONFLICT: 'ROLE_ASSIGNMENT_CONFLICT',
  ROLE_IN_USE: 'ROLE_IN_USE',
  FEATURE_DEFINITION_NOT_FOUND: 'FEATURE_DEFINITION_NOT_FOUND',
  FEATURE_VERSION_CONFLICT: 'FEATURE_VERSION_CONFLICT',
  FEATURE_HIGH_RISK_APPROVAL_REQUIRED: 'FEATURE_HIGH_RISK_APPROVAL_REQUIRED',
  BRANDING_NOT_FOUND: 'BRANDING_NOT_FOUND',
  BRANDING_VERSION_CONFLICT: 'BRANDING_VERSION_CONFLICT',
  BRANDING_ASSET_INVALID: 'BRANDING_ASSET_INVALID',
  DOMAIN_NOT_FOUND: 'DOMAIN_NOT_FOUND',
  DOMAIN_CONFLICT: 'DOMAIN_CONFLICT',
  DOMAIN_VERIFICATION_FAILED: 'DOMAIN_VERIFICATION_FAILED',
  ANALYTICS_RANGE_INVALID: 'ANALYTICS_RANGE_INVALID',
  ANALYTICS_QUERY_INVALID: 'ANALYTICS_QUERY_INVALID',
  REPORT_DEFINITION_NOT_FOUND: 'REPORT_DEFINITION_NOT_FOUND',
  REPORT_EXPORT_NOT_FOUND: 'REPORT_EXPORT_NOT_FOUND',
  REPORT_EXPORT_NOT_READY: 'REPORT_EXPORT_NOT_READY',
  REPORT_EXPORT_EXPIRED: 'REPORT_EXPORT_EXPIRED',
  REPORT_EXPORT_FAILED: 'REPORT_EXPORT_FAILED',
  SAVED_VIEW_NOT_FOUND: 'SAVED_VIEW_NOT_FOUND',
  SAVED_VIEW_NAME_CONFLICT: 'SAVED_VIEW_NAME_CONFLICT',
} as const;

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type TenantSummary = z.infer<typeof tenantSummarySchema>;
export type TenantContext = z.infer<typeof tenantContextSchema>;
export type SwitchTenantInput = z.infer<typeof switchTenantSchema>;
export type UpsertBrandingInput = z.infer<typeof upsertBrandingSchema>;
export type BrandingResponse = z.infer<typeof brandingResponseSchema>;
export type PublicBranding = z.infer<typeof publicBrandingSchema>;
export type FeatureDefinition = z.infer<typeof featureDefinitionSchema>;
export type SetOrganizationFeatureInput = z.infer<typeof setOrganizationFeatureSchema>;
export type OrganizationFeature = z.infer<typeof organizationFeatureSchema>;
export type CreateCustomRoleInput = z.infer<typeof createCustomRoleSchema>;
export type UpdateCustomRoleInput = z.infer<typeof updateCustomRoleSchema>;
export type CustomRole = z.infer<typeof customRoleSchema>;
export type AssignCustomRoleInput = z.infer<typeof assignCustomRoleSchema>;
export type EffectivePermissions = z.infer<typeof effectivePermissionsSchema>;
export type AnalyticsDateRange = z.infer<typeof analyticsDateRangeSchema>;
export type AnalyticsFilter = z.infer<typeof analyticsFilterSchema>;
export type KpiCard = z.infer<typeof kpiCardSchema>;
export type TimeSeries = z.infer<typeof timeSeriesSchema>;
export type CategoricalSeries = z.infer<typeof categoricalSeriesSchema>;
export type DashboardOverview = z.infer<typeof dashboardOverviewSchema>;
export type FinanceAnalytics = z.infer<typeof financeAnalyticsSchema>;
export type DataTableSort = z.infer<typeof dataTableSortSchema>;
export type DataTableFilter = z.infer<typeof dataTableFilterSchema>;
export type DataTableQuery = z.infer<typeof dataTableQuerySchema>;
export type UpsertSavedViewInput = z.infer<typeof upsertSavedViewSchema>;
export type SavedView = z.infer<typeof savedViewSchema>;
export type CreateReportDefinitionInput = z.infer<typeof createReportDefinitionSchema>;
export type UpdateReportDefinitionInput = z.infer<typeof updateReportDefinitionSchema>;
export type ReportDefinition = z.infer<typeof reportDefinitionSchema>;
export type RequestReportExportInput = z.infer<typeof requestReportExportSchema>;
export type ReportExport = z.infer<typeof reportExportSchema>;
export type AuditFilter = z.infer<typeof auditFilterSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type OperationsSummary = z.infer<typeof operationsSummarySchema>;
