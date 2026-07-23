# ADR 070: Asynchronous report exports

**Decision:** Report generation is asynchronous. Requesting an export creates a `PENDING` record,
enqueues a BullMQ job keyed by the export id, and returns immediately. A dedicated worker claims the
row, builds the report, writes it to protected object storage, records a checksum and expiry, and marks
the export `COMPLETED` or `FAILED`. The job key is the export id so overlapping workers cannot generate
the same export twice.
