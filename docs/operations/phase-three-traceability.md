# Phase 3 traceability operations

Run migrations before deploying API/web code, then seed only disposable environments:

```bash
pnpm db:generate
pnpm --filter @clycites/database exec prisma migrate deploy
pnpm db:seed
```

Allocation conflicts return `INSUFFICIENT_AVAILABLE_QUANTITY`; refresh delivery/batch availability and retry with a new operation. Never edit ledger rows to resolve a discrepancy. Investigate source facts, contribution/transformation/lot references, audit events, and request IDs. Corrections to an allocated accepted delivery require operational reconciliation before replacement quantities are used in a new batch.

Useful reconciliation queries:

```sql
SELECT "sourceType", "sourceId", SUM(quantity)
FROM "InventoryLedgerEntry"
WHERE "organizationId" = '<organization-uuid>'
GROUP BY "sourceType", "sourceId";

SELECT "eventType", status, "attemptCount", "lastError"
FROM "OutboxEvent"
WHERE "aggregateId" = '<lot-or-batch-uuid>'
ORDER BY "createdAt";
```

To revoke a public claim, use an authorized application workflow when available; until then, an operator must use a reviewed database change that sets publication status to `REVOKED`, preserves `publishedAt`, sets `revokedAt`, and creates matching audit evidence. Public endpoints return 404 for private, revoked, missing, or non-approved lots.

Offline support is limited to open batch drafts and contribution commands. Sealing, transformations, lot formation, inspection, approval, custody, and publication require a live connection. Device revocation and organization partition cleanup follow the Phase 2 runbook.
