# ADR 006: Access tokens and rotating sessions

## Status

Accepted

## Decision

Use short-lived HS256 access tokens for API authorization and opaque refresh tokens in Secure,
HttpOnly, SameSite=Lax cookies. Store only refresh-token hashes server-side. Rotate on every refresh,
revoke the token family on reuse, and keep web access tokens in memory rather than browser storage.

## Consequences

API requests remain stateless during an access-token lifetime while sessions can be revoked and
replay detected. Browser reloads require a refresh request. Production must provide a high-entropy
secret and HTTPS.
