# Agent Brief — ClyCites API Authentication & Authorization Remediation

**Paste this whole document as the opening message to a coding agent working in the
`ClyCites/Clycites-Platform` repository, branch `staging`.** Read it in full before writing
any code.

**Version:** 1.0
**Scope:** `apps/api/src/auth`, `apps/api/src/identity`, `packages/auth`, plus the call sites
they break.
**Out of scope:** the web app's auth UI, the worker, anything in `packages/hedera`.

---

## 0. What you are working on

ClyCites is a verifiable agriculture platform for Uganda and East Africa. The API is a
NestJS modular monolith in a pnpm/Turborepo workspace. It is **multi-tenant**: every
cooperative, exporter, and buyer is an `Organization`, and a `User` may hold a different
role in each of several organizations simultaneously.

That last sentence is the whole reason this brief exists. The current authorization model
does not respect it.

### Ground truth about the current code

Verified by reading the repository at commit `635adc7`. Do not assume anything beyond this
without checking.

| Location | Contents |
|---|---|
| `packages/auth/src/index.ts` | `ROLES` (8), `PERMISSIONS` (~170), `ROLE_PERMISSIONS`, `permissionsForRoles`, `hasPermission`, `AuthenticatedPrincipal`, `OrganizationContext` |
| `apps/api/src/auth/auth.service.ts` | login, refresh, logout, logoutAll, revokeSession, listSessions, `authenticateAccessToken`, `currentUser`, `principalForUser` |
| `apps/api/src/auth/auth.controller.ts` | `POST /auth/login`, `/refresh`, `/logout`, `/logout-all`, `GET /auth/me`, `GET /auth/sessions`, `DELETE /auth/sessions/:sessionId` |
| `apps/api/src/identity/auth.guard.ts` | Bearer extraction → `authenticateAccessToken` → sets `request.principal` |
| `apps/api/src/identity/permissions.guard.ts` | Reads `REQUIRED_PERMISSIONS` metadata, checks flat permission list, then optionally checks `request.params.organizationId` |
| `apps/api/src/identity/identity.decorators.ts` | `RequirePermissions`, `CurrentPrincipal`, `REQUIRED_PERMISSIONS` |
| `packages/database/prisma/schema.prisma` | `User`, `Session`, `Organization`, `OrganizationMembership` |

Relevant scale, measured:

- **229** `@RequirePermissions(...)` usages across controllers.
- **34** reads of `principal.organizations`, concentrated in **11 files** (all of
  `apps/api/src/pilots/*`, plus `operations.service.ts`, `organizations.service.ts`,
  `permissions.guard.ts`).
- **16** reads of `principal.roles`.
- **2** reads of `principal.permissions` / `hasPermission`.

The blast radius of reshaping the principal is therefore small and known. Do not let it
grow.

Environment variables already defined in `apps/api/src/config/environment.ts`:
`AUTH_ACCESS_TOKEN_SECRET` (min 32, rejected in production if left at the local default),
`AUTH_ACCESS_TOKEN_TTL_MINUTES` (5–60, default 15), `AUTH_SESSION_TTL_DAYS` (1–90,
default 30), `AUTH_REFRESH_COOKIE_NAME`, `AUTH_REFRESH_COOKIE_SECURE`,
`AUTH_REFRESH_COOKIE_SAME_SITE` (`lax | strict`).

Redis and BullMQ are already running and wired (`apps/api/src/queue`). Postgres is
authoritative. Argon2 (`argon2`) and `jose` are already dependencies.

---

## 1. Non-negotiable constraints

These hold for every work package. Violating one is a failed task, not a tradeoff.

1. **Fail closed.** If the authorization layer cannot determine the organization scope of a
   request, it denies the request. It never falls through to "allow."
2. **No new runtime dependencies** unless a work package below names one. If you believe one
   is required, stop and say so rather than adding it.
3. **Audit events are append-only.** Never update or delete an `AuditEvent`. Never remove an
   existing audit call. You may add new ones.
4. **Do not log secrets.** No passwords, no refresh tokens, no access tokens, no reset
   tokens, and no raw email addresses in security-event metadata — hash identifiers instead.
5. **Strict TypeScript stays strict.** No `any`, no `as unknown as`, no
   `@ts-expect-error` to get past the new types. If the types fight you, the model is wrong;
   fix the model.
