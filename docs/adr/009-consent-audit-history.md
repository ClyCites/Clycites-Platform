# ADR 009: Append-preserving consent and audit history

## Status

Accepted

## Decision

Record consent grants as immutable facts with policy version and capture method. Withdrawal updates
the grant's lifecycle fields but does not delete it. Sensitive Phase 1 mutations write organization-
scoped audit and transactional outbox records in the same database transaction as domain changes.

## Consequences

The platform can explain who changed identity records and when, and can distinguish historical
consent from current consent. Future event publication can consume the outbox without weakening the
authoritative PostgreSQL transaction.
