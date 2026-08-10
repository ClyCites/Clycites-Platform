# Agent Brief — WP4-R, WP5, WP7 (and WP6 sequencing)

**Paste as the opening message to a coding agent in `ClyCites/Clycites-Platform`.**

**Version:** 1.0
**Design of record:** `docs/architecture/authentication-backbone.md`
**Prerequisite:** WP1–WP4 merged and green.
**WP6 has its own brief** — "WP6: Farmer Authentication v1.0". Do not restate it here; §3 below
covers only what changed since it was written.

## Document precedence — resolving a known contradiction

The backbone and the WP2–4 brief each claimed to win over the other. The correct order, highest
first:

1. **The codebase.** Any factual claim in any document may be stale. Verify before trusting.
   WP4.5 was exactly this — the brief described a defect that did not exist.
2. **The backbone.** Owns *design*: which axes exist, how they compose, what the invariants are.
3. **The briefs.** Own *implementation and sequencing*: how to build it, in what order.

A brief contradicting the backbone on design loses and gets amended. The backbone contradicting
a brief on implementation mechanics loses. Correct the precedence statement in both documents as
part of WP4-R.

---

# WP4-R — Remainder and cleanup

Small. Do it first, in one PR.

### R1. Restore typed config in the login limiter

`login-limiter.service.ts` ended on `ConfigService<Record<string, unknown>, false>` after three
attempts to satisfy editor diagnostics — while `pnpm typecheck` was clean throughout. That
trades compile-time key checking on `AUTH_IDENTIFIER_HASH_PEPPER` and the lockout variables for
a stale language-server cache.

The compiler was authoritative. Restore the typed `ApiEnvironment` generic. If the editor still
disagrees, restart the TS server; do not reshape working code around a cache.

### R2. Audit the WP2 migration

```bash
cat packages/database/prisma/migrations/20260809163000_bind_access_tokens_to_sessions/migration.sql
```

WP2 was a token-payload change — `jti` plus a session lookup. It should not have required a
schema migration. If that file revokes sessions, keep it but rename it for what it does. If it
adds an index on `Session.id`, that is already the primary key and it should be removed. Report
what it contains either way.

### R3. Confirm nothing read the empty `sessionId`

`principal.sessionId` existed and was always `''` between WP1 and WP2.

```bash
git log -S"sessionId" --oneline -- apps/api/src packages/auth/src
grep -rn "principal.sessionId\|\.sessionId" apps/api/src packages/auth/src | grep -v node_modules
```

If any code compared, looked up, or persisted it during that window, it was silently operating
on an empty string. Report the finding; fix only if something did.

### R4. Fix the precedence statement

Apply the three-level order above to both the backbone and the WP2–4 brief.

### R5. Amend WP6's brief to reference the backbone

WP6 v1.0 §4.1 instructs making `User.passwordHash` nullable. That now belongs to WP5 (§2a
below), because invitation acceptance needs it first. Add a note to WP6's brief pointing at WP5
for that change so it is not done twice.

---

# WP5 — Credential lifecycle

**This is the package that lets a real person get an account.** Today every user in the system
came from the seed script: `UserStatus` defaults to `INVITED`, login requires `ACTIVE`, and no
path exists between them.

Backbone §6 is the design. Nothing here exists yet — check before assuming otherwise:

```bash
grep -n "^model.*\(Invitation\|Reset\|Verification\|Token\)" packages/database/prisma/schema.prisma
grep -o "MEMBERSHIP_[A-Z_]*\|USER_[A-Z_]*\|INVITE[A-Z_]*" packages/auth/src/index.ts | sort -u
```

## 2a. Make `passwordHash` nullable — do this first

`User.passwordHash` is non-nullable, so an account cannot be provisioned before its owner sets a
password. Make it nullable and add a database CHECK constraint:

```sql
ALTER TABLE "User" ADD CONSTRAINT "User_active_requires_password"
  CHECK (status <> 'ACTIVE' OR "passwordHash" IS NOT NULL);
```

Update every read site that assumes non-null. The login path must reject a null hash before
reaching argon2 — and must do so **after** the dummy-hash verify from WP3a, so the timing
signature is unchanged. This is easy to get wrong and reopens the enumeration oracle. Test it.

## 2b. Invitation acceptance

New model `UserInvitation`: hashed token, `userId`, `organizationId`, `invitedByUserId`,
`expiresAt`, `acceptedAt`, `revokedAt`. Index the token hash.

- Invitation is organization-scoped and uses the organization axis. Find the existing invite
  permission rather than adding one — report what you find.
- Single use, 7-day expiry, `AUTH_INVITATION_TTL_DAYS`.
- Accepting sets the password and transitions `INVITED → ACTIVE` in one transaction.
- Re-invite invalidates any prior outstanding token and is rate-limited per inviter per day.
- An expired invitation leaves the user `INVITED` and re-invitable. Do not auto-delete the user.
- Audit on issue, acceptance, and revocation.

