# Hedera anchoring

Hedera Consensus Service will provide independently timestamped evidence for selected traceability
and settlement events. PostgreSQL remains the source of truth. A transactional outbox will deliver
eligible events to a worker, which canonicalizes the approved minimal payload, computes SHA-256, and
calls `HederaAnchorProvider`.

Local development uses a no-transaction mock provider. Future real providers must be idempotent,
capture topic sequence/timestamp receipts, and keep keys in a managed secret store.

Never place names, phone numbers, identity documents, precise farm locations, payment accounts,
credentials, or complete business records on Hedera. Messages contain only minimal event metadata,
opaque identifiers, hashes, and hash-chain references needed for verification.