6. **One work package per pull request**, in the order given. Each PR must leave
   `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` green before you start the
   next.
7. **Write the failing test first** for every defect in WP1–WP4. The test must fail against
   current `staging` for the stated reason, then pass after your change. Include the failing
   output in the PR description.
8. **No behaviour changes outside auth.** If a service is doing its own tenant filtering
   today, preserve that behaviour exactly; you are adding a second gate, not replacing one.

---

## 2. Baseline (do this first, before any change)

```bash
pnpm install --frozen-lockfile
pnpm infra:up
pnpm db:generate && pnpm db:migrate && pnpm db:seed
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm test:security
pnpm openapi:check
```

Record which of these pass and which already fail on `staging`. You are not responsible for
pre-existing failures, but you must not add any. Report the baseline before proceeding.

---

## WP1 — Tenant-scoped authorization

**This is the security defect. Do it first and do it properly.**

### The bug

`AuthService.principalForUser` collects roles from every active membership and flattens them
into one permission array:

```ts
const roles: Role[] = [
  ...(user.platformRole === 'PLATFORM_ADMIN' ? [ROLES.PLATFORM_ADMIN] : []),
  ...user.organizations.map((organization) => organization.role),
];
return { subjectId, roles, permissions: permissionsForRoles(roles), organizations };
```

A user who is `COOPERATIVE_ADMIN` at co-op A and `BUYER` at exporter B carries
cooperative-admin permissions everywhere. `PermissionsGuard` partially compensates by
checking `request.params.organizationId` — but only when that param exists in the route.

Controllers with `@RequirePermissions` and **no** `organizationId` path param:

```
apps/api/src/pilots/pilots.controller.ts              @Controller('pilots')
apps/api/src/pilots/pilot-evaluation.controller.ts    @Controller('pilots/:pilotId')
apps/api/src/pilots/pilot-import.controller.ts        @Controller()
apps/api/src/pilots/pilot-evidence.controller.ts      @Controller()
apps/api/src/pilots/pilot-participants.controller.ts  @Controller()
apps/api/src/coffee-configuration/coffee-configuration.controller.ts
apps/api/src/operations/operations.controller.ts      @Controller('operations')
apps/api/src/organizations/organizations.controller.ts
apps/api/src/users/users.controller.ts                @Controller('admin/users')
apps/api/src/anchoring/hedera-admin.controller.ts     @Controller('admin/hedera')
```

`PILOT_PARTICIPANT_ENROLL`, `OPERATIONS_READ`, `FEATURE_FLAG_MANAGE`, and
`QUALITY_CONFIGURATION_MANAGE` are all held by `COOPERATIVE_ADMIN`. So a cooperative admin
at any organization can reach another organization's pilots, feature flags, and quality
configuration. `admin/users` and `admin/hedera` are currently safe only because the
permissions they require happen to be `PLATFORM_ADMIN`-exclusive — that is an accident, not
a control.

### Required change — `packages/auth`

Replace the flat principal with a scoped one:

```ts
export interface AuthenticatedPrincipal {
  readonly subjectId: string;
  readonly sessionId: string;
  readonly platformRole?: typeof ROLES.PLATFORM_ADMIN;
  /** organizationId -> role held in that organization. */
  readonly memberships: ReadonlyMap<string, Role>;
}
```

Delete `permissionsForRoles` and the old `hasPermission` from the public surface. Replace
with a single scoped predicate:

```ts
export const can = (
  principal: AuthenticatedPrincipal,
  permission: Permission,
  organizationId: string,
): boolean => { /* ... */ };

export const canPlatform = (
  principal: AuthenticatedPrincipal,
  permission: Permission,
): boolean => { /* ... */ };
```

Rules:

- `canPlatform` returns true only if `platformRole === PLATFORM_ADMIN` **and** the permission
  is in the platform-admin set.
- `can` returns true if `canPlatform(...)` is true, **or** the principal holds a role in that
  specific `organizationId` whose role permissions include the permission.
- Platform admin's permission set stays exactly as `ROLE_PERMISSIONS[PLATFORM_ADMIN]` is
  today. Do not expand it.

Add a unit test in `packages/auth/src/index.test.ts` asserting the exact scenario above:
a principal with `COOPERATIVE_ADMIN` at org A and `BUYER` at org B must be denied
`PILOT_PARTICIPANT_ENROLL` for org B and allowed it for org A.

