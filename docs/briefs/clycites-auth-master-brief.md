# Master Brief — ClyCites Authentication: Path to Complete

**This is the controlling document for the remaining authentication work.** It sequences four
existing briefs, adds one new work package that has not been specified anywhere, and defines
what "complete" means so the work has an end.

**Version:** 1.0
**Date:** 2026-08-09
**Repository:** `ClyCites/Clycites-Platform`

---

## §0 — Decisions the owner must make before any agent work resumes

These are not agent tasks. Nothing downstream is safe until they are settled.

### 0.1 Phase 9 ownership — BLOCKING

`Daniel-Dev` contains migration `20260723160925_phase_9_enterprise_dashboard`, which issues
`DROP CONSTRAINT` for 28 foreign keys and one index across the pilot subsystem. `staging` now
declares those same 28 relations in `schema.prisma`, restored because they existed in Phase 8's
hand-written SQL but were never described to Prisma.

Whichever branch merges second breaks. If Phase 9 lands as-is, referential integrity disappears
from the pilot tables while the schema claims it exists.

Decide one:

- **(a)** Phase 9 is authoritative for those constraints — they were dropped deliberately.
  Then `staging`'s schema repair must be reverted, and the reason recorded.
- **(b)** The constraints should exist — Phase 9 dropped them as a side effect of Prisma
  reconciling a schema that never described them. Then Phase 9's migration must be regenerated
  against the repaired schema on its own branch, before merge.

**(b) is almost certainly correct.** An "enterprise dashboard" migration that removes 28
foreign keys across an unrelated subsystem is the signature of exactly this failure mode. But
verify before acting:

```bash
git log --all --oneline -S'PilotCreator' -- packages/database/prisma/schema.prisma
git show df70eec:packages/database/prisma/migrations/20260723160925_phase_9_enterprise_dashboard/migration.sql | grep -c 'DROP CONSTRAINT'
```

If those relation names never appear in any commit, nobody removed them — they were never
declared, and (b) holds.

### 0.2 Branch policy

`staging` is currently both the working branch and the integration branch. Every gate in these
briefs assumes those are different things, and three times now work has reached `origin/staging`
without review.

Decide whether `staging` is protected. If it is, the remaining packages go through PRs. If it
is not, delete the PR language from the briefs rather than leaving instructions everyone routes
around — an unenforced gate is worse than no gate, because it makes the process look stronger
than it is.

### 0.3 Commit hygiene on `1be1b03`

193 lines of `schema.prisma` change sit under the subject "chore: update TypeScript version and
add WP1 Cross-Tenant Authorization vulnerability documentation." Nothing in that message says
the data model changed. Split it out with a subject that names the schema repair and references
§0.1, while it is still the tip and nothing is built on it.

---

## §1 — Document set and precedence

| # | Document | Status |
|---|---|---|
| 1 | Authentication & Authorization Remediation v1.0 (WP0–WP6) | WP1 merged, verification rejected; WP2–WP5 not started |
| 2 | WP1 Hardening & Baseline Closeout v1.0 | Not started |
| 3 | WP1 Hardening Addendum v1.1 | Baseline portion largely executed; §5 evidence capture not done |
| 4 | WP6: Farmer Authentication v1.0 | Not started; prerequisite unmet |
| 5 | **This document** | Controlling |

Precedence, highest first: **this document → 3 → 2 → 4 → 1.**

Two known errors in document 3, already encountered: `--to-schema-datamodel` and
`--shadow-database-url` were removed in Prisma 7. Use `--to-schema` with `shadowDatabaseUrl` in
`prisma.config.ts`, and `--from-config-datasource` / `--to-config-datasource` for live-database
directions. Document 3's "handful of packages" lockfile threshold should be read as *package
identities changed*, not lines.

---

## §2 — Sequence

Each gate must close before the next package opens. No package may begin while its predecessor
has unaccepted verification — that rule is what WP1 violated, and repairing it has cost more
than the original work.

```
§0 owner decisions ─┐
                    ├─→ §3 baseline determinism
                    │        └─→ Doc 2+3: WP1 hardening ──┐
                    │                                      ├─→ WP2 ─→ WP3 ─→ WP4 ─→ WP5 ─→ WP6 ─→ §4 WP7
                    └─ Phase 9 resolved ───────────────────┘
```

WP6 (farmer authentication) sits after WP5 because it depends on the invitation and
password-reset machinery WP5 builds. WP7 is last because it is the only package that can be
deferred past a pilot without blocking one.

---

## §3 — Baseline determinism (new, small, do before WP1 hardening)

The addendum's baseline work is mostly done: TypeScript pinned to 5.9.3, lockfile regenerated
and verified (the old one was missing `class-variance-authority` and `tailwind-merge` while
still passing `--frozen-lockfile`), schema repaired, `clycites_wp1_history` established as an
isolated verified database. Three gaps remain.

