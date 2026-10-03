# Identity operations and coverage

Reviewed and hardened on 2026-10-03. This document describes the current implementation; earlier authentication briefs retain their historical planning context. The architecture is described in [authentication-backbone.md](../architecture/authentication-backbone.md).

## Ownership and organization

| Concern                         | Implementation                                                                    | Responsibility                                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Authentication and sessions     | `apps/api/src/auth/auth.service.ts`                                               | Login, browser/device refresh, JWT validation, session revocation                                 |
| Credential lifecycle            | `apps/api/src/auth/credential-lifecycle.service.ts`                               | Invitations, activation, password change/reset, verified recovery, farmer-assisted reset          |
| MFA                             | `apps/api/src/auth/mfa.service.ts`                                                | Encrypted TOTP enrollment, bounded challenges, single-use recovery codes, audit events            |
| Identifier policy and limiting  | `identifier.service.ts`, `login-limiter.service.ts`, `password-policy.service.ts` | Canonical identifiers, password policy, Redis-backed account limiting                             |
| Authorization                   | `apps/api/src/identity`                                                           | Authentication, explicit scopes, browser account administration, effective membership permissions |
| Membership administration       | `apps/api/src/memberships`                                                        | Membership states, base roles, last usable organization-admin protection                          |
| Platform account administration | `apps/api/src/users`                                                              | User creation/status, session invalidation, last usable administrator protection                  |
| Custom roles                    | `apps/api/src/dashboard/administration.service.ts`                                | Tenant role definitions, assignments, versioned updates, effective-permission inspection          |
| Farmer subject access           | `apps/api/src/farmer-self-service`                                                | Subject-bound records and permitted consent/privacy actions                                       |

`membershipPermissions()` is the shared base-role/custom-role resolver for login responses, ordinary API principals, dashboard tenant guards, and effective-permission inspection. Only recognized grants from active roles belonging to the membership organization count. Inactive users, memberships, and organizations receive no effective access. Scope remains independent of permissions: organization grants never authorize farmer-self routes or platform-only routes.

## Authentication route coverage

All paths below are relative to `/api/v1`. Public credential endpoints have HTTP throttling. Browser and device credentials use separate refresh channels.

| Routes                                                              | Access                          | Operational behavior                                                                                  |
| ------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `POST /auth/login`, `/auth/refresh`                                 | Public credential exchange      | Generic invalid credentials, account lockout, session-bound tokens, cookie-based browser refresh      |
| `POST /auth/device/token`                                           | Device credential exchange      | Device-bound session and organization cap; no browser cookie or platform identity                     |
| `POST /auth/mfa/enroll`                                             | Authenticated browser           | Eligible administrator begins enrollment; bounded challenge and setup secret                          |
| `POST /auth/mfa/enroll/confirm`, `/auth/mfa/verify`                 | Public challenge exchange       | Challenge/code required; atomic single-use confirmation, encrypted secret, bounded failed attempts    |
| `POST /auth/invitations/accept`                                     | Public token exchange           | Expiring single-use invitation, account-class password validation, activation                         |
| `POST /auth/password-reset/request`, `/auth/password-reset/confirm` | Public recovery exchange        | Non-enumerating request response, verified recovery channel, token expiry and session invalidation    |
| `POST /auth/farmer-account-reset/redeem`                            | Public reset exchange           | Staff-issued one-time farmer reset; staff cannot choose the farmer's new password                     |
| `POST /auth/password`                                               | Authenticated browser           | Current password required, atomic credential update, other sessions revoked                           |
| `POST /auth/email-verification/request`                             | Authenticated browser           | Verification delivery through the configured notification provider                                    |
| `POST /auth/email-verification/confirm`                             | Public token exchange           | Expiring single-use verification token                                                                |
| `POST /auth/logout`                                                 | Authenticated browser or device | Revokes the bearer-authenticated session, even without a cookie; cookie cannot choose another session |
| `POST /auth/logout-all`                                             | Authenticated browser           | Revokes every session and clears the browser cookie                                                   |
| `GET /auth/me`                                                      | Authenticated session           | Current identity, active organization permissions and `mfaEnabled`; device identity remains capped    |
| `GET /auth/sessions`, `DELETE /auth/sessions/:sessionId`            | Authenticated browser           | Owned-session inventory/revocation; UUID validation and cross-user isolation                          |

