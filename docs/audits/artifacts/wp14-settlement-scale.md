# WP14 settlement scale measurements

Harness: `apps/api/src/settlements/settlement-scale-measurements.ts`.
Database: `clycites_wp14_scale` (a disposable copy of the migrated and seeded schema).
Statement counting method: Prisma query events, enabled with `PRISMA_QUERY_LOG=1`, which
records every statement the client issues including the implicit `COMMIT`.

Reproduce with:

```
export DATABASE_URL=".../clycites_wp14_scale"
pnpm --filter @clycites/api exec tsx src/settlements/settlement-scale-measurements.ts
```

`FARMERS` overrides the farmer counts (default `50,200,800`).

## Fixture

For each farmer count N the harness builds one complete commercial path:

- N farmers, each with one accepted cherry delivery of 50.0000 KG
- one aggregation batch holding all N deliveries, sealed
- one `TRANSFORMATION` from cherry to parchment at a 0.2 yield ratio
- one cooperative lot drawn entirely from the parchment output batch
- one listing, offer, sales contract and completed sales order over that lot
- one verified sale proceeds record, and a settlement run over it

The measured call is `SettlementsService.calculate`. Every farmer therefore reaches the
settlement through a two-hop lineage (delivery to batch, batch to transformation output),
which is the shape the previous work package showed was under-tested.

## Before

| N | statements | wall clock |
| --- | --- | --- |
| 50 | 222 | 159 ms |
| 200 | 822 | 399 ms |
| 800 | 3222 | 1653 ms |

The count is exactly `4N + 22`. Four statements were issued per farmer:

| count at N=800 | total ms | statement |
| --- | --- | --- |
| 800 | 322.3 | `INSERT INTO "FarmerSettlement" ...` |
| 800 | 309.0 | `UPDATE "FarmerSettlement" SET "deductionsTotalMinor" = ?, "carriedForwardMinor" = ?, "netEntitlementMinor" = ? ...` |
| 800 | 297.2 | `INSERT INTO "SettlementDeduction" ...` |
| 800 | 275.5 | `SELECT ... FROM "FarmerAdvance" WHERE "organizationId" = ? AND "farmerId" = ? AND "status" = 'OUTSTANDING' ...` |

The per-farmer advance lookup planned well individually — at N=800 it was an
`Incremental Sort` over an index with an actual time of 0.014 ms and zero rows — but it was
executed 800 times inside a serializable transaction. The cost was the round trips, not the
plan. This is the reason a plan-only investigation would have found nothing.

## Change

`SettlementsService.calculate` now:

- loads every outstanding `FarmerAdvance` for the whole run in one query keyed by
  `farmerId: { in: [...] }`, and groups them in memory
- generates the `FarmerSettlement` id application-side, computes deductions, advance
  recovery and carry-forward first, and writes each row once with its final values
  instead of inserting a provisional row and updating it
- accumulates `FarmerSettlement`, `SettlementDeduction`, `SettlementException` and
  `FarmerAdvanceRecovery` rows into arrays and writes each set with a single `createMany`

`recoverAdvances` was replaced by the pure `planAdvanceRecovery`, which takes the advances
already loaded and returns the rows to write. No caching was introduced; every statement
still reads the current transaction's own snapshot. No monetary arithmetic changed, and
`allocation-engine.ts` was not touched by this change.

The only remaining per-row write is the `FarmerAdvance` balance update, which is bounded by
the number of outstanding advances rather than by the farmer count.

## After

| N | statements | wall clock |
| --- | --- | --- |
| 50 | 25 | 69 ms |
| 200 | 25 | 105 ms |
| 800 | 25 | 375 ms |

The statement count is now constant in N. At N=800 the work is three bulk inserts and a
commit:

| count at N=800 | total ms | statement |
| --- | --- | --- |
| 1 | 59.7 | `INSERT INTO "SettlementAllocation" ...` |
| 1 | 50.0 | `INSERT INTO "FarmerSettlement" ...` |
| 1 | 23.1 | `INSERT INTO "SettlementDeduction" ...` |
| 1 | 14.8 | `COMMIT` |
| 1 | 6.2 | `UPDATE "SettlementRun" ...` |

Statements at N=800 fell from 3222 to 25, a factor of 129. Wall clock fell from 1653 ms to
375 ms, a factor of 4.4. The two factors differ because the remaining time is dominated by
the row volume itself — 800 settlement rows and their allocations still have to be written
and committed — not by round trips.

Behaviour is unchanged: the full end-to-end suite passes 18 files and 116 tests on a freshly
reset and seeded database, including `commerce-composed-path.spec.ts`, which asserts the
exact per-farmer amounts.

## What did not improve

Wall clock is still linear in N. Nothing here makes a settlement run over 800 farmers free;
it makes it cost a constant number of round trips instead of thousands. A cooperative an
order of magnitude larger would still hold a serializable transaction open for several
seconds, and that transaction takes `FOR UPDATE` locks on the proceeds records. That is a
known limit, not a solved problem.

The lineage reads were already correctly indexed and were not the bottleneck at any N
measured. They were left alone.

## Unbounded list endpoints

Separately audited: the following `findMany` calls serve list endpoints and impose no
`take` limit, so a caller can force an unbounded result set. None were changed here; they
are recorded so the exposure is known.

- `apps/api/src/marketplace/marketplace.service.ts:45` — `listListings`
- `apps/api/src/marketplace/marketplace.service.ts:378` — `listOffers`
- `apps/api/src/marketplace/commerce.service.ts:39` — `listContracts`
- `apps/api/src/settlements/settlements.service.ts:50` — `listSaleProceeds`
- `apps/api/src/settlements/settlements.service.ts:59` — `listExchangeRates`
- `apps/api/src/settlements/settlements.service.ts:106` — `listFarmerAdvances`
- `apps/api/src/settlements/settlements.service.ts:342` — `listSettlementRuns`
- `apps/api/src/settlements/settlements.service.ts:351` — `listDeductionPolicies`
- `apps/api/src/settlements/settlements.service.ts:1035` — `listFarmerPaymentMethods`
- `apps/api/src/settlements/settlements.service.ts:1119` — `listPaymentInstructions`
- `apps/api/src/settlements/settlements.service.ts:1371` — `listReconciliations`

All are organization-scoped and permission-guarded, so the exposure is a cost to the
cooperative's own authenticated staff rather than to an anonymous caller. It is still a
denial-of-service surface once a cooperative reaches production volumes.