### 3.1 `typecheck` reads stale build artifacts

`pnpm --filter @clycites/web typecheck` fails against `.next/types/validator.ts`, which was
generated on a different branch and imports pages that do not exist on `staging`. The result
therefore depends on which branch last ran a build.

A gate whose outcome depends on build cache cannot establish a baseline. Fix it: make
`typecheck` in `apps/web` clean `.next/types` first, or add a `pretypecheck` script that does.
Verify by running it twice from opposite branches.

### 3.2 The gates that have still never run

`pnpm test:e2e` and `pnpm test:security` have not executed once across this entire effort.
Run them. Record the result. If they fail, determine whether the failure pre-dates WP1 with
`git stash` and file issues — do not fix them inside a hardening PR.

### 3.3 Database selection is a trap

The verified baseline lives in `clycites_wp1_history`. The default `clycites` database still
carries populated Phase 9 tables from another branch. Anyone who runs `pnpm test` without
overriding `DATABASE_URL` tests against contaminated state and gets no warning.

Put the isolated URL in `.env.example` with a comment explaining why, and add a startup
assertion to the test setup that fails loudly if `DATABASE_URL` points at a database containing
tables absent from the migration history.

---

## §4 — WP7: Field devices and platform-admin MFA (new specification)

This package has not been specified anywhere. It is last in sequence but is written here in
full because it closes two gaps that no existing brief covers.

### 4.1 The field-device refresh problem

The refresh token is delivered as an httpOnly cookie scoped to `/api/v1/auth`. That is a browser
primitive. `POST /organizations/:organizationId/offline-sync` is bearer-authenticated, and a
collection agent offline for three days returns with an access token that expired in fifteen
minutes.

If the field client is a browser PWA, cookie refresh mostly works. If it is React Native, or if
`sameSite` and path constraints bite in production, **there is no path from "offline for days"
to "valid token"** — and offline-first collection is the core field workflow. This is the
highest-consequence gap remaining in the auth system, because its failure mode is silent data
loss at a collection point, not a login error.

### 4.2 Device-bound sessions

`RegisteredDevice` already exists and is well shaped for this: `devicePublicId` unique,
`assignedUserId`, `organizationId`, `status`, `revokedAt`, `lastSeenAt`, with relations to
`CollectionSession` and `OfflineOperation`. Use it rather than inventing a parallel concept.

Required:

- A separate token endpoint for non-browser clients — `POST /auth/device/token` — that returns
  the refresh token **in the response body**, never as a cookie. The cookie flow remains
  unchanged for the web app; do not try to serve both from one endpoint with a header switch.
- Device tokens are bound to a `RegisteredDevice`. Add `deviceId` to `Session`, nullable, set
  only for device sessions. A device session presented from a different device is rejected and
  the session revoked.
- Revoking a `RegisteredDevice` (`status != ACTIVE` or `revokedAt` set) revokes every session
  bound to it, in the same transaction. Test this — a lost handset at a collection point is a
  realistic incident and this is the control that answers it.
- Device sessions may carry a longer TTL than browser sessions
  (`AUTH_DEVICE_SESSION_TTL_DAYS`, default 30, max 90). Access token TTL stays unchanged.
- A device session's principal is capped: it can never exceed the permissions of
  `assignedUser`, and it is scoped to `RegisteredDevice.organizationId` regardless of what other
  memberships the assigned user holds. A shared collection handset must not become a lateral
  path into a second cooperative.

### 4.3 Do not lose field data to an expired token

The dangerous sequence: agent syncs after the access token expired → `401` → client discards
the queued batch. That is silent loss of collection records.

Required:

- `POST /auth/device/token` must succeed on a valid refresh token even when the access token is
  long expired, provided the session and device are live.
- The sync endpoint must accept records whose `occurredAt` is arbitrarily far in the past. Do
  not add freshness validation on submission timestamps — offline capture is the point.
- Reuse `IdempotencyRecord` so a client that refreshes and retries does not double-submit.
  Every device sync must carry an idempotency key; a retry after `401` → refresh → resubmit must
  be provably a no-op on the second attempt. Test that explicitly.
- JWT verification must tolerate clock skew. Field devices drift. Allow ±120 seconds on `exp`
  and `nbf`, configurable, and document it in the ADR.

### 4.4 Platform-admin MFA

`PLATFORM_ADMIN` reaches every organization's data across the entire system, protected by one
password. For a platform whose pitch involves farmer identity, land data, and lender-facing
records, single-factor platform admin is the first thing an auditor writes up.

Required:

- **TOTP only.** No SMS — same reasoning as WP6.
- Mandatory for `PLATFORM_ADMIN`. Available and optional for `COOPERATIVE_ADMIN`. Not offered
  to farmers.
