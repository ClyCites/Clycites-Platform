# Data flow

1. The web client validates input and sends a versioned REST request with a request ID and, for
   replay-sensitive operations, an idempotency key.
2. The API validates again, authorizes organization context, and writes business state plus an
   `OutboxEvent` in one PostgreSQL transaction.
3. An outbox dispatcher will claim pending events and enqueue deterministic BullMQ jobs.
4. Workers perform retryable side effects and record outcomes without changing the original event.
5. Media is stored in S3-compatible object storage; PostgreSQL stores ownership and integrity data.
6. Eligible events are reduced to a canonical payload hash before a Hedera provider is invoked.

Response envelopes return the request ID and timestamp. Logs carry the same ID and redact secrets.
