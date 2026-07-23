# ADR 067: Route-scoped tenant permissions guard

**Decision:** Tenant authorization is enforced by a dedicated `TenantPermissionsGuard` that runs after
`AuthGuard`, reads the `:organizationId` route parameter, resolves the caller's standing within that
organization, and rejects missing memberships, inactive memberships, and missing permissions. This
keeps tenant isolation a server-side property of the request rather than an inference from UI state.
