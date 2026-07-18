# ADR 008: Opaque farmer QR identities

## Status

Accepted

## Decision

QR payloads contain a versioned random `fq1_` public identifier in a ClyCites URL and no farmer PII.
Only one active QR identity may exist per farmer and organization. Replacement atomically marks the
old identity replaced and creates a new random identity; revocation is retained as history.

## Consequences

Scanning does not disclose identity data without authenticated, authorized lookup. Printed codes can
be revoked without deleting audit history. Database constraints protect active-identity uniqueness.
