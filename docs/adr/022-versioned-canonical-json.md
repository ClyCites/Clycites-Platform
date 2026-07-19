# ADR 022: Versioned canonical JSON

## Status

Accepted

## Decision

Hash payloads with the strict canonical JSON rules in `packages/hedera`. Any rule or payload-shape
change requires a new schema version; old versions remain reproducible.

## Consequences

Equivalent supported values hash identically across workers, while unsupported or ambiguous values
fail before submission.
