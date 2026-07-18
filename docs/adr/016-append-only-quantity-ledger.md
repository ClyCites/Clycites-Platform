# ADR 016: Append-only quantity ledger

## Status

Accepted

## Decision

Represent allocations as positive append-only ledger entries. Derive availability from authoritative source quantity minus source debits. Lock concrete source rows and use serializable transactions for allocation-critical commands.

## Consequences

Over-allocation is rejected under concurrency and history remains explainable. Corrections require new compensating domain workflows rather than ledger updates or deletes.
