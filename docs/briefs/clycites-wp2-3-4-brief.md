# Agent Brief — WP2, WP3, WP4: Session Binding, Login Hardening, Hygiene

**Paste as the opening message to a coding agent in `ClyCites/Clycites-Platform`.**

**Version:** 1.0
**Design of record:** `docs/architecture/authentication-backbone.md` §3, §6, §8. Where this
brief and the backbone disagree, the backbone wins — report the discrepancy.
**Prerequisite:** WP1 and WP1 Hardening merged (done). Baseline green.
**Scope:** three work packages, three pull requests, in the order given.

None of these touch the farmer axis, device sessions, or MFA. They fix the authentication core
for the users who already exist.

---

## 0. Before you start

Confirm current state rather than trusting this brief's description of it — WP1 changed things.

```bash
git log --oneline -5
sed -n '1,60p' apps/api/src/auth/auth.service.ts
grep -n "sessionId" packages/auth/src/index.ts apps/api/src/identity/auth.guard.ts
grep -rn "AUTH_" apps/api/src/config/environment.ts
```

Specifically: `AuthenticatedPrincipal` may already declare `sessionId`. Find out whether it is
populated, and from where. If it exists but is filled with a placeholder, WP2 is the package
that makes it real.

Then establish the baseline and record it:

```bash
export DATABASE_URL='postgresql://clycites:clycites_local@localhost:5432/clycites_wp1_history?schema=public'
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm test:security && pnpm openapi:check
```

Every package below must leave all six green. Write the failing test first, capture its output,
then fix. A test that has not been demonstrated failing is not evidence.

---

# WP2 — Bind access tokens to sessions

## The defect

The access token payload is `{ sub, type: 'access' }`. `authenticateAccessToken` verifies the
JWT and calls `principalForUser(sub)` without ever consulting the `Session` table.

So after `POST /auth/logout`, `POST /auth/logout-all`, or `DELETE /auth/sessions/:id`, the
bearer token keeps working until it expires — up to `AUTH_ACCESS_TOKEN_TTL_MINUTES`, default 15.
Revocation does not revoke. Suspending a *user* takes effect immediately, because `currentUser`
checks `status`; revoking a *session* does nothing.

## Required change

Set `jti` to the session id when issuing. `issueLoginResponse` currently takes only `userId` and
must take the session id as well; both `login` and `refresh` must pass the real one — `refresh`
rotates the token but keeps the same session, so the `jti` is stable across refreshes.

On verification, load the session and reject unless **all** hold: it exists, `revokedAt` is
null, `expiresAt` is in the future, and `session.userId` equals the token subject.

## Do this with one query, not two

`principalForUser` already performs a join-heavy `findUnique` on `User` with memberships and
organizations. Do **not** add a second query for the session. Invert it — query `Session` and
include the user graph:

```ts
const session = await this.database.client.session.findUnique({
  where: { id: jti },
  select: {
    id: true, userId: true, revokedAt: true, expiresAt: true,
    user: { select: { /* exactly what principalForUser needs today */ } },
  },
});
```

Net query count is unchanged. If it increases, the implementation is wrong.

Populate `principal.sessionId` from the verified `jti`. Keep the existing user checks —
`status === 'ACTIVE'`, `deletedAt` null — exactly as they are.

## Tests

- Login, logout, then the previously-issued access token returns `401`.
- Same for `logout-all` and for revoking a specific session by id.
- A token whose `jti` names a session belonging to a different user is rejected.
- An expired session's token is rejected even though the JWT itself is still valid.
- Refresh keeps the same `jti`, and the token issued before the refresh is rejected afterwards.
- Query count per authenticated request does not increase — assert with a Prisma middleware
  counter or an explicit `$on('query')` spy.

---

# WP3 — Login hardening

## 3a. Close the user-enumeration timing oracle

```ts
if (!user || !(await verify(user.passwordHash, input.password)))
```