### Required change — scope resolution

Introduce an explicit, declarative way for every permissioned route to state where its
organization scope comes from. Add to `identity.decorators.ts`:

```ts
/** Scope resolved from a path parameter that is itself an organization id. */
export const OrgScopeFromParam = (param = 'organizationId') => /* SetMetadata */;

/** Scope resolved by looking the entity up and reading its organizationId. */
export const OrgScopeFromEntity = (entity: ScopedEntity, param: string) => /* SetMetadata */;

/** Route is genuinely platform-level and has no organization scope. */
export const PlatformScope = () => /* SetMetadata */;
```

`ScopedEntity` is a closed union (`'pilot' | 'lot' | 'batch' | 'delivery' | ...`) mapped to a
resolver in a new `apps/api/src/identity/scope-resolver.service.ts`. Each resolver does one
indexed query returning `{ organizationId }` or `null`. Cache resolutions per-request only —
no cross-request cache in this work package.

### Required change — `PermissionsGuard`

Rewrite so that:

1. If no `@RequirePermissions` metadata is present, deny. (Every route behind
   `PermissionsGuard` must declare what it needs.)
2. Read the scope metadata. If **none is present**, deny with a 403 and log an error naming
   the handler. This is deliberate: it converts the ten controllers above from silently open
   into loudly broken, and you will fix them in this same PR.
3. `PlatformScope` routes are checked with `canPlatform`.
4. All other routes resolve an `organizationId`, then check every required permission with
   `can(principal, permission, organizationId)`. If the entity does not resolve, return 404,
   not 403 — do not leak the existence of other tenants' records.
5. Attach the resolved `organizationId` to the request as `request.organizationScope` so
   services can use it instead of re-deriving it.

### Required change — call sites

Annotate all 229 permissioned routes. Most already have `:organizationId` and just need
`@OrgScopeFromParam()` — consider applying it at the controller level where the whole
controller is organization-scoped. The ten controllers listed above need real decisions:

- `admin/users`, `admin/hedera` → `@PlatformScope()`.
- `pilots/:pilotId`, `pilot-evaluation`, `pilot-participants`, `pilot-evidence`,
  `pilot-import` → `@OrgScopeFromEntity('pilot', 'pilotId')`. `GET /pilots` (list) has no
  single scope: it must filter to the principal's memberships in the service, and should be
  marked with a new `@SelfScopedList()` marker that the guard permits only for read
  permissions.
- `operations`, `coffee-configuration`, `organizations` → inspect each handler. Some are
  per-organization and need a param added to the route; some are platform-level. Decide per
  handler, do not blanket-apply.

Update the 11 files that read `principal.organizations` to use the new shape. Where a service
already filters by organization, keep that filtering — the guard is defence in depth, not a
replacement.

### Tests required

- Unit: `packages/auth` scoped predicate, including the cross-org denial case.
- Guard unit tests: missing metadata denies; unresolvable entity 404s; platform scope path.
- Integration: for **each** of the ten controllers, one test proving a user privileged in
  org A is denied against org B's resource. Put these in a new
  `apps/api/test/authorization-tenancy.spec.ts`.
- A meta-test that reflects over every registered route and fails if any route guarded by
  `PermissionsGuard` lacks scope metadata. This is the test that keeps the hole closed after
  you leave.

---

## WP2 — Bind access tokens to sessions

### The bug

The access token payload is `{ sub, type: 'access' }`. `authenticateAccessToken` verifies the
JWT and calls `principalForUser(sub)` without ever consulting the `Session` table. After
`POST /auth/logout`, `POST /auth/logout-all`, or `DELETE /auth/sessions/:id`, the bearer
token remains valid for up to `AUTH_ACCESS_TOKEN_TTL_MINUTES`. Revocation does not revoke.

### Required change

- Set `jti` on the access token to the `sessionId` when issuing in `issueLoginResponse`.
  `issueLoginResponse` currently takes only `userId`; it must take the session id too. Both
  `login` and `refresh` must pass the real session id.
- In `authenticateAccessToken`, after JWT verification, load the session and reject unless
  it exists, `revokedAt` is null, `expiresAt` is in the future, and `session.userId` equals
  the token subject. Use a narrow `select` — do not load the whole user graph twice.
