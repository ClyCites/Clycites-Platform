# ADR 033: Privacy requests, retention dry runs, and legal holds

## Status

Accepted

## Decision

Data-subject requests are organization-scoped workflow records for access, correction, deletion,
restriction, consent withdrawal, and export. Subject identity must be verified outside the public
request identifier before fulfillment.

Retention policies are versioned. The application exposes dry-run reports only; it has no
destructive retention endpoint. Dry runs report eligible categories, legal-hold blocks, and
immutable records that must remain. Audit history, financial evidence, traceability events, and
other append-only authority records are not deleted by this workflow.

## Consequences

Operators can assess retention impact without accidental deletion. Actual deletion or
anonymization requires a separately reviewed implementation, legal basis, backup safeguards, and
rollback plan. This decision is operational architecture, not legal advice.
