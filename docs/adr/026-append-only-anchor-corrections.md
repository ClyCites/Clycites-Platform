# ADR 026: Append-only anchor corrections

## Status

Accepted

## Decision

Order each organization/entity stream as a predecessor-hash chain. Corrections create replacement
events and anchors; after replacement confirmation, the old anchor is marked superseded but retained.

## Consequences

History stays inspectable and chain breaks are explicit integrity failures.
