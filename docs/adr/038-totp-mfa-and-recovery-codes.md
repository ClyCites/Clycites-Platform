# ADR 038: TOTP MFA and recovery codes

## Status

Accepted

## Context

Platform administrators require mandatory MFA. Cooperative administrators may opt in, including
users who also have a farmer identity. No email or SMS provider is available for a second factor.

## Decision

Use TOTP with AES-256-GCM encrypted secrets and ten one-time recovery codes stored as keyed digests.
Platform administrators who have not enrolled receive an enrollment challenge after password
verification and no session. Enrolled users receive a five-minute login challenge with five
attempts and no session until verification succeeds.

MFA satisfaction belongs to `Session`, not to an authorization axis. Enrollment satisfies the
current session and revokes the user's other sessions. Every later browser session requires TOTP or
a recovery code, and using a recovery code consumes it atomically.

## Consequences

An enrolled dual-role user cannot bypass MFA through farmer or organization routes. Losing both the
authenticator and all recovery codes requires administrative recovery outside this flow.

## Alternatives considered

Email and SMS factors were excluded because provider integration is outside scope. Storing plaintext
TOTP secrets or recovery codes was rejected because a database disclosure would expose live factors.
