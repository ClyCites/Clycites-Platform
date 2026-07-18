# ADR 005: Hedera Consensus Service

## Status

Accepted

## Context

Selected traceability events need externally timestamped, independently verifiable evidence without
making a public ledger authoritative or exposing private business records.

## Decision

Atomically persist canonical payloads, SHA-256 hashes, hash-chain links, and pending anchors with the
business transaction. Asynchronous idempotent workers submit only hashes and keyed privacy references
through a framework-independent provider boundary. Treat SDK submission as provisional and require
Mirror Node message comparison before confirmation. Preserve corrections through supersession.

Local and CI environments use a realistic mock provider. Real SDK submission is opt-in, fee-capped,
and network-configured. Mainnet requires a separately reviewed rollout and explicit acknowledgement.

## Consequences

Verification can detect changes and establish consensus ordering without exposing complete records.
Anchoring is asynchronous and cost-bearing; unknown outcomes require reconciliation rather than blind
retry. Key custody, secret rotation, fee monitoring, Mirror availability, schema compatibility, and
database backups remain operational responsibilities. Hedera does not prove physical facts.

## Alternatives considered

Storing full records on-chain violates privacy and correction needs. Smart contracts and tokens add
no value to this evidence requirement. Database-only timestamps lack independent consensus evidence.
