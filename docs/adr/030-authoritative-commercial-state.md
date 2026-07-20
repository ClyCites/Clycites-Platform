# ADR 030: Authoritative commercial state and quantity reservations

## Status

Accepted

## Decision

PostgreSQL is authoritative for marketplace listings, offers, lot reservations, sales contracts,
orders, buyer inspections, buyer acceptance, and traceability shares. Commercial mutations write
their audit and outbox records in the same transaction. Hedera receives only privacy-safe evidence
for selected immutable milestones and never controls a commercial transition.

Approved lot quantity may be advertised across multiple listings only up to the lot quantity.
Accepting an offer locks the offer, listing, and lot in a serializable transaction, reduces listing
availability, and creates one reservation and one pending contract. Releasing, cancelling, or
expiring a commitment restores the reserved quantity exactly once. Version checks reject stale
actions, and bounded retries handle PostgreSQL serialization and deadlock failures.

Contracts require seller approval followed by buyer approval. Orders consume contracted
reservations and may be cancelled only before dispatch. Custody receipt is required before buyer
inspection or acceptance. Full, partial, and rejected acceptance quantities must sum exactly to the
ordered quantity.

## Consequences

The commercial history remains explainable and quantity-conserving under concurrency. Expiration is
safe to rerun and emits one audit/outbox record per released reservation. Marketplace records do not
represent payment, escrow, settlement, title tokens, lending, or insurance; those concerns require a
separate phase and architecture decision.
