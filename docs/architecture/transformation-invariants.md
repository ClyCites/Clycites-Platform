# Transformation invariants

Each invariant below is enforced in code and covered by a test that was demonstrated
failing before the enforcing change existed. The pre-fix evidence for invariant 1 is
preserved verbatim in
[wp13-attribution-loss-before.txt](../audits/artifacts/wp13-attribution-loss-before.txt).

See [ADR 073](../adr/073-transformation-attribution.md) for the reasoning behind
materialising attribution rather than traversing the transformation graph on read.

## 1. Attribution survives a transformation

A lot assembled from a transformation output names the deliveries and farmers that fed
the input batches.

- Enforced by: `TransformationsService.create` writing `DERIVED`
  `FarmerBatchContribution` rows for every output batch.
- Test: `apps/api/test/transformation-attribution.spec.ts`, "Transformation invariant 1".
- Demonstrated failing: yes. Before the change the lineage response contained an empty
  delivery list; the captured output is linked above.

## 2. Derived attribution conserves the output quantity

The derived contributions on an output batch sum to exactly that batch's quantity, with
no drift and no residual row.

- Enforced by: `allocateAttribution` using the largest-remainder method over integer
  fixed-point units.
- Tests: `apps/api/test/transformation-attribution.spec.ts`, "Transformation invariant
  2" end to end; `apps/api/src/batches/attribution.spec.ts` for the algebra.
- Demonstrated failing: yes. `attribution.spec.ts` asserts that plain truncation of the
  same input sums to strictly less than the output quantity, so the conservation
  assertion cannot pass vacuously.

## 3. A delivery spanning several inputs is attributed once

When a merge draws on two batches that both contain the same delivery, the output
carries one contribution for that delivery, holding the combined share.

- Enforced by: `mergeAttributionWeights` accumulating numerators per `deliveryId` on a
  common denominator.
- Test: `apps/api/src/batches/attribution.spec.ts`, "Transformation invariant 3".
- Note: the unique constraint `FarmerBatchContribution(batchId, deliveryId)` makes the
  alternative a write failure rather than a silent duplicate, so this invariant is
  enforced twice over.

## 4. Attribution is proportional to the quantity actually drawn

Consuming a quarter of an input batch carries a quarter of that batch's attribution, not
all of it.

- Enforced by: scaling each input's weights by `requestedUnits` before merging.
- Test: `apps/api/src/batches/attribution.spec.ts`, "scales attribution by the quantity
  actually drawn from each input batch".

## 5. Reversed contributions do not travel downstream

A contribution that has been reversed is excluded from the attribution captured by a
later transformation.

- Enforced by: the `reversedAt: null` filter applied when reading input contributions in
  `TransformationsService.create` and in the backfill.
- Also enforced on read: `batchInclude` in `BatchesService` now excludes reversed
  contributions, which it previously returned.
- Now exercised: supersession (invariant 13) reverses derived contributions, so this
  filter is covered end to end rather than enforced in theory.

## 6. Derived rows carry no quantity

A `DERIVED` contribution writes no `InventoryLedgerEntry` and does not increment
`ProduceBatch.initialQuantity`; the output batch already holds its full quantity from
the transformation. `DIRECT` and `DERIVED` rows must therefore never be summed together.

- Enforced by: the database constraint
  `FarmerBatchContribution_origin_transformation_check`, which requires a `DERIVED` row
  to name its transformation and forbids a `DIRECT` row from doing so.
- Verified: attempting to insert a `DERIVED` row without a `transformationId` is
  rejected by PostgreSQL.

## 7. Settlement arithmetic is unchanged by materialisation

Settlement continues to derive transformed lineage recursively in exact rational
arithmetic and reads `DIRECT` contributions only.

- Enforced by: the `origin: 'DIRECT'` filter in `SettlementsService`.
- Why it matters: `resolveBatch` in `allocation-engine.ts` rejects a batch that presents
  both direct and transformed lineage. Without this filter, materialised attribution
  would have made every settlement calculation fail.