Account administration is intentionally denied to device sessions. A device can still end its own session. Every authenticated request rechecks current session, user and membership state rather than relying on stale JWT role claims.

## Administration and recovery procedures

- **Onboard staff:** issue an organization member invitation; the recipient accepts and sets their own password. Reinvite using the organization-scoped invitation route when an invitation expires.
- **Onboard a farmer:** provision through the farmer account route and redeem the activation invitation. Staff-assisted reset issues a one-time reset credential; it does not disclose or select a password.
- **Change access:** update the base membership role or assign/unassign a tenant custom role. Grant changes affect the next API request. Custom-role updates require the current version and concurrent stale updates return a conflict.
- **Remove an administrator:** appoint another active administrator with an active account first. Membership changes serialize on the organization row. Account status changes also check affected organizations and the remaining platform administrators. A suspended account is not a usable replacement.
- **Lost device:** revoke the registered device through its organization route. Device sessions are invalidated together; browser sessions remain separate.
- **Compromised browser:** revoke the owned session or use logout-all. Password recovery invalidates sessions; changing a password preserves the calling session and revokes the others.
- **MFA setup:** confirm the authenticator before treating setup as complete; save the ten recovery codes when shown. Expired/revoked enrollment sessions cannot activate MFA. Recovery-code use, enrollment and failed submitted codes are audited without recording secrets.

The account screen reflects enrollment state and refreshes the session list after enrollment. Password fields distinguish current-password and new-password autofill.

## Verification

Run against an isolated database and Redis instance configured with the ordinary server environment. The database must be built from this branch's migration history; `SHADOW_DATABASE_URL` is required for the migration-history guard. Never use a shared development or production database: the integration suites deliberately create, change and revoke records.

```sh
pnpm --filter @clycites/database exec prisma migrate deploy
pnpm --filter @clycites/database db:seed
pnpm --filter @clycites/api test:identity
pnpm --filter @clycites/auth test
pnpm --filter @clycites/api lint
pnpm --filter @clycites/api typecheck
pnpm --filter @clycites/api build
```

Use a freshly migrated and seeded database for the complete `test:e2e` suite: marketplace tests intentionally terminate seeded commercial commitments. Files must run sequentially. Throttling has a dedicated real-HTTP test in addition to guard coverage checks; other mutation regressions bypass HTTP throttling to isolate their business assertions.

The identity suite covers identifier/password rules, credential lifecycle, login timing and lockout, session ownership/revocation/replay, MFA enrollment/login/recovery, device caps, tenant and farmer isolation, explicit route scopes, custom-role consistency, and concurrent administrator/role updates. The standard integration command now includes the previously omitted tenancy and route-scope tests.

## Deployment-dependent checks and deliberate limits

Integration verification uses real local PostgreSQL and Redis with mock Hedera and local notification settings. Deployed SMTP delivery, HTTPS cookie behavior across the actual frontend/API domains, secret rotation procedures and backup recovery still require deployment-specific checks. `AUTH_MFA_DEV_BYPASS` must be false for these identity checks; environment validation forbids it in production.

There is no self-service MFA disable/reset or recovery-code regeneration API. Recovery uses existing one-time codes; an administrative MFA recovery policy and audited endpoint would need a separately specified implementation. SSO/OAuth, external identity providers, SMS and biometrics remain outside this identity implementation. Authentication event retention policy remains an operational decision.

## Verification results (2026-10-03)

| Check                          | Result                                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| Dedicated identity suite       | 131 passing checks                                                                             |
| Complete API integration suite | 153 passing tests on a freshly migrated/seeded database                                        |
| API unit suite                 | 130 passing tests                                                                              |
| Shared auth package            | 27 passing tests                                                                               |
| Shared contracts               | 3 passing tests                                                                                |
| Web unit suite                 | 29 passing tests, including MFA enrollment state, recovery-code dismissal and restarting setup |
| Lint and TypeScript            | API, auth, contracts and web pass                                                              |
| Builds                         | API, auth, contracts and production web pass                                                   |

These suites overlap; their counts should not be added as unique coverage. API verification used dedicated disposable PostgreSQL databases and a separate Redis container. Existing developer databases and servers were left untouched. A pre-existing commerce privacy assertion was corrected to match numeric response values rather than coordinate fragments inside timestamps or random identifiers.
