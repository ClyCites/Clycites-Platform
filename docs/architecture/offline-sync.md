# Offline sync strategy

Offline behavior is planned, not implemented in this foundation release.

Collection devices will retain operational data in IndexedDB. Each operation receives a
client-generated UUID and idempotency key before network submission. The local operation log is
append-only so retries do not overwrite evidence or create duplicate server records.

Operations progress through `LOCAL`, `QUEUED`, `SYNCING`, `SYNCED`, `CONFLICT`, and `FAILED` states.
The API will compare versions and business invariants. Safe duplicate submissions return the stored
idempotent result; non-overlapping updates may merge; material conflicts require an explicit user
decision and produce an auditable correction rather than silent last-write-wins behavior.

Devices will be registered to an organization and user, with revocable device credentials and a
server-observed sync cursor. Loss or reassignment must invalidate access without deleting local audit
history. Media metadata and hashes sync before binary content; large photos upload later when a
stable connection is available. The UI must show delayed media separately from record sync.
