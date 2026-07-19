# ADR 027: Hedera provider boundary

## Status

Accepted

## Decision

Keep provider interfaces in framework-independent `packages/hedera`. Local and CI use a deterministic
mock ledger; SDK access is opt-in, fee-capped, and limited to configured Hedera networks.

## Consequences

Tests require no credentials or network and production integration cannot bypass durable worker
policy.
