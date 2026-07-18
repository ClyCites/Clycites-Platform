# ADR 005: Hedera Consensus Service

## Status

Accepted

## Context

Selected traceability and settlement events need externally timestamped, independently verifiable evidence.

## Decision

Anchor canonical SHA-256 payload hashes and minimal metadata through a provider boundary targeting
Hedera Consensus Service. Use a mock provider until a separately reviewed real integration is added.

## Consequences

Verification can detect record changes without exposing complete records. Anchoring is asynchronous,
cost-bearing, and requires key custody, retry, and privacy review. Hedera is not authoritative storage.

## Alternatives considered

Storing full records on-chain violates privacy and correction needs. Smart contracts and tokens add
no value to this evidence requirement. Database-only timestamps lack independent consensus evidence.
