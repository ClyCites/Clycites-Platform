# Workers And Outbox Audit

## Inventory

BullMQ workers cover platform events, Hedera submission/confirmation/reconciliation, payment submission, commercial expiration, notification delivery, and pilot farmer-import parsing. Startup against local Redis succeeded and emitted structured JSON. Four worker test files passed 11 tests.

| Flow                                            | Evidence                                                                                           | Result                                                                                                                     |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Domain transaction → outbox → queue → worker    | [domain-event.service.ts](../../apps/api/src/audit/domain-event.service.ts), worker dispatcher     | Transactional outbox exists; complete generic event coverage is not demonstrated                                           |
| Hedera anchor → submission → confirmation       | [hedera-workers.test.ts](../../apps/worker/src/hedera-workers.test.ts)                             | One logical mock anchor handed off, submitted, confirmed and verified; retry schedule, mismatch and unknown outcome tested |
| Payment instruction → provider → reconciliation | [payment-submission.worker.test.ts](../../apps/worker/src/payment-submission.worker.test.ts)       | Claim/version behavior and mock/manual statuses tested; dynamic API-to-reconciliation journey not run                      |
| SMS notification → provider → delivery          | [notification-delivery.worker.test.ts](../../apps/worker/src/notification-delivery.worker.test.ts) | Identifier-only mock job and duplicate-claim prevention tested; no real SMS delivery/status                                |
| Offline operation → API → idempotent result     | [phase-two.spec.ts](../../apps/api/test/phase-two.spec.ts)                                         | Stable partial result and replay tested; no queue is required for this synchronous path                                    |

## Reliability

Jobs generally carry record IDs and expected versions rather than PII. Claim operations use conditional updates; tests verify stale payment and notification claims do not resubmit. Hedera unknown outcomes are held for reconciliation instead of blind retry. Commercial expiration restores reservation quantity exactly once in its test.

Retry/backoff and scheduled-at fields exist for provider flows. A universal dead-letter queue was not found; review states are domain-specific. Stalled processing/outbox recovery exists in selected dispatchers but was not exercised under process termination. Queue concurrency is configured per worker; production capacity and Redis memory behavior were not load-tested.

## Sensitive Data

Hedera and notification jobs are identifier-oriented. Payment workers retrieve encrypted destination data at processing time rather than placing full identifiers in Redis. Farmer import jobs carry only an import ID, then fetch the CSV from object storage. This limits Redis exposure, but Redis is unauthenticated by default in local Compose and production configuration was not audited externally.

## Findings

- `VERIFIED_IMPLEMENTED`: mock Hedera submission/confirmation and worker claim idempotency.
- `PARTIALLY_IMPLEMENTED`: generic outbox coverage, payment reconciliation, expiration scheduling and import processing.
- `MOCK_ONLY`: SMS delivery and payment auto-submission.
- `IMPLEMENTED_NOT_VERIFIED`: real Hedera SDK/Mirror behavior and object-storage import worker.
- Pilot blockers: no complete API→outbox→all workers synthetic journey; no real stalled-job recovery drill; no provider timeout/load evidence.
