# Phase 3 traceability

The authoritative flow is accepted delivery -> contribution -> batch -> optional split, merge, or transformation -> cooperative lot -> quality inspection -> custody transfer -> authorized or public traceability.

`InventoryLedgerEntry` is append-only. A delivery or batch total is never reduced in place; availability is its authoritative quantity minus ledger entries where it is the source. Services lock concrete Delivery or ProduceBatch rows before calculating availability. Multi-input operations lock UUIDs in sorted order and use serializable transactions. Domain rows, ledger entries, audit events, and outbox events commit together.

Transformation outputs may not exceed inputs. Lower output represents measured process loss. A change of commodity form is allowed only for `TRANSFORMATION`; split and merge preserve form. Lot approval requires the latest inspection to pass. Custody records have explicit initiator dispatch and recipient receipt/rejection transitions.

Authorized lineage is organization-scoped and can include farmer and source facts. Public traceability reads only a `PUBLISHED` snapshot through a dedicated Zod-validated contract. Outbox events remain local evidence for a future dispatcher; Phase 3 does not submit to or claim verification by Hedera.
