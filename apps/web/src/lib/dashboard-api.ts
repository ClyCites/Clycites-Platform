import type {
  AnalyticsFilter,
  AssignCustomRoleInput,
  AuditEvent,
  AuditFilter,
  BrandingResponse,
  CreateCustomRoleInput,
  CreateReportDefinitionInput,
  CustomRole,
  DashboardOverview,
  EffectivePermissions,
  FeatureDefinition,
  FinanceAnalytics,
  OperationsSummary,
  OrganizationFeature,
  ReportDefinition,
  ReportExport,
  RequestReportExportInput,
  SetOrganizationFeatureInput,
  TenantContext,
  UpdateReportDefinitionInput,
  UpsertBrandingInput,
} from '@clycites/contracts';

import { apiRequest } from '@/lib/api-client';

export interface AuditPage {
  items: AuditEvent[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

const org = (organizationId: string, path: string): string =>
  `/organizations/${organizationId}${path}`;

export const dashboardApi = {
  context: () => apiRequest<TenantContext>('/me/context'),

  overview: (organizationId: string, filter: AnalyticsFilter) =>
    apiRequest<DashboardOverview>(org(organizationId, '/analytics/overview'), {
      method: 'POST',
      body: JSON.stringify(filter),
    }),

  finance: (organizationId: string, filter: AnalyticsFilter) =>
    apiRequest<FinanceAnalytics>(org(organizationId, '/analytics/finance'), {
      method: 'POST',
      body: JSON.stringify(filter),
    }),

  operationsSummary: (organizationId: string) =>
    apiRequest<OperationsSummary>(org(organizationId, '/operations/summary')),

  getBranding: (organizationId: string) =>
    apiRequest<BrandingResponse>(org(organizationId, '/branding')),

  upsertBranding: (organizationId: string, input: UpsertBrandingInput) =>
    apiRequest<BrandingResponse>(org(organizationId, '/branding'), {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  featureDefinitions: (organizationId: string) =>
    apiRequest<FeatureDefinition[]>(org(organizationId, '/feature-definitions')),

  features: (organizationId: string) =>
    apiRequest<OrganizationFeature[]>(org(organizationId, '/features')),

  setFeature: (organizationId: string, input: SetOrganizationFeatureInput) =>
    apiRequest<OrganizationFeature>(org(organizationId, '/features'), {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  roles: (organizationId: string) => apiRequest<CustomRole[]>(org(organizationId, '/roles')),

  createRole: (organizationId: string, input: CreateCustomRoleInput) =>
    apiRequest<CustomRole>(org(organizationId, '/roles'), {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  assignRole: (organizationId: string, input: AssignCustomRoleInput) =>
    apiRequest<EffectivePermissions>(org(organizationId, '/role-assignments'), {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  audit: (organizationId: string, filter: AuditFilter) =>
    apiRequest<AuditPage>(org(organizationId, '/audit/search'), {
      method: 'POST',
      body: JSON.stringify(filter),
    }),

  reportDefinitions: (organizationId: string) =>
    apiRequest<ReportDefinition[]>(org(organizationId, '/reports/definitions')),

  createReportDefinition: (organizationId: string, input: CreateReportDefinitionInput) =>
    apiRequest<ReportDefinition>(org(organizationId, '/reports/definitions'), {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateReportDefinition: (
    organizationId: string,
    definitionId: string,
    input: UpdateReportDefinitionInput,
  ) =>
    apiRequest<ReportDefinition>(org(organizationId, `/reports/definitions/${definitionId}`), {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  reportExports: (organizationId: string) =>
    apiRequest<ReportExport[]>(org(organizationId, '/reports/exports')),

  requestReportExport: (organizationId: string, input: RequestReportExportInput) =>
    apiRequest<ReportExport>(org(organizationId, '/reports/exports'), {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  getReportExport: (organizationId: string, exportId: string) =>
    apiRequest<ReportExport>(org(organizationId, `/reports/exports/${exportId}`)),
};

export const dashboardKeys = {
  context: ['dashboard', 'context'] as const,
  overview: (organizationId: string, filter: AnalyticsFilter) =>
    ['dashboard', 'overview', organizationId, filter] as const,
  finance: (organizationId: string, filter: AnalyticsFilter) =>
    ['dashboard', 'finance', organizationId, filter] as const,
  operations: (organizationId: string) => ['dashboard', 'operations', organizationId] as const,
  branding: (organizationId: string) => ['dashboard', 'branding', organizationId] as const,
  featureDefinitions: (organizationId: string) =>
    ['dashboard', 'feature-definitions', organizationId] as const,
  features: (organizationId: string) => ['dashboard', 'features', organizationId] as const,
  roles: (organizationId: string) => ['dashboard', 'roles', organizationId] as const,
  audit: (organizationId: string, filter: AuditFilter) =>
    ['dashboard', 'audit', organizationId, filter] as const,
  reportDefinitions: (organizationId: string) =>
    ['dashboard', 'report-definitions', organizationId] as const,
  reportExports: (organizationId: string) =>
    ['dashboard', 'report-exports', organizationId] as const,
};