This short-circuits. A missing account returns in single-digit milliseconds; a real account with
a wrong password returns after a full argon2id verify. That difference enumerates your staff and
farmer roster.

Fix: generate a fixed dummy argon2id hash once at module load. When no user is found, verify the
supplied password against it, discard the result, and return the identical
`UnauthorizedException('Invalid email or password')`.

**Test by counting verify calls, not by measuring wall-clock time.** Timing assertions are
flaky in CI and prove nothing on a loaded machine. Spy on the argon2 `verify` and assert it is
invoked exactly once on both the found and not-found paths.

## 3b. Per-account rate limiting

`@Throttle({ limit: 10, ttl: 60_000 })` on `ThrottlerGuard` keys on IP. In Uganda a cooperative
office is typically one NAT'd connection — ten collection agents signing in at shift start lock
each other out — while distributed credential stuffing across a botnet is unaffected.

Add a Redis-backed limiter **alongside** the existing IP throttle, not replacing it.

### Key on two counters, check both

- **Counter A — hashed identifier.** Incremented on every failure, whether or not a user
  resolves. HMAC-SHA256 over the normalised identifier using a new
  `AUTH_IDENTIFIER_HASH_PEPPER`.
- **Counter B — resolved user id.** Incremented only when the identifier resolves to a user.

Deny if **either** is over its limit.

Counter A alone would let an attacker rotate identifier types against one account for three
times the budget once WP6 lands. Counter B alone would mean lockout only ever triggers for real
accounts — making the `429` itself an enumeration oracle, which is the exact bug 3a just closed.
Both are required.

### Behaviour

- 5 failures, then progressive windows: 1 min, 5 min, 15 min, 60 min. Capped at 60 — **never a
  permanent lock**.
- Reset both counters on successful authentication.
- Return `429` with `Retry-After`. The response body must be identical regardless of whether the
  account exists.
- New config, validated in `environment.ts` in the same Zod style as the existing `AUTH_*`
  variables, and documented in `.env.example`: `AUTH_LOGIN_MAX_FAILURES` (default 5),
  `AUTH_LOGIN_LOCKOUT_BASE_SECONDS` (default 60), `AUTH_LOGIN_LOCKOUT_MAX_SECONDS`
  (default 3600), `AUTH_IDENTIFIER_HASH_PEPPER` (min 32 chars, rejected at the local default in
  production).

### The tradeoff, to be written into the ADR

Per-account lockout is itself a denial-of-service vector: anyone who knows a collection agent's
email can lock them out for an hour. This is accepted because the alternative — unlimited online
guessing, eventually against 8-character farmer passwords — is worse, and because staff-assisted
recovery exists at the cooperative. Record it as a considered decision so the next reviewer does
not treat it as an oversight.

Build the limiter with the identifier class as a parameter. WP6 reuses it for farmer login
across three identifier types.

## 3c. Make failed logins investigable

The current failed-login audit event records `reason: 'invalid_credentials'` and nothing else —
no actor, no identifier. You cannot detect a targeted attack on one account or reconstruct an
incident from it.

Add to the metadata: the Counter A hash, the IP, and the user agent. Emit a distinct
`AUTH_LOGIN_LOCKED_OUT` event when the limiter trips.

**Never store the raw identifier or any part of the attempted password.** Backbone invariant 12.

## Tests

- Verify is called exactly once on both the found and not-found paths.
- Five failures then `429` with `Retry-After`.
- Lockout triggers identically for an identifier that resolves to no user.
- Successful authentication resets both counters.
- Backoff escalates 1 → 5 → 15 → 60 and stops at 60.
- Failed-login audit contains the hash, IP, and user agent, and contains neither the raw
  identifier nor the password.
- `AUTH_LOGIN_LOCKED_OUT` is emitted on trip.

---

# WP4 — Correctness and hygiene

Five small items. Each needs a test.