- Populate `principal.sessionId` from the verified `jti`.
- Keep the existing user-status check (`ACTIVE`, not soft-deleted).

### Tests required

Login → logout → the previously-issued access token must return 401. Same for `logout-all`
and for revoking a specific session. Also: a valid token whose `jti` names another user's
session must be rejected.

---

## WP3 — Login hardening

### 3a. Close the user-enumeration timing oracle

`if (!user || !(await verify(user.passwordHash, input.password)))` short-circuits. A missing
account returns in single-digit milliseconds; a real account with a wrong password returns
after a full argon2id verify. This enumerates your staff and farmer roster.

Fix: when no user is found, verify the supplied password against a fixed, module-level dummy
argon2id hash generated at startup, discard the result, and return the identical
`UnauthorizedException('Invalid email or password')`. Add a test asserting both branches
perform a verify.

### 3b. Per-account rate limiting

`@Throttle({ default: { limit: 10, ttl: 60_000 } })` on `ThrottlerGuard` keys on IP. In
Uganda a cooperative office is typically one NAT'd connection: ten collection agents signing
in at shift start will lock each other out, while distributed credential stuffing is
unaffected.

Add a Redis-backed per-identifier limiter **in addition to** the existing IP limiter:

- Key on a keyed hash (HMAC-SHA256 with a server secret) of the normalised identifier, never
  the raw email.
- Progressive backoff: allow 5 failures, then delay windows of 1 m, 5 m, 15 m, 60 m.
- Reset the counter on successful authentication.
- Return `429` with a `Retry-After` header. Do **not** vary the message depending on whether
  the account exists.
- Add `AUTH_LOGIN_MAX_FAILURES` and `AUTH_LOGIN_LOCKOUT_BASE_SECONDS` to
  `environment.ts` with the same Zod validation style as the existing `AUTH_*` variables, and
  document them in `.env.example`.

### 3c. Make failed logins investigable

The current failed-login audit event records `reason: 'invalid_credentials'` and nothing
else — no actor, no identifier. You cannot detect a targeted attack or build lockout from it.

Add the keyed identifier hash (same hash as 3b), the IP, and the user agent to the metadata.
Emit a distinct `AUTH_LOGIN_LOCKED_OUT` event when the limiter trips. Never store the raw
identifier or the attempted password.

---

## WP4 — Correctness and hygiene

Each of these is small. Each needs a test.

1. **`revokeSession` returns the wrong status.** It throws `UnauthorizedException` when the
   session is not found, which tells clients to re-authenticate. Use `NotFoundException`.
2. **Argon2id is the wrong primitive for refresh tokens.** The refresh token is
   `${sessionId}.${randomBytes(32).toString('base64url')}` — 256 bits of CSPRNG output. It
   does not need a memory-hard KDF. Every refresh currently runs a 64 MiB argon2 hash plus a
   verify, four times an hour per active user. Replace `Session.refreshTokenHash` with an
   HMAC-SHA256 over the token using a new `AUTH_REFRESH_TOKEN_PEPPER` secret, compared with
   `timingSafeEqual`. Keep the column; write a migration that revokes all existing sessions
   rather than attempting to convert them, and say so in the PR. **Do not** change the
   password hashing — argon2id stays for passwords.
3. **Refresh cookie path is version-coupled.** `path: '/api/v1/auth'` breaks every live
   session the day `v2` ships. Move to an unversioned `/api/auth` prefix, or mount the auth
   controller outside the version prefix. Whichever you choose, note it in an ADR.
4. **`sameSite` cannot express the cross-origin deployment.** The enum allows only
   `lax | strict`, but web (`:3000`) and API (`:4000`) are different origins in development.
   Either document that production must proxy both under one origin (add it to
   `docs/architecture/`), or add `'none'` to the enum with a Zod refinement forcing
   `AUTH_REFRESH_COOKIE_SECURE` true whenever it is used. Do not silently allow insecure
   `none`.
5. **`logout` reports success when it did nothing.** It returns `{ loggedOut: true }` even
   when no cookie was present and no session was revoked. Keep the 200 (do not leak session
   state) but stop emitting a misleading audit trail — only write `SESSION_REVOKED` when a
   session was actually revoked.

---

## WP5 — Missing credential lifecycle

