# Hedera foundation

This package defines deterministic event hashing and the provider boundary for future Hedera
Consensus Service integration. Local development uses `MockHederaAnchorProvider`; it submits no
transactions and requires no Hedera credentials.

Personally identifiable information, credentials, payment account details, and complete business
records must never be included in Hedera messages. Only minimal event identifiers, timestamps, and
cryptographic hashes belong in an anchor event.
