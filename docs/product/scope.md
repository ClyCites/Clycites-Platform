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