- Test: `apps/api/test/phase-five.spec.ts` continues to pass unchanged.

## 8. Backfill is idempotent and order-aware

Re-running the backfill writes nothing further, and a transformation consuming a batch
that an earlier transformation produced still receives attribution.

- Enforced by: skipping output batches that already carry rows for their transformation,
  and processing transformations in `completedAt` order.
- Verified: a second `--apply` run reported 5 outputs skipped and 0 rows written.
- Caveat: a dry run under-reports chained transformations, because it cannot observe the
  attribution an earlier transformation in the same pass would have written.

## 9. A form change is checked against a published conversion range

A transformation between two commodity forms records its realised yield ratio and is
compared against the expected range for that form pair.

- Enforced by: `assessYield` in `apps/api/src/batches/transformation-yield.ts`, using
  `CommodityFormConversion` rows resolved organization-first, platform-default second.
- Tests: `apps/api/src/batches/transformation-yield.spec.ts` for the arithmetic and range
  boundaries; `apps/api/test/transformation-hardening.spec.ts`, "Transformation
  invariant 9".
- The ranges shipped in the seed are `LITERATURE_ESTIMATE`. They are published figures,
  not measurements from these cooperatives, and `ConversionSource` records that
  distinction so a stronger source can replace them without rewriting history.

## 10. An implausible yield is flagged, not rejected

A yield outside the expected range sets `yieldFlagged` with a reason and emits a
`BATCH_TRANSFORMATION_YIELD_FLAGGED` audit entry. The transformation still completes.

- Why flag rather than reject: the range is an estimate. Rejecting on an estimate would
  block legitimate work and teach operators to game the numbers. A flag routes the
  transformation to review while keeping the recorded quantities truthful.
- A form change with no published range is flagged `YIELD_UNVERIFIABLE` rather than
  silently passing. A split or merge changes no form and is not flagged; mass
  conservation already covers it.
- Test: `apps/api/test/transformation-hardening.spec.ts`, "Transformation invariant 10".

## 11. Unexplained mass loss is rejected

Mass that enters a transformation and does not leave it must be named. Loss above a
tenth of a percent of the input requires a `lossReason`, and `OTHER` requires a note.

- Why reject rather than flag, unlike yield: the loss is arithmetic from the operator's
  own numbers, not an estimate. There is no uncertainty to be generous about.
- Enforced by: `lossRequiresReason` plus the contract `superRefine`, and the database
  constraint `BatchTransformation_loss_note_check`.
- Tests: `apps/api/test/transformation-hardening.spec.ts`, "Transformation invariant 11"
  and "Transformation invariant 12".
- Breaking change: transformations that previously succeeded with unexplained loss now
  return 422 `TRANSFORMATION_LOSS_REASON_REQUIRED`.

## 12. Transformation weights carry the same provenance as delivery weights

Every transformation input and output records its capture method, the instrument
claimed, whether that instrument is registered, active and in calibration, and who
recorded it.

- Enforced by: reusing `assessWeighingInstrument` from the delivery capture path, so
  transformation and delivery weights are judged by one rule rather than two.
- Default is flagged: a quantity with no instrument recorded is
  `INSTRUMENT_NOT_RECORDED`, not silently trusted.
- Test: `apps/api/test/transformation-hardening.spec.ts`, "Transformation invariant 13".
- Partial coverage: there is no endpoint for registering a weighing instrument, so the
  end-to-end test exercises the unregistered and not-recorded paths only. The calibration
  and inactive paths are covered by the delivery capture tests that share the function.

## 13. A completed transformation is superseded, never edited

Correcting a transformation appends a reversal and a new version. Nothing is updated or
deleted.

- Enforced by: `TransformationsService.supersede`, which appends
  `TRANSFORMATION_INPUT_REVERSAL` and `TRANSFORMATION_OUTPUT_REVERSAL` ledger entries,
  cancels the output batches, reverses their derived contributions, restores consumed
  inputs to `SEALED`, and creates a replacement carrying `version + 1` and
  `supersedesTransformationId`.
