# ADR 020: Offline batch boundary

## Status

Accepted

## Decision

Allow offline creation of open batch drafts and contribution commands through the existing durable per-device operation protocol. Require online execution for all later lifecycle actions.

## Consequences

Rural operators can stage early aggregation work while global allocation conflicts remain visible at sync. Transformations, lots, quality, custody, and publication always use current server state.
