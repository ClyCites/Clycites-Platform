# ADR 021: PostgreSQL authority for Hedera anchors

## Status

Accepted

## Decision

PostgreSQL remains authoritative for domain state, authorization, corrections, and claims. HCS is an
external timestamped integrity witness containing only minimal hashes and opaque references.

## Consequences

Ledger evidence can detect divergence but cannot reconstruct private records or prove physical truth.