- Why mirrored entries rather than negative ones: `InventoryLedgerEntry` has a
  `quantity > 0` check and a trigger forbidding update and delete. Reversal had to be
  expressible as an append.
- `BatchesService.allocatedQuantity` subtracts `TRANSFORMATION_INPUT_REVERSAL`, which is
  what actually returns availability to the input batch.
- The original row keeps its `COMPLETED` status and `completedAt`. It did happen. It is
  marked `supersededAt` rather than rewritten.
- Tests: `apps/api/test/transformation-hardening.spec.ts`, "Transformation invariant 14",
  "15" and "16".

## 14. A transformation whose output has moved on cannot be superseded

If any output batch has been allocated to a lot, consumed, or is no longer `SEALED`, the
correction is refused with `TRANSFORMATION_OUTPUT_NOT_REVERSIBLE` rather than applied
halfway.

- Test: `apps/api/test/transformation-hardening.spec.ts`, "Transformation invariant 16".
- This is a deliberate limitation, not an oversight. Reversing a quantity that is already
  downstream would require cascading corrections through lots, custody and settlement.

## 15. This invariant is reversal's first real exercise

Invariant 5 was previously enforced but unreachable. Supersession is the first code path
that sets `reversedAt`, `reversalReason` and `reversedByUserId`, so the reversal fields
and the `reversedAt: null` read filters are now exercised end to end.

## Measured behaviour at volume

`packages/database/prisma/attribution-plan-measurements.ts` (`pnpm --filter
@clycites/database run db:attribution-measurements`) builds 100,000 `DERIVED`
contributions on top of the capture volume fixture and captures `EXPLAIN (ANALYZE,
BUFFERS)` evidence in
[wp13-attribution-scale.md](../audits/artifacts/wp13-attribution-scale.md).

- The `(batchId, reversedAt)` index added for attribution was **not sufficient**. The
  planner still needed a heap fetch per row, and on a first fixture shape it preferred a
  full scan of the table. The fix is
  `FarmerBatchContribution_live_attribution_idx`: partial on `reversedAt IS NULL`,
  covering `deliveryId` and `quantity`. Both attribution reads then become index-only
  scans. Single batch: 0.086 ms to 0.021 ms. Lot to farmers across 20 batches: 1.218 ms
  to 0.825 ms, with the bitmap heap scan replaced by an index-only scan.
- The first measurement was rigged and is reported as such: concentrating 100,000 rows
  into 200 batches made a lot's slice 10% of the table, where a sequential scan is the
  correct plan. The realistic shape is many batches with few contributions each.
- Concurrency: two transactions taking `FOR UPDATE` on overlapping input batches in
  sorted order serialise cleanly, the second waiting roughly the first's hold time
  (~400 ms) and both committing. Taking the same locks in opposing order produced a
  PostgreSQL deadlock abort. The sorted acquisition in `TransformationsService` is what
  removes that possibility.
- No caching was introduced anywhere.

## Known gaps

These are recognised and not yet closed.

- **Contribution reversal outside supersession is still unreachable.** Supersession sets
  the reversal fields, but there is no way to reverse an individual `DIRECT`
  contribution, and nothing guards against reversing a contribution on a batch that has
  been anchored.
- **Supersession does not withdraw the original anchor event.** The original
  transformation's `BATCH_TRANSFORMATION_COMPLETED` domain event has already been
  emitted and may already be anchored. A `BATCH_TRANSFORMATION_SUPERSEDED` event is
  emitted alongside it, but the public verification story for a superseded anchor is not
  yet defined.
- **Conversion ranges are not manageable through the API.** They can only be seeded or
  inserted directly, so an organization cannot yet replace a literature estimate with
  its own measured range.
- **`CommodityFormConversion`'s partial unique indexes are raw SQL.** Prisma cannot
  express partial or covering indexes, so they and
  `FarmerBatchContribution_live_attribution_idx` live only in the migration. A future
  `prisma migrate dev` will propose dropping them.
- **`TransformationStatus.DRAFT` remains unreachable.** Transformations are still created
  already completed.