- Enrolment stores the secret encrypted at rest, not plaintext. Ten single-use recovery codes,
  stored hashed, shown once.
- Login becomes two-stage for MFA-enabled accounts: credentials return a short-lived
  (5-minute) challenge token that is **not** an access token and carries no permissions; the
  TOTP submission exchanges it for a real session.
- `Session` records `mfaSatisfiedAt`. A session that never satisfied MFA on an MFA-required
  account must be rejected by `authenticateAccessToken`.
- Rate limit TOTP verification per account: 5 attempts, then the challenge token is burned.
- Audit events for enrolment, successful and failed verification, recovery-code use, and reset.
- Recovery-code exhaustion and lost-authenticator reset require a second platform admin, not a
  self-service email flow. If only one platform admin exists, document the break-glass
  procedure rather than building a backdoor.

### 4.5 Signing key rotation

`AUTH_ACCESS_TOKEN_SECRET` is a single HS256 secret with no `kid`. Rotating it invalidates every
token in flight, which means in practice it will never be rotated.

Add a `kid` header, support verifying against a small set of keys (current plus previous), and
sign only with the current one. Config takes an ordered list. This makes rotation a rolling
operation instead of an outage — no asymmetric signing, no JWKS endpoint, no key-management
service. Twenty lines, and it converts "we can never rotate" into "we rotate quarterly."

---

## §5 — Definition of "authentication complete"

Auth is complete when all of the following hold. Not before, and — importantly — not after
more scope is added.

**Correctness**

- Logout revokes access tokens, not only sessions.
- Login is not a timing oracle for account existence.
- Rate limiting is per-account as well as per-IP.
- Cross-tenant authorization is enforced at the guard, fail-closed, with no route lacking scope
  metadata.
- Farmers authenticate by username, email, or phone, and see only their own records — across
  every cooperative they deliver to and no further.
- Field devices can refresh after arbitrary offline periods without losing queued data.
- Platform admins are protected by a second factor.

**Lifecycle**

- Invitation acceptance, password reset (staff-assisted primary, email OTP secondary), password
  change, and identifier retirement all exist and are tested.

**Verification**

- `pnpm lint`, `typecheck`, `test`, `test:e2e`, `test:security`, and `openapi:check` all pass on
  a clean checkout against a database built solely from migration history.
- The route meta-test enumerates from the running container, has no skip path, and asserts count
  floors.
- Every subject-scoped and self-scoped route has a leak test.
- `docs/security/2026-08-wp1-cross-tenant-authorization.md` contains real captured output from
  commit `635adc7ce715ce2d9d8d25cea4f6adc5480a291a`.

**Documentation**

- ADRs covering: scoped principal, subject axis crossing organization boundaries, the
  three-identifier classifier, staff-assisted reset, differentiated farmer password policy,
  device-bound sessions, MFA scope, key rotation.
- Open questions recorded and routed to counsel, not silently resolved in code:
  `SETTLEMENT_DEDUCTION` withdrawal against outstanding advances, `DATA_PROCESSING` withdrawal
  legal floor, estate access after `DECEASED`.

---

## §6 — Explicitly out of scope

Write these down so they stop being reconsidered every session.

- SMS or any telecom integration, including Africa's Talking.
- Asymmetric token signing, JWKS, external identity providers, SSO, OAuth.
- Permission caching and JWT allowlists. Revisit only when request latency is measured and
  attributable — not before.
- Farmer write access beyond consent withdrawal.
- Biometric authentication.
- Anything in `apps/web`'s auth UI beyond what is required to keep it compiling.

---

## §7 — Standing rules for every remaining package

1. Write the failing test first; capture the output; include it.
2. Fail closed. If scope cannot be resolved, deny.
3. One work package per PR. Baseline green before the next opens.
4. No new runtime dependencies unless the package names them.
5. No secrets in logs, ever — no passwords, tokens, reset codes, TOTP secrets, or raw
   identifiers. Hash identifiers in security events.
6. Audit events are append-only.
7. Report, do not decide, on anything with legal or financial consequence.
8. If a test cannot fail, it is not a test. Demonstrate every invariant failing before accepting
   it.

---

## §8 — A note on sequencing risk

Authentication is being specified ahead of field contact. WP6 in particular encodes assumptions
that only a collection point can settle: whether farmers will use a phone at all or have an
agent show them the screen, whether a password is usable for someone who logs in twice a
season, whether staff-assisted reset is operationally realistic for a co-op with one admin and
four hundred members.

The authorization model is safe to build now — it is structural and expensive to retrofit. The
farmer credential mechanism is the one component where building before observing is likely to
produce work that gets thrown away. If a cooperative visit happens before WP6 starts, that
ordering is worth more than the weeks it costs.
