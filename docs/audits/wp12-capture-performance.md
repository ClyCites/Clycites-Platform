# WP12 capture performance report

All measurements were taken against PostgreSQL 17 on the disposable
`clycites_wp1_history` database, loaded by the explicit volume fixture. The populated
`clycites` database was never touched.

## Fixture

The fixture is **opt-in** and never runs as part of `db:seed`:

```bash
pnpm --filter @clycites/database db:volume-fixture          # tag A
VOLUME_TAG=B pnpm --filter @clycites/database db:volume-fixture
pnpm --filter @clycites/database db:volume-fixture:clean    # remove a tag
```

Each run produces, on top of the standard seed:

| Dimension | Value |
| --- | --- |
| Cooperatives | 1 |
| Farmers | 800 |
| Collection points | 4 |
| Business days | 90 |
| Deliveries | 54,000 (asserted within the required 40,000–70,000) |

The script fails loudly if the configured volume falls outside 40,000–70,000. Two disjoint
tagged runs were used to exceed 100,000 rows for plan measurement:
**108,015 `Delivery` rows**.

Plans are reproduced with:

```bash
pnpm --filter @clycites/database exec tsx prisma/capture-plan-measurements.ts
```

## Query 1 — delivery list page, deep into the result set

The hottest read path. Measured at page 1001 (offset 50,000), 50 rows per page.

| Variant | Shared buffers | Execution time |
| --- | --- | --- |
| Offset pagination, no composite index | 6,843 (+ 6,998 temp) | 61.9 ms |
| `OR`-form cursor, composite index | 51,289 | 11.6 ms |
| **Row-value cursor, composite index** | **53** | **0.02 ms** |

The offset variant sorted 108k rows on disk (`external merge Disk: 13848kB`) for every
page request.

The critical finding is the middle row. The `OR` form that Prisma's query builder produces
is logically correct but **not sargable**: Postgres used the index only for
`organizationId` and then discarded 50,001 entries via a filter
(`Rows Removed by Filter: 50001`). Rewriting the predicate as a row-value comparison turned
it into a genuine index bound:

```
Index Cond: (("organizationId" = ...) AND (ROW("serverReceivedAt", id) < ROW(..., ...)))
```

This is a ~970x reduction in buffers read. Because Prisma cannot express row-value
comparison, the page of ids is fetched with a parameterised raw query and hydrated in one
follow-up query.

Supporting index (`20260810150000_delivery_keyset_index`):

```sql
CREATE INDEX "Delivery_organizationId_serverReceivedAt_id_idx"
ON "Delivery"("organizationId", "serverReceivedAt", "id");
```

## Query 2 — filtered count over status and date range

Already served by `Delivery_organizationId_status_serverReceivedAt_idx` as an index-only
scan: **5.9 ms** for 35,710 matching rows. No change required. `Heap Fetches: 17860`
indicates the benefit is sensitive to autovacuum keeping the visibility map current; this
is an operational note, not a code defect.

## Query 3 — snapshot membership delta

Sequential scan with a top-N sort, **0.53 ms** over 1,603 memberships. Correct at present
volume but the scan is unbounded in membership count. It is recorded here as a known
future cost rather than optimised speculatively, since the plan is currently trivial.

## Query-count audit for the delivery list

Query counts were observed directly from Prisma query events (enabled only by
`PRISMA_QUERY_LOG=1`, never by default) rather than inferred.

| Page size | Statements executed |
| --- | --- |
| 1 | 13 |
| 25 | 13 |

The count is **constant** as page size grows. Replacing the batched hydration with a
per-item lookup raised the larger page to 61 statements, confirming the audit detects an
N+1 rather than merely asserting a number. The list include was narrowed to the fields
the list actually serialises. **No caching was introduced**; caching would have concealed a
per-item access pattern rather than eliminating it.
