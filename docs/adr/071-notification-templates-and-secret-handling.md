# ADR 071: Notification templates and secret handling

## Status

Accepted

## Context

Invitation, password-reset, and email-verification credentials exist in plaintext only when they
are issued; their authoritative credential records retain hashes. Notification delivery therefore
needs short-lived access to plaintext while preventing terminal delivery history from becoming a
secret archive. The pilot also needs real email transport, but has no approved SMS transport.

## Decision

Notification templates are versioned, typed code in `@clycites/contracts`, not database records.
Each template declares `containsSecret`, validates its parameters, and renders only after the worker
loads a delivery. Producers assert the registry version before writing. Jobs contain only the
delivery UUID, and logs and audit metadata exclude recipients, parameters, and rendered bodies.

Secret-bearing parameters may exist while a delivery is pending or retryable. They are set to SQL
null on `DELIVERED`, terminal `FAILED`, `CANCELLED`, or `SUPPRESSED`. A scheduled registry-driven
sweep applies the same rule to historical terminal rows. Delivery receipt fields remain available
for operational evidence.

Email defaults to the console provider for local operation. Selecting SMTP requires explicit host,
port, sender, and paired credentials when authentication is used. SMTP submission uses Nodemailer.
SMS rows are explicitly suppressed with `SMS_NOT_IMPLEMENTED`; they are never submitted through an
email or synthetic provider.

Transient failures use capped exponential retry scheduling. A conditional state transition claims
each attempt. SMTP does not provide exactly-once semantics: a process failure after remote
acceptance but before the database commit can leave an ambiguous submission. Provider message IDs
are retained when available, but no unsupported exactly-once guarantee is claimed.

## Consequences

Credential delivery is functional without retaining terminal plaintext. Adding or changing a
template requires a code review and version change. Bounce and complaint handling remains absent.
Notification receipt retention remains an owner and counsel decision; this ADR does not implement
a purge policy.

This ADR supersedes ADR 034's restriction to synthetic providers while preserving its UUID-only job
and privacy boundaries.