# Database Audit

## Inventory And Execution

- Prisma schema: [packages/database/prisma/schema.prisma](../../packages/database/prisma/schema.prisma)
- Models: **99**; enums: **122**; migrations: **10**.
- Migration order: foundation, Phase 1 identity, Phase 2 collection, Phase 3 traceability, Phase 4 Hedera, Phase 5 marketplace, Phase 6 finance, Phase 7 operations, Phase 8 pilots, Phase 8 evidence completion.
- A fresh isolated local database migrated from zero with `prisma migrate deploy`; `migrate status` reported current.
- The synthetic seed ran twice successfully. This proves repeat execution did not hit uniqueness conflicts; it does not prove every seeded child collection is cardinality-idempotent.
- No migration was edited. The final source diff contains only audit reports.

## Types And Constraints

Money is stored as PostgreSQL/Prisma `BigInt` minor units. Physical quantities use fixed-scale `Decimal(18,4)`; quality values commonly use `Decimal(18,6)`. No floating-point financial column was found. API serializers generally return money as strings, but this convention is endpoint-owned rather than globally enforced, leaving regression risk for new endpoints.

Strong constraints include scoped delivery numbers, device/client-operation idempotency, payment instruction idempotency, reconciliation external references, reservation/listing indexes, and restrictive foreign keys. Core history uses `onDelete: Restrict`; no broad destructive cascade was found. Selected actor/inviter links use `SetNull` to preserve history.

## Integrity Findings

| Area                   | Assessment                       | Evidence / implication                                                                                                                                                                                              |
| ---------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organization scope     | Strong but application-dependent | Most tenant records carry an organization or seller/buyer organization. Cross-entity consistency, such as an offer chain retaining the same parties, is enforced in services rather than composite foreign keys.    |
| Idempotency            | Partial                          | Delivery and offline sync use [IdempotencyRecord](../../packages/database/prisma/schema.prisma) and device/client-operation uniqueness. Not every state-changing endpoint exposes an idempotency key.               |
| Financial immutability | Strong for core approvals        | Phase 6 migration adds triggers protecting approved settlement totals, farmer settlements, and terminal payment attempts. Deduction-policy and verified-proceeds immutability remains primarily service-controlled. |
| Append-only history    | Mixed                            | Marketplace listing versions, order status, inventory ledger, settlement status and several anchor histories have trigger protection. Audit and outbox rows remain mutable to privileged database actors.           |
| Separation of duties   | Mixed                            | DB checks and services protect important settlement approvals; actor identity and workflow rules cannot all be expressed in Prisma.                                                                                 |
| Soft deletion          | Partial                          | User, organization, farmer, farm and collection point support `deletedAt`; transactional and audit records are retained. Every query must consistently apply soft-delete filters.                                   |
| Destructive deletion   | Low schema risk                  | Restrictive foreign keys prevent common cascades, but operational retention execution still needs policy-specific safeguards and restore testing.                                                                   |
| Schema drift           | Low at audit                     | Ten migrations reproduced the schema. Prisma generation fails without `DATABASE_URL`, an environment usability issue rather than drift.                                                                             |

## Index Review

The schema has extensive tenant/status/time indexes and uniqueness constraints for deliveries, batches, lots, offers, settlements, payments, pilots, outbox polling and anchor sequence numbers. Potential tuning candidates, to validate with production-like query plans rather than add speculatively, include reverse lineage by delivery, provider-wide reconciliation lookup, and large pilot-observation time series.

## Application-Only Invariants

- Quantity conservation, commodity/form compatibility, and state transitions.
- Buyer/seller and nested-resource ownership consistency.
- Refresh-token rotation and finance separation of duties.
- Public/private serialization and PII allowlists.
- Readiness evidence quality and human approval.
- Provider unknown-outcome handling and reconciliation.

## Growth And Recovery

Likely fast-growth tables are `AuditEvent`, `OutboxEvent`, `OfflineOperation`, delivery measurements, inventory ledger, traceability/anchor attempts, payment reconciliation, and pilot observations. Retention models and dry-run code exist, but no production retention execution was exercised.

[docs/operations/backup-restore-verification.md](../operations/backup-restore-verification.md) documents a procedure and the schema records verification evidence. This audit did not execute a dump/restore or PITR exercise. A controlled pilot therefore still requires a human-owned restore drill with checksum, RPO/RTO, object-storage recovery, and reconciliation of payment/Hedera unknown outcomes.