## 2c. Password reset

`POST /auth/password-reset/request` and `POST /auth/password-reset/confirm`. New model
`PasswordReset` with the same shape as above.

- Store only a hash. Single use. 30-minute expiry. Maximum 5 confirm attempts before the token
  is burned.
- The request endpoint returns `202` **unconditionally** — it must not reveal whether the
  account exists. Rate limit it with the WP3b limiter, reusing the same counters.
- On success, revoke **all** sessions and emit `AUTH_PASSWORD_RESET_COMPLETED`.
- Available only where the target channel is verified (backbone §6: an unverified channel may
  authenticate but may never recover).

## 2d. Password change

`POST /auth/password` for an authenticated user. Requires the current password. Revokes every
session except the calling one — use `principal.sessionId`, which is real as of WP2. Audit.

## 2e. Email verification

`emailVerifiedAt` and `phoneVerifiedAt` are written by nothing and read by nothing.

Build email verification: hashed token, 24-hour expiry, sets `emailVerifiedAt`. Add a config
flag `AUTH_REQUIRE_VERIFIED_EMAIL` defaulting to **false**, so the pilot can turn it on without
a code change. **Do not enable it.** Leave `phoneVerifiedAt` null — phone verification is
deferred with SMS and must not be faked.

## 2f. Password policy — implements backbone §5.3

One validator, taking the account class as an **explicit argument**:

```ts
type AccountClass = 'STAFF' | 'FARMER';
validatePassword(password: string, accountClass: AccountClass): void;
```

- `STAFF` — minimum 12 characters.
- `FARMER` — minimum 8, justified by aggressive per-account lockout and breach screening.
- No composition rules in either case.

**Never infer the class** from role, membership, or the presence of a farmer profile. A
dual-role user — a cooperative board member who is also a farmer — would then receive whichever
policy the inference happened to check first. The provisioning flow declares the class; the
validator does not guess. Assert this with a test using a dual-role fixture.

Breach screening: use a vendored list if one already exists. Otherwise screen against a small
local list of the most common passwords and **report the gap** — do not add a dependency for it
without asking.

## 2g. Delivery is out of scope — and is an owner decision

Enqueue a BullMQ job and log that delivery would occur. Do not integrate an email provider.

**Flag this clearly in the PR:** without a mail transport, staff password reset is
non-functional in practice — the token is generated and never delivered. Choosing a provider
involves deliverability from Uganda, cost, and DPA implications, and it is a pilot blocker that
belongs to the owner, not to this package.

## Tests

Invitation issue → accept → login. Expired invitation rejected, user still `INVITED`, re-invite
works. Reset request returns `202` for both existing and nonexistent accounts with identical
bodies and comparable timing. Reset revokes all sessions. Change-password preserves the calling
session and kills the rest. A null-`passwordHash` login attempt performs the same number of
argon2 verifies as a wrong-password attempt. The CHECK constraint rejects an `ACTIVE` user with
a null hash. Dual-role fixture receives the declared policy, not an inferred one.

---

# WP6 — Farmer authentication

**Use the existing brief.** Three amendments only:

1. §4.1's `passwordHash` nullable change moved to WP5 §2a. Verify it landed; do not repeat it.
2. The invitation machinery from WP5 §2b exists now. Farmer account provisioning (WP6 §5.1)
   should reuse it rather than build a parallel flow — one `UserInvitation` model, with the
   activation code handed over in person for farmers instead of emailed.
3. The password validator from WP5 §2f exists. WP6 passes `'FARMER'` explicitly.

Everything else in that brief stands.

---

# WP7 — Device sessions, MFA, key rotation

Master Brief §4 has the design. This is the executable form, plus the two composition rules that
have no other owner.

## 4a. Device-bound sessions

`RegisteredDevice` already exists: `devicePublicId` unique, `assignedUserId`, `organizationId`,
`status`, `revokedAt`, `lastSeenAt`, with relations to `CollectionSession` and
`OfflineOperation`. Use it; do not invent a parallel concept.

- `POST /auth/device/token` returns the refresh token **in the response body**, never a cookie.
  The browser cookie flow is unchanged. Do not merge the two behind a header switch — different
  threat models, different revocation triggers, different TTLs.
- Add nullable `Session.deviceId`. A device session presented from a different device is
  rejected and revoked.
- Revoking a `RegisteredDevice` revokes every session bound to it, same transaction. **Test
  this** — a lost handset at a collection point is a realistic incident and this is the control
  that answers it.
- `AUTH_DEVICE_SESSION_TTL_DAYS`, default 30, max 90. Access token TTL unchanged.
- A device principal is capped to `RegisteredDevice.organizationId` regardless of what other
  memberships the assigned user holds, and can never exceed that user's permissions. A shared
  handset must not become a lateral path into a second cooperative.

