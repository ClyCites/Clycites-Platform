# Offline synchronization

Phase 2 implements an installable PWA with an organization-partitioned Dexie database. Snapshot,
context, and operation compound keys begin with `organizationId`. Access and refresh credentials are
never written to IndexedDB. Logout deletes the local database; organization switching locks the
previous context until it is selected and authenticated again.

An active device assigned to the signed-in user and an open collection session are required for
snapshot download and delivery mutation. The snapshot is limited to one collection point and
contains active memberships, opaque QR identities, farms, Coffee forms, effective quality
definitions, and tombstones for local removal. PostgreSQL remains authoritative.

Each local mutation receives a client operation UUID before submission. UI states are `LOCAL`,
`QUEUED`, `SYNCING`, `SYNCED`, `CONFLICT`, and `FAILED`. The API accepts at most 250 operations
per request within a 1 MB body, rate limits each device to `OFFLINE_SYNC_REQUESTS_PER_MINUTE`
(default 30) requests per minute and answers `429` with `Retry-After` beyond that. It
records each operation under unique `(deviceId, clientOperationId)`, hashes its canonical payload, and returns
per-operation outcomes. Identical retries replay the stored response. Reuse with another payload is
a conflict. One failed operation does not roll back successful neighbors.

Delivery state changes use `lockVersion`; immutable correction lineage uses `version` and
`supersedesDeliveryId`. Material conflicts are never last-write-wins. A user refreshes server state
and either retries a valid command or requests an auditable correction.

Device revocation suspends open sessions and blocks snapshots and synchronization immediately.
Operators must sign out and clear browser site data on a recovered or reassigned device. Server
audit and offline-operation history are retained independently of local cleanup.
