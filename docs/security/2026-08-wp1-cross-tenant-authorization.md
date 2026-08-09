# WP1 Cross-Tenant Authorization Vulnerability

## Identification

- Pre-fix commit: `635adc7ce715ce2d9d8d25cea4f6adc5480a291a`
- Fix merge: `958859e6f2c010a41ddab6fd11b82d85eaa72ce8`
- Pre-fix commit date: 2026-08-01 22:06:53 +0300
- Evidence capture started: 2026-08-09
- Hardening verification date: 2026-08-09

The database schema and migration directories have no diff between the pre-fix commit and the fix
merge. The same database can therefore be used for both verification runs.

## Defect

The pre-fix principal flattened permissions from every organization membership. A permission gained
as a cooperative administrator in organization A therefore authorized requests scoped to
organization B, even when the same user held only the `BUYER` role there. Platform-only routes also
accepted permissions inherited from organization memberships. Read-only list services filtered by
membership ID without checking whether the role in each organization granted the route permission.

## Reachability

The defect was reachable through authenticated HTTP routes. A seeded cooperative administrator
could log in normally, then use the resulting bearer token against parameter-scoped,
entity-resolved, platform-only, and self-scoped-list routes. No guard or service boundary prevented
the cross-organization request before the fix.

## Demonstration

The unchanged `authorization-tenancy.spec.ts` suite was run against the pre-fix commit in an
isolated worktree using the disposable `clycites_wp1_history` database. The pre-fix lockfile was
not installable because it contained a duplicate `tailwindcss@4.3.3` key, so workspace packages
were built with the current frozen dependency installation; application source and test source
remained at the recorded pre-fix commit.

All five tests failed on the pre-fix application:

- `GET /api/v1/organizations/:organizationId` returned `200`, expected `403`.
- `GET /api/v1/pilots/:pilotId` returned `200`, expected `403`.
- `PATCH /api/v1/operations/incidents/:incidentId` returned `200`, expected `403`.
- `GET /api/v1/operations/overview` returned `200`, expected `403`.
- `GET /api/v1/organizations` disclosed organization B in the response.

The same suite passes all five tests on the fixed branch.

## Fix

Authenticated principals retain a map from organization ID to role. `can()` resolves permissions
against the requested organization, while `canPlatform()` is the only platform authorization path.
Every permissioned route declares exactly one parameter, entity, platform, or self-list scope, and
missing metadata fails closed. Entity scopes resolve their organization through registered database
resolvers. Tenant-bearing list services filter organization IDs by the permission required by that
specific route.

## Regression Barrier

The route meta-test compiles and initializes the real Nest application, enumerates discovered
controllers, and verifies at least 100 permissioned routes. It requires exactly one scope per route,
valid path parameters, and a registered resolver for every entity scope.

The HTTP tenancy suite performs a real login and uses real database fixtures. It covers parameter
scope, entity scope, mutation denial, platform isolation, and permission-filtered lists. The
operations overview remains available to platform administrators in `phase-seven.spec.ts` and is
denied to organization administrators in the tenancy suite.

All seven `SelfScopedList` routes were audited. Commodity and training-module lists return global
reference catalogs without tenant rows. Organization and pilot lists now filter each membership by
their route permission. Incident, privacy-request, retention-policy, and feature-flag lists apply
the corresponding route permission to their organization filters.

## Exposure

The vulnerability was demonstrably exploitable in the seeded application. This repository contains
no production deployment inventory or historical access logs that can establish whether a
vulnerable revision was deployed or abused. Production exposure is therefore unconfirmed, not
ruled out. Any environment that deployed a pre-fix revision requires independent deployment and
access-log review under the incident-response process.
