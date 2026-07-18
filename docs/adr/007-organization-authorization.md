# ADR 007: Organization-scoped authorization

## Status

Accepted

## Decision

Represent staff access as explicit organization memberships with one role and status. Resolve
permissions from a shared role map, require an active user and active membership, and scope every
domain query by organization. Platform-administrator bypass is explicit and limited to platform
administration permissions.

## Consequences

Users may work in multiple organizations without duplicating accounts. Controllers, services, tests,
and query caches must retain organization context. Removing the final active cooperative
administrator is rejected.
