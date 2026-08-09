# ADR 006: Access tokens and rotating sessions

## Status

Accepted

## Decision

Use short-lived HS256 access tokens for API authorization and opaque refresh tokens in Secure,
HttpOnly, SameSite=Lax cookies. Store only refresh-token hashes server-side. Rotate on every refresh,
revoke the token family on reuse, and keep web access tokens in memory rather than browser storage.

Set each access token's `jti` to its session id. Verification performs one session query that also
loads the user and organization-membership graph, and rejects a missing, revoked, expired, or
subject-mismatched session. Refresh keeps the session id stable and advances
`accessTokenValidAfter`, invalidating access tokens issued before the rotation. This enforces
authentication-backbone invariant 4.

## Consequences

Authenticated API requests consult PostgreSQL once, so session revocation takes effect immediately
without adding a token allowlist or permissions cache. Browser reloads require a refresh request.
Production must provide a high-entropy secret and HTTPS.

## Login hardening

Missing and existing accounts each perform exactly one Argon2id verification. Missing accounts use
a fixed valid dummy hash, and every failure returns the same authentication response. This enforces
authentication-backbone invariant 5 without relying on wall-clock timing tests.

Keep the existing IP throttle and add Redis-backed counters for both the HMAC-SHA256 hash of the
normalized identifier and the resolved user id. Lock after five failures for progressively longer
windows of 1, 5, 15, and 60 minutes, capped at 60 minutes. A successful login clears both counters.
The limiter accepts the identifier class explicitly so email, phone, and username logins share the
user budget when those identifiers are introduced.

Per-account lockout creates a denial-of-service vector: an attacker who knows a collection agent's
identifier can deny access for up to one hour. We accept this because unlimited online guessing,
eventually against shorter farmer passwords, is the greater risk and cooperative staff can assist
with recovery. Locks are never permanent.

Failed-login audit events contain only the keyed identifier hash, IP address, and user agent. Raw
identifiers and passwords are prohibited, and a separate `AUTH_LOGIN_LOCKED_OUT` event records each
trip. These controls enforce authentication-backbone invariant 12 for login attempts.

## Refresh-token storage and cookies

Refresh tokens contain 256 bits of random secret material, so store HMAC-SHA256 digests keyed by
`AUTH_REFRESH_TOKEN_PEPPER` and compare them with `timingSafeEqual`. Argon2id remains mandatory for
passwords; it is unnecessary for full-entropy refresh tokens. The migration named
`20260809165000_revoke_sessions_for_refresh_hash_change` revokes every existing session because an
Argon2 digest cannot be converted to an HMAC digest. That is harmless before cooperatives are live;
after go-live, the same migration would force every user to sign in again and must be announced and
scheduled explicitly.

Scope the refresh cookie to `/api`, which includes current and future versioned authentication
routes without coupling live sessions to `/api/v1`. Local ports 3000 and 4000 are different origins
but remain same-site, so the default `SameSite=Lax` is valid for local development and for a
same-site production proxy. Cross-site deployments may select `SameSite=None`, but configuration
validation requires `Secure=true`; insecure `None` is never permitted.

Revoking an unknown session returns `404`. Logout without a refresh cookie remains an intentionally
indistinguishable `200` and does not emit `SESSION_REVOKED`, because no session changed state.