### Implements backbone §5.1 — device sessions denied on the subject axis

A collection agent may also be a farmer. Their device session is capped to the device's
organization — but `@SubjectScoped` routes carry no organization, so the cap does not reach
them.

**Rule: a session with `deviceId` set is denied on every `@SubjectScoped` route,
unconditionally.** Device sessions exist for field capture on a shared handset; personal
delivery and settlement history must not be reachable from a device four other people use.

Enforce in the guard. Assert in the route meta-test. Test explicitly.

## 4b. Do not lose field data to an expired token

The dangerous sequence: agent syncs after the access token expired → `401` → client discards the
queued batch. Silent loss of collection records.

- `POST /auth/device/token` must succeed on a valid refresh token however long the access token
  has been expired, provided session and device are live.
- The sync endpoint must accept records with arbitrarily old `occurredAt`. **No freshness
  validation on submission timestamps** — offline capture is the point.
- Reuse `IdempotencyRecord`. Every device sync carries an idempotency key; `401` → refresh →
  resubmit must be provably a no-op on the second attempt. Test it.
- JWT verification tolerates ±120 seconds of clock skew, configurable. Field devices drift.

## 4c. MFA

- **TOTP only.** No SMS.
- Mandatory for `PLATFORM_ADMIN`. Optional for `COOPERATIVE_ADMIN`. Never offered to farmers.
- Secret encrypted at rest, not plaintext. Ten single-use recovery codes, hashed, shown once.
- Two-stage login: credentials return a 5-minute challenge token that is **not** an access token
  and carries no permissions; the TOTP submission exchanges it for a session.
- Rate limit verification: 5 attempts, then the challenge token is burned.
- Audit enrolment, success, failure, recovery-code use, reset.
- Recovery-code exhaustion and lost authenticators require a second platform admin. If only one
  exists, document a break-glass procedure — do not build a backdoor.

### Implements backbone §5.2 — MFA gates the session, not the route

A cooperative admin who enrols in optional TOTP may also be a farmer.

**Rule: `Session.mfaSatisfiedAt` gates the session.** An MFA-enrolled user has every session
subject to it, on every axis, including `/me`. A second factor a user can sidestep by changing
endpoints is not a second factor. `authenticateAccessToken` rejects any session lacking
`mfaSatisfiedAt` for an MFA-required account.

## 4d. Key rotation

`AUTH_ACCESS_TOKEN_SECRET` is a single HS256 secret with no `kid`, so rotating it invalidates
every token in flight — which means it will never be rotated.

Add a `kid` header. Config takes an ordered key list; verify against current and previous, sign
with current only. No JWKS, no asymmetric signing, no KMS. This converts rotation from an outage
into a rolling operation.

---

## Sequencing and definition of done

Four PRs: WP4-R, WP5, WP6, WP7. Each leaves `lint`, `typecheck`, `test`, `test:e2e`,
`test:security`, `openapi:check` green before the next opens.

- Every test demonstrated failing first, with output in the PR description.
- `.env.example` documents every new variable.
- ADRs for: nullable `passwordHash` and the CHECK constraint; the differentiated password policy
  as a deliberate documented weakening; device-bound sessions; MFA scope; key rotation.
- Backbone §10 status table updated per package.
- Backbone invariants 6, 7, 10, and 11 gain tests. Reference them by number.
- Backbone §5 marked owned: 5.1 → WP7, 5.2 → WP7, 5.3 → WP5.

## What not to do

- Do not integrate SMS or an email provider.
- Do not give farmers write access beyond consent withdrawal.
- Do not let a platform admin authenticate through the subject axis.
- Do not enable `AUTH_REQUIRE_VERIFIED_EMAIL`.
- Do not fabricate `phoneVerifiedAt`.
- Do not infer account class in the password validator.
- Do not add asymmetric signing, JWKS, SSO, or a permissions cache.

## Report back

1. WP4-R findings: migration contents, `sessionId` history, existing invite permission name.
2. Deliberate-failure and passing output per test.
3. Whether a breach-password list is already vendored, and the gap if not.
4. Any authorization decision found outside `PermissionsGuard` or `AuthService`.
5. The mail-transport blocker restated for the owner.

---

## One sequencing note

WP6 encodes assumptions only a collection point can settle — whether farmers will use a phone at
all or have an agent show them the screen, whether a password is usable for someone who logs in
twice a season, whether staff-assisted reset is realistic for a cooperative with one admin and
four hundred members.

WP4-R, WP5, and WP7 are safe to build now; their designs do not depend on field observation.
WP6 is the one where building before observing risks work that gets thrown away. If a
cooperative visit is possible before it starts, that ordering is worth more than the delay costs.
