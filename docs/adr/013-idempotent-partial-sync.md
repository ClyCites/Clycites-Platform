# ADR 013: Idempotent partial synchronization

## Status

Accepted

## Context

Connections may fail between submission and response, and one malformed operation must not block an
entire field queue.

## Decision

Bound batches at 250 operations (raised from 25 in [ADR 072](072-capture-layer-hardening.md),
which forced excessive round trips for a day's collection), with a 1 MB body cap enforced before
parsing and a per-device request rate limit. Uniquely identify operations by device and client UUID, store a
canonical payload hash and response, and return independent `PROCESSED`, `REJECTED`, or `CONFLICT`
outcomes. Identical retries replay; changed payloads conflict.

## Consequences

Retries are deterministic and partial progress is visible. Operation records add storage and require
retention policy management.

## Alternatives considered

Whole-batch transactions were rejected for poor rural recovery. Last-write-wins was rejected because
it erases conflicts. HTTP keys alone do not provide durable per-operation batch outcomes.