### 4.1 Wrong status code on `revokeSession`

Throws `UnauthorizedException` when the session is not found, which tells clients to
re-authenticate over a missing resource. Use `NotFoundException`. Confirm no client depends on
the `401`.

### 4.2 Argon2id is the wrong primitive for refresh tokens

The refresh token is `${sessionId}.${randomBytes(32).toString('base64url')}` — 256 bits of CSPRNG
output. It needs no memory-hard KDF. Every refresh currently runs a 64 MiB argon2 hash **plus** a
verify, four times an hour per active user.

Replace with HMAC-SHA256 over the token using a new `AUTH_REFRESH_TOKEN_PEPPER`, compared with
`crypto.timingSafeEqual`. Keep the `Session.refreshTokenHash` column.

**Do not attempt to convert existing hashes** — they are one-way. Write a migration that revokes
all existing sessions, name it so the effect is obvious (`..._revoke_sessions_for_refresh_hash_change`),
and state it in the PR description. Harmless now; state plainly that it would not be harmless
once cooperatives are live.

**Password hashing stays argon2id.** Do not touch it.

### 4.3 Version-coupled cookie path

`path: '/api/v1/auth'` breaks every live session the day `v2` ships. Move to an unversioned
prefix. Record the choice in an ADR.

### 4.4 `sameSite` cannot express the deployment

The enum allows only `lax | strict`, but web runs on `:3000` and the API on `:4000` — different
origins. Either document that production proxies both under one origin, or add `'none'` with a
Zod refinement forcing `AUTH_REFRESH_COOKIE_SECURE` true whenever it is used. **Do not permit
insecure `none`.** Whichever you choose, write it down; the current silence is the problem.

### 4.5 `logout` reports success when it did nothing

Returns `{ loggedOut: true }` even when no cookie was present and no session was revoked. Keep
the `200` — do not leak session state — but only emit `SESSION_REVOKED` when a session was
actually revoked. A misleading audit trail is worse than a sparse one.

## Tests

- Revoking a nonexistent session returns `404`.
- Refresh works end to end under HMAC: rotation succeeds, and presenting a rotated token still
  triggers reuse detection and revokes the session.
- The refresh cookie is set on the unversioned path.
- `sameSite: 'none'` with `secure: false` is rejected at config load, if 4.4 takes that route.
- `logout` with no cookie returns `200` and writes no audit event.

---

## Definition of done

- Three PRs, in order, each leaving all six baseline commands green.
- Every test above demonstrated failing first, with output in the PR description.
- `.env.example` documents `AUTH_IDENTIFIER_HASH_PEPPER`, `AUTH_REFRESH_TOKEN_PEPPER`,
  `AUTH_LOGIN_MAX_FAILURES`, `AUTH_LOGIN_LOCKOUT_BASE_SECONDS`, `AUTH_LOGIN_LOCKOUT_MAX_SECONDS`.
- ADR updates: session-bound tokens, the lockout DoS tradeoff, refresh-token hashing change,
  cookie path, cross-origin cookie decision.
- `docs/architecture/authentication-backbone.md` §10 status table updated to mark WP2, WP3, WP4
  complete.
- Backbone invariants 4, 5, and 12 now have tests. Reference them by number.

## What not to do

- Do not add a permissions cache, a token allowlist, or asymmetric signing. Deferred by design.
- Do not touch the farmer axis, `@SubjectScoped`, device sessions, or MFA — WP6 and WP7.
- Do not weaken argon2id for passwords.
- Do not make lockout permanent.
- Do not vary any response body or status by whether an account exists.
- Do not test timing with wall-clock assertions.

## Report back

1. Baseline before and after each package.
2. Whether `principal.sessionId` already existed and how it was populated.
3. Query count per authenticated request, before and after WP2.
4. Deliberate-failure output and passing output for every test.
5. Any place where authentication is decided outside `auth.service.ts` that this brief missed.
