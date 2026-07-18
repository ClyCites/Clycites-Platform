# ADR 004: Transactional outbox

## Status

Accepted

## Context

Database changes and asynchronous jobs must not diverge during crashes or network failures.

## Decision

Write `OutboxEvent` rows in the same PostgreSQL transaction as future domain changes. A dispatcher
will claim and publish events to BullMQ with retries and idempotent consumers.

## Consequences

Business commits remain atomic and recoverable. Dispatch is eventually consistent and requires
claiming, retry, monitoring, retention, and duplicate-tolerant handlers.

## Alternatives considered

Direct queue publishing can lose or orphan events around transaction boundaries. Distributed
transactions are unsupported and operationally disproportionate.
