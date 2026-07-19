# Phase 4: Hedera integrity evidence

Phase 4 gives authorized users and public lot viewers independently timestamped evidence that
selected ClyCites traceability facts have not changed. PostgreSQL remains authoritative for business
state, authorization, corrections, and claims. Hedera Consensus Service stores only deterministic
hashes and keyed opaque references; it does not prove that a physical observation was true.

Eligible events cover accepted deliveries and receipts, batch creation and contribution changes,
seals, splits, merges, transformations, lot creation and approval, custody changes, publication, and
append-only corrections or supersession. Eligibility is centralized and versioned. Ineligible domain
events continue through the normal outbox without creating an anchor.

Cooperative users can inspect status, evidence, attempts, hash-chain continuity, and lineage summaries
within their organization. Platform operators can inspect credential-safe health and failures and run
bounded reconciliation. Public lot verification exposes approved claims and a deliberately reduced
ledger summary without farmer identity, delivery identifiers, exact private lineage, notes, users, or
credentials.

Phase 4 excludes marketplace, offers, contracts, orders, payments, farmer settlement, mobile money,
HTS, stablecoins, smart contracts, Guardian, carbon workflows, and mainnet rollout.
