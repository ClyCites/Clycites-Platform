# ADR 002: PostgreSQL authority

## Status

Accepted

## Context

Traceability and settlements need relational integrity, transactions, JSON payloads, and reporting.

## Decision

Use PostgreSQL as the authoritative database through Prisma. Use standard UUID primary keys because
UUIDv7 is not uniformly available without additional extensions or libraries.

## Consequences

Strong transactions and constraints support auditability. Schema changes require reviewed migrations.
Redis, MinIO, and Hedera remain supporting systems and cannot supersede PostgreSQL records.

## Alternatives considered

MongoDB weakened relational constraints for this workflow. Event-store-only persistence added
unnecessary complexity. UUIDv7 may be reconsidered through a future ADR when portability is clear.
