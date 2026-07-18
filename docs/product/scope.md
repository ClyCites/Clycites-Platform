# Product scope

The initial product direction covers cooperative registration of farmers and farms, offline coffee
delivery and quality capture, traceable lot creation, buyer sales, transparent farmer settlement,
payment reconciliation, and selected Hedera event anchoring.

Phase 2 adds Coffee configuration, organization quality overrides, registered devices, collection
sessions and snapshots, online/offline delivery capture, fixed-point pricing, farmer confirmation,
human-readable receipts, idempotent partial-batch synchronization, and supervisor-reviewed immutable
corrections. Platform administrators can manage global Coffee configuration but do not implicitly
receive cooperative delivery mutation permissions.

Phase 2 excludes aggregation batches, lots, settlements, payments, marketplace workflows, mobile
money, native Android, Bluetooth scale integration, real SMS OTP, cryptocurrency, tokens, smart
contracts, and real Hedera transactions.

Success means a collection agent can download a limited snapshot, record and confirm a coffee
delivery without a network, synchronize it exactly once, issue a non-payment receipt, and retain an
auditable original when a different authorized person approves a correction.

Phase 3 adds server-authoritative delivery availability, farmer contributions, aggregation batches,
split/merge/transformation lineage, cooperative lots, lot quality inspection, organization custody
transfers, authorized lineage reads, and privacy-safe public QR publication. Every quantity remains
a decimal string at the API boundary and a fixed-scale value in PostgreSQL.

Phase 3 excludes sales, marketplace discovery, settlements, payments, mobile money, native Android,
Bluetooth scales, and external Hedera submission. A published QR record is a cooperative
traceability claim, not a payment, certification, ownership, or Hedera verification claim.
