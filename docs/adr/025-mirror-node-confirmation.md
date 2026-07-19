# ADR 025: Mirror Node confirmation

## Status

Accepted

## Decision

An SDK response means submitted, not confirmed. Confirm only after Mirror evidence matches provider,
network, topic, transaction, sequence-bearing message, schema, event, references, hashes, occurrence
time, and supersession reference.

## Consequences

Mirror delay is normal and retryable. Timeouts and unknown submission outcomes require reconciliation,
not blind resubmission.
