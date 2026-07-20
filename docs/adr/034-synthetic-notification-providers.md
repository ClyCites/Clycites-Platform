# ADR 034: Synthetic notification provider boundary

## Status

Accepted

## Decision

Notification deliveries are authoritative PostgreSQL records. BullMQ jobs contain only the
delivery UUID. Workers load templates and parameters from PostgreSQL and atomically claim a record
before submission.

Only `mock` and `console` providers are permitted. Provider references, status, attempts, and
failure codes are stored, while recipient contact data and rendered message bodies are excluded
from job payloads and audit metadata. Retries are bounded, exponential, and restricted to failed
deliveries.

## Consequences

SMS workflows can be tested without sending real messages or exposing phone numbers in queue
infrastructure. Activating a real provider requires a separate ADR, contract review, credential
custody, consent and opt-out behavior, delivery-cost controls, and production approval.
