# ADR 019: Dedicated public traceability contract

## Status

Accepted

## Decision

Publish an explicit allowlisted claim snapshot and validate every public response against a dedicated contract. Do not reuse authorized lineage serializers.

## Consequences

Public QR records cannot accidentally inherit farmer, delivery, farm, user, or note fields. Published claims are cooperative assertions and do not imply payment, certification, ownership, or Hedera verification.
