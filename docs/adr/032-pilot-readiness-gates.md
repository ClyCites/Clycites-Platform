# ADR 032: Authoritative pilot readiness gates

## Status

Accepted

## Decision

PostgreSQL stores named pilot readiness gates, their blocking status, risk level, owner, evidence,
and append-only transitions. The platform may report pilot readiness only when at least one gate
exists and no blocking gate is `NOT_STARTED`, `IN_PROGRESS`, or `BLOCKED`.

Legal, regulatory, provider, field-equipment, and training gates require human review. Automated
tests, seeded fixtures, or generated documents cannot approve those gates. A human-reviewed gate
cannot enter `READY` or `NOT_APPLICABLE` without recorded evidence and an identified reviewer.
Every mutation creates an audit event in the same transaction.

## Consequences

Readiness becomes an explicit operational decision rather than an inference from passing tests.
The system can display evidence and blockers but cannot make legal conclusions or certify people,
providers, or equipment.
