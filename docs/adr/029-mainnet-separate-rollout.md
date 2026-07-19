# ADR 029: Mainnet as a separate rollout

## Status

Accepted

## Decision

Phase 4 defaults to local mock mode. Testnet and previewnet actions require explicit configuration and
cost acknowledgement. Mainnet activation requires a separate reviewed rollout and explicit runtime
acknowledgement.

## Consequences

No test, seed, startup path, or ordinary deployment can accidentally perform a mainnet transaction.
