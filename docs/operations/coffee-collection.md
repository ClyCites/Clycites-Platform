# Coffee collection operations

1. Sign in as the collection agent and select the cooperative.
2. Open **Collection**, choose an active assigned device and collection point, and open a session.
3. Download the snapshot while online. Confirm the farmer count before leaving coverage.
4. Scan or enter the opaque QR identity, farmer number, or name. Record Coffee form, weight, price,
   configured quality checks, and farmer confirmation.
5. A saved delivery enters the local queue. `SYNCED` is complete; `CONFLICT` requires refreshed
   server state; `FAILED` shows the stable reason and may be retried after correction.
6. Print the active receipt after synchronization. A receipt states that it is not proof of final
   payment. Reprints are counted and audited.
7. Request corrections from the delivery detail. A different user with correction-review permission
   must approve or reject. Approval creates a new delivery and receipt version; the original remains.

For a lost device, revoke it under device administration, confirm its open sessions are suspended,
rotate the user's session if compromise is suspected, and remotely clear the managed browser where
available. Never restore an old IndexedDB profile to another organization or user.

Common recovery:

- `DEVICE_REVOKED`: stop collection and register another device.
- `COLLECTION_SESSION_CLOSED`: open a new session and retry queued valid operations.
- `DELIVERY_VERSION_CONFLICT`: refresh the delivery; do not overwrite it locally.
- `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD`: create a new operation UUID only for a genuinely
  new command. Never mutate a queued operation after assigning its UUID.
