# Phase 6 settlement operations

## Local configuration

Set `PAYMENT_ENCRYPTION_KEY_BASE64` to a base64-encoded 32-byte key. The documented local key is
rejected in production. Keep the key outside source control and rotate it only with a migration
plan for existing encrypted payment destinations.

Run PostgreSQL, Redis, the API, worker, and web applications. Seeded local finance data is available
for organization `00000000-0000-4000-8000-000000000201` using the documented finance officer
account.

## Operational flow

1. Record external sale proceeds against a completed buyer-accepted order.
2. A different user verifies the proceeds.
3. Create and calculate a settlement run. Resolve or waive blocking exceptions.
4. Submit the run and have a different user approve it.
5. Issue farmer statements and verify masked payment destinations.
6. Create, request approval for, and separately approve payment instructions.
7. Submit instructions. BullMQ creates manual/mock attempts; `SUBMITTED` is not paid.
8. Record evidence metadata and have a different reviewer confirm an exact amount/currency match.

## Recovery

Payment submission uses the stable job ID `payment-submit-<instruction-id>` with five bounded
exponential-backoff attempts. The worker atomically claims `QUEUED`, creates the attempt, and writes
`SUBMITTED`; database failure rolls the claim back for retry. A queued instruction can be submitted
again to recreate a missing Redis job without creating another financial instruction.

Do not mark records paid directly in PostgreSQL. Investigate `REQUIRES_REVIEW`, retain evidence,
and use reconciliation review so audit, outbox, and privacy-safe anchoring remain complete.
