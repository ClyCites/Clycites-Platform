# ADR 035: Offline snapshot expiry and privacy-safe diagnostics

## Status

Accepted

## Decision

IndexedDB remains partitioned by organization. Downloaded reference snapshots expire after 24
hours and a forward-only Dexie migration indexes expiry. Expiry cleanup removes snapshots only; it
never removes queued operations, drafts, or delivery availability records.

Organization switching locks the previous context. Logout deletes local collection data after the
server session is revoked. Diagnostics expose timestamps, lock state, record counts, and operation
states only. They do not export farmer, farm, QR, delivery, payment, or operation payloads.

## Consequences

Field support can diagnose stale snapshots and queue backlogs without collecting sensitive local
content. A stolen unlocked browser profile and a compromised operating system remain residual
risks requiring managed-device controls and encryption at rest.
