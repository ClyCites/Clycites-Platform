# API And Authorization Audit

## Surface

OpenAPI generation succeeded with **204 paths**. Modules cover health/version, auth, users, organizations, memberships, collection points, farmers/farms/consents/QR, coffee configuration, devices/sessions/deliveries/offline sync, batches/transformations/lots, anchoring/verification, marketplace/commerce, settlements, operations and pilots.

Authentication is enforced by [auth.guard.ts](../../apps/api/src/identity/auth.guard.ts); permission and route-organization checks are enforced by [permissions.guard.ts](../../apps/api/src/identity/permissions.guard.ts). Platform administrators have an intentional global bypass. Nested ownership remains service-owned and must be tested per resource.

Public endpoints include health/readiness/version, login/refresh, public lot traceability/verification, and Swagger in non-production. Login/refresh and public traceability have targeted throttling. There is no demonstrated global throttle for high-cost authenticated batch operations.

Zod contracts and `parseWithSchema` provide request validation. Responses use a standard data/meta envelope, request IDs, pagination on major lists, and Nest error handling. Runtime checks confirmed security headers, CORS restricted to the configured web origin, credentials enabled, and request-ID echo.

## Required Isolation Scenarios

The executed 37-test API suite passed. Results below distinguish direct tests from guard inference.

| Scenario                           | Actual result                     | Evidence                                                                                                                   |
| ---------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| A user reads B farmer              | **403, tested**                   | [phase-one.spec.ts](../../apps/api/test/phase-one.spec.ts) cross-organization farmer list                                  |
| A user reads B delivery            | **Not directly tested**           | Shared route guard exists; nested delivery ownership was not independently exercised                                       |
| A user reads B batch               | **403, tested**                   | [phase-three.spec.ts](../../apps/api/test/phase-three.spec.ts)                                                             |
| A user reads B lot                 | **Not directly tested**           | Lot routes use shared guards; no explicit wrong-organization lot ID assertion found                                        |
| A user reads B offer               | **Partially tested**              | Buyer/seller offer termination and listing visibility tests pass; arbitrary third-organization offer read not tested       |
| A user reads B contract            | **Partially tested**              | Party-scoped cancellation/share access passes; unrelated organization read not tested                                      |
| A user reads B settlement          | **Not directly tested**           | Finance permission denial is tested, but wrong-organization settlement ID with an otherwise authorized finance role is not |
| A user reads B payment instruction | **403 by role, tested partially** | [phase-six.spec.ts](../../apps/api/test/phase-six.spec.ts); not a same-role cross-tenant test                              |
| A user reads B pilot               | **403 for outside support scope** | [phase-eight.spec.ts](../../apps/api/test/phase-eight.spec.ts); direct pilot-read wrong-org case not isolated              |
| Buyer reads farmer-private data    | **403/field exclusion, tested**   | Phase 1 buyer farmer denial and Phase 5 private serializer allowlist                                                       |

## Findings

1. **HIGH: refresh rotation race.** [auth.service.ts](../../apps/api/src/auth/auth.service.ts) reads and verifies a session, then updates its hash without a compare-and-swap predicate or transaction lock. Two concurrent refreshes can validate the same token and both receive valid successors. Pilot and production blocker.
2. **MEDIUM: isolation suite is incomplete.** Five requested nested-ID scenarios are indirect or role-only tests. Shared guards lower risk but do not prove service queries validate nested ownership. Pilot blocker until direct synthetic tests pass.
3. **MEDIUM: high-cost authenticated endpoints lack demonstrated throttling.** Offline sync and import workflows can amplify database/object-storage work. Production blocker; pilot monitoring and small enrollment can mitigate.
4. **LOW: platform-admin global tenant access is intentional but broad.** Every access should be auditable and operational review must be explicit.
5. **INFORMATIONAL: production environment validation is strong.** HTTPS origins/storage, secure cookies, non-default secrets, docs disabling, and Hedera mainnet acknowledgement are validated at startup.

No SQL injection issue was identified in inspected Prisma paths. OpenAPI presence does not prove every error/status variant is documented.
