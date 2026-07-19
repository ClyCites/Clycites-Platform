# ADR 024: Asynchronous anchor outbox

## Status

Accepted

## Decision

Create the outbox event, immutable traceability event, canonical hash, chain link, and pending anchor
in the domain transaction. Perform Redis and Hedera work only after commit with stable job IDs,
conditional claims, retry schedules, and stale-claim recovery.

## Consequences

Domain writes do not depend on network availability, and duplicate queue delivery cannot create a
second logical anchor.
