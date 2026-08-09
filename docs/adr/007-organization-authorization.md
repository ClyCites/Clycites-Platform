# ADR 007: Organization-scoped authorization

## Status

Accepted

> **Verification status (2026-08-09):** The authorization work merged at `958859e` has
> unaccepted verification. The route meta-test and HTTP tenancy suite are being rebuilt. No work
> package after WP1 may branch from `staging` until the WP1 Hardening Definition of Done is met.

## Decision

Represent staff access as explicit organization memberships with one role and status. An
authenticated principal carries a map from organization ID to the role held in that organization;
roles and permissions are never flattened across memberships. Permission checks resolve against
the requested organization. Platform-administrator bypass is explicit and limited to the existing
platform-administrator permission set.

Every route guarded by `PermissionsGuard` declares one scope source: an organization path
parameter, an indexed entity lookup, a platform-only operation, or a read-only list filtered to the
principal's memberships. Missing permission or scope metadata fails closed. Entity lookups are
cached only on the request, and the resolved organization ID is attached to that request for
downstream use. Existing service-level organization filters remain as defense in depth.

## Consequences

Users may work in multiple organizations without duplicating accounts. Controllers, services, tests,
and query caches must retain organization context. New permissioned routes cannot become reachable
until they declare a scope. Entity-scoped routes add one indexed lookup before the domain service
runs. Removing the final active cooperative administrator is rejected.
