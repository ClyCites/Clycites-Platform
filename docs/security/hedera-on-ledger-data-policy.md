# Hedera on-ledger data policy

## Allowed

- Message schema version and event type.
- Random event identifier.
- HMAC-SHA-256 organization and entity references with a version identifier.
- SHA-256 canonical payload hash and optional predecessor hash.
- Event occurrence time and optional keyed supersession reference.

## Forbidden

Names, telephone numbers, email addresses, farmer or member identifiers, database organization or
entity IDs, farm coordinates, delivery IDs, weights, prices, payment data, quality notes, custody
notes, complete records, access tokens, operator credentials, private keys, and reference secrets must
never be submitted.

The HMAC reference secret is Restricted data. It must be server-only, stored in managed secret
infrastructure, excluded from logs and browser bundles, and rotated by introducing a new version while
retaining old versions for historical verification. Hashes are integrity evidence, not anonymization;
timing and repeated-event metadata can still correlate activity.

Public APIs use a dedicated allowlisted serializer. Private canonical payloads and attempts remain
organization-scoped. Logs and metrics contain opaque IDs and stable error codes, never payloads or
credentials.
