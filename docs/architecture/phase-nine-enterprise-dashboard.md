# Phase 2 enterprise multi-tenant administration dashboard

This capability layers tenant-scoped administration, analytics, and reporting onto the existing
platform without altering the Phase 1 identity model. It is implemented as schema phase 9 (see
`packages/contracts/src/phase-nine.ts` and the `phase_9_enterprise_dashboard` migration) and exposed
under `apps/api/src/dashboard`, the `apps/worker` report-export worker, and the
`apps/web/src/app/dashboard/[organizationId]` surface.

## Tenant context and attribute-based access control

Every dashboard request is authorized twice. `AuthGuard` establishes the authenticated principal, and
`TenantPermissionsGuard` then resolves the caller's standing inside the `:organizationId` named on the
route. `TenantContextService.resolve` loads the caller's active `OrganizationMembership`, unions the
base organization role permissions with the permission codes granted by any active custom roles, and
rejects the request when the membership is missing, inactive, or lacks a required permission. Platform
administrators bypass membership resolution and receive the full permission catalog. Unknown custom
permission codes are discarded during resolution, so a stale custom role can never widen access beyond
the known catalog. Tenant isolation is therefore a property of the resolver: a caller who administers
one organization has no standing in another and receives `TENANT_ACCESS_DENIED`.

## Branding, features, and custom roles

Organization branding is a single per-tenant record edited under optimistic concurrency. Clients send
the `version` they last read; a mismatch is rejected rather than silently overwritten. Public branding
is served without authentication by slug so unauthenticated surfaces can render tenant identity.
Feature enablement is evaluated against platform-defined feature definitions; enabling a feature marked
`HIGH` or `CRITICAL` risk requires an explicit justification which is recorded on the audit trail.
Custom roles are tenant-scoped bundles of permission codes assigned to memberships and folded into the
effective-permission resolver described above.

## Analytics and reporting

Analytics endpoints accept a validated date range (bounded to 366 days) and granularity and return
KPI cards, time series, and categorical series. Finance analytics are gated behind a distinct
permission so operational analysts cannot read settlement figures. Report generation is asynchronous:
requesting an export creates a `PENDING` `ReportExport`, enqueues a BullMQ job keyed by the export id,
and returns immediately. The `apps/worker` report-export worker claims the row, builds rows for the
requested report type, writes CSV or JSON to object storage, records a checksum and a seven-day
expiry, and marks the export `COMPLETED`. PDF is not yet supported and fails deterministically with
`FORMAT_NOT_SUPPORTED`. Downloads are issued as short-lived presigned URLs and expired exports return
`REPORT_EXPORT_EXPIRED`.

## Audit trail

Administrative mutations — branding changes, feature toggles, role assignments, and export requests —
append to the immutable audit trail through `AuditService`. The audit search endpoint is paginated and
gated behind `audit.read`, making the trail the tenant-scoped system of record for who changed what and
when. PostgreSQL remains authoritative for all dashboard state.

## Web surface

The dashboard shell renders a tenant switcher, permission-aware navigation, breadcrumbs, and a theme
toggle backed by the `.dark` class and `localStorage`. Charts are drawn with dependency-light SVG and
Tailwind primitives rather than a charting library to keep the client bundle small and the visuals
aligned with the design tokens. Server state is managed with TanStack Query, and access errors are
surfaced distinctly from unexpected failures so a `403` reads as "access denied" rather than an outage.