None of this exists today. Build it only after WP1–WP4 are merged.

### 5a. Invitation acceptance

`UserStatus` defaults to `INVITED`; login requires `ACTIVE`. There is no path from one to the
other. Build it: a single-use, expiring invitation token, delivered out of band, that lets
the invitee set their initial password and transitions them to `ACTIVE`.

### 5b. Password reset

`POST /auth/password-reset/request` and `POST /auth/password-reset/confirm`.

- Store only a hash of the reset token. Single use. 30-minute expiry. New `PasswordReset`
  model with an index on the token hash and on `userId`.
- The request endpoint returns `202` unconditionally — it must not reveal whether the
  account exists. Rate limit it with the WP3b limiter.
- On successful reset, revoke **all** the user's sessions and emit
  `AUTH_PASSWORD_RESET_COMPLETED`.
- Delivery is out of scope for this package: enqueue a BullMQ job and log that it would send.
  Do not integrate an SMS or email provider without asking.

### 5c. Password change

`POST /auth/password` for an authenticated user. Requires the current password. Revokes all
sessions except the calling one. Emits an audit event.

### 5d. Verification enforcement

`User.emailVerifiedAt` and `User.phoneVerifiedAt` exist and are never read. Decide, with the
repository owner, whether login requires a verified channel. Implement behind a config flag
defaulting to **off** so it can be turned on for the pilot without a code change. Do not turn
it on yourself.

### Password policy

Applies to 5a, 5b, and 5c. Minimum 12 characters, no composition rules, screened against a
breached-password list if one is already vendored — otherwise screen against a small local
list of the most common passwords and note the gap. Do not add a new dependency for this
without asking.

---

## WP6 — BLOCKED: farmer authentication

**Do not start this package. Stop and ask.**

`ROLE_PERMISSIONS[ROLES.FARMER]` is an empty array. A farmer who logs in can do nothing — not
read their own deliveries, not read their own receipts, not view their own settlement
statements. Meanwhile `FarmerQrIdentity` exists and farmers are identified by QR at
collection points.

Two possible worlds, and they produce very different systems:

- **Farmers do not authenticate.** The QR identity is their only handle, staff act on their
  behalf, and `ROLES.FARMER` should be deleted rather than left as an empty stub that reads
  like an unfinished feature. Auth stays a staff-and-buyer system.
- **Farmers authenticate.** Then you need SMS/OTP rather than email and password, a
  self-scoped permission class that is *not* organization-scoped (a farmer's rights follow
  the farmer, not a co-op membership), a reset flow that works on a feature phone, and a
  reconsideration of WP1's model — because `can(principal, permission, organizationId)` does
  not express "read your own delivery."

Report the question. Do not guess.

---

## 3. Definition of done

- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm test:security` green,
  with no new failures against the recorded baseline.
- `pnpm openapi:check` passes and the OpenAPI document reflects every new endpoint.
- The route-reflection meta-test from WP1 exists and passes.
- `apps/api/test/authorization-tenancy.spec.ts` covers all ten previously-unscoped
  controllers.
- New migrations are additive and reversible, and any session-invalidating migration says so
  explicitly in its name and in the PR description.
- `.env.example` documents every new variable.
- An ADR in `docs/architecture/` records: the scoped-principal model, the cookie path change,
  the cross-origin cookie decision, and the refresh-token hashing change.
- `README.md` security section updated if any operator-visible behaviour changed.

## 4. What not to do

- Do not add a permissions cache, a JWT allowlist/denylist service, or asymmetric signing
  in this pass. They are reasonable later; they are scope creep now.
- Do not switch to Passport, NestJS `@nestjs/jwt`, or an external identity provider.
- Do not "simplify" by giving `PLATFORM_ADMIN` a wildcard permission. The explicit list is a
  feature.
- Do not weaken any existing check to make a test pass.
- Do not touch settlement, payment, or anchoring logic. If a tenancy fix appears to require
  it, stop and report.

## 5. Report back

After the baseline, and again after each work package, report:

1. What you changed, by file.
2. The failing test output from before the fix, and the passing output after.
3. Anything you found that this brief did not anticipate — especially any *additional*
   place where authorization is decided outside `PermissionsGuard`.
4. Any point at which you were tempted to weaken a constraint, and what you did instead.
