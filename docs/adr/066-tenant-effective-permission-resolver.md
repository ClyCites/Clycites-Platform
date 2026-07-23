# ADR 066: Tenant-scoped effective-permission resolver

**Decision:** Dashboard authorization resolves a caller's effective permissions per tenant by unioning
the base organization role permissions with the permission codes of the caller's active custom roles.
Unknown codes are discarded so a stale or tampered custom role can never widen access beyond the known
permission catalog. Platform administrators bypass membership resolution and receive the full catalog.
