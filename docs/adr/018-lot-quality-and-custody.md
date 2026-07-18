# ADR 018: Lot quality and custody lifecycle

## Status

Accepted

## Decision

Lots are formed from sealed batch availability. Approval requires a passed inspection. Custody uses separate initiation, dispatch, and recipient receipt/rejection actions scoped to participating organizations.

## Consequences

Quality and possession claims have explicit actors and timestamps. A draft or uninspected lot cannot enter the custody workflow.
