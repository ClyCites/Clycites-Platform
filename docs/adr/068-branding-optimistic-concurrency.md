# ADR 068: Optimistic concurrency for organization branding

**Decision:** Organization branding is a single per-tenant record edited under optimistic concurrency.
Clients submit the `version` they last read and a mismatch is rejected rather than silently
overwritten, preventing lost updates when multiple administrators edit branding concurrently. Public
branding is served unauthenticated by slug so unauthenticated surfaces can render tenant identity.
