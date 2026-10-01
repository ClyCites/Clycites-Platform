# 073. Farmer attribution is materialised across transformations

- Status: Accepted
- Date: 2026-08-11
- Supersedes: none
- Related: [017-explicit-batch-transformations](017-explicit-batch-transformations.md), [031-authoritative-financial-settlement](031-authoritative-financial-settlement.md), [072-capture-layer-hardening](072-capture-layer-hardening.md)

## Context

`FarmerBatchContribution` recorded which delivery, and therefore which farmer, went
into a produce batch. A `BatchTransformation` consumed input batches and created new
output batches, but it copied none of that attribution forward. The output batch was
linked to its inputs through `BatchTransformationInput`/`BatchTransformationOutput` and
nothing else.

The practical consequence was reproduced before any code changed and is preserved in
[wp13-attribution-loss-before.txt](../audits/artifacts/wp13-attribution-loss-before.txt):
a lot assembled from a transformation output reported an empty list of contributing
deliveries and farmers. Cherry to parchment is the ordinary coffee path, so in practice
almost every export lot lost its farmer list.

Two claims in the original problem statement turned out to be wrong on inspection and
changed the design:

1. **Attribution was not universally absent.** `allocation-engine.ts` already walks
   `transformationInputs` recursively, in exact rational arithmetic with cycle
   detection, so *settlement* attributed farmers correctly. The loss was confined to
   the read paths that do not use that engine: lot lineage, buyer traceability, and
   anchor verification.
2. **Existing readers would not have worked unchanged.** `resolveBatch` rejects a batch
   that presents both direct and transformed lineage. Naively materialising
   contributions onto output batches would have made `settlements.service.ts` supply
   both, and every settlement calculation in the organization would have failed.

## Decision

**Materialise attribution on write, not on read.** When a transformation completes, it
writes `FarmerBatchContribution` rows onto each output batch referencing the same
`deliveryId` values as the inputs.

**Derived rows are a distinct kind of row.** A new `origin` discriminator separates
`DIRECT` from `DERIVED`:

- `DIRECT` records a delivery physically allocated into a batch. It is accompanied by
  an `InventoryLedgerEntry` and it increments `ProduceBatch.initialQuantity`.
- `DERIVED` carries attribution across a transformation. It moves no quantity, so it
  deliberately writes **no** ledger entry and does **not** touch `initialQuantity`. The
  output batch already carries its full quantity from the transformation itself.

Summing the two kinds together would double count, so the distinction is enforced in
the database rather than left to convention: a `CHECK` constraint requires a `DERIVED`
row to name its `transformationId` and forbids a `DIRECT` row from naming one.

**Allocation is exact, with largest-remainder rounding only at the last step.** For an
input batch holding live contributions totalling `T`, of which the transformation draws
`R`, a delivery contributing `c` is entitled to `c * R / T`. Using the product of the
input totals as a common denominator makes every share an integer numerator, so merging
a delivery that appears in several input batches loses no precision. Only the final
split into four-decimal units rounds, and it uses the largest-remainder method so the
parts sum to exactly the output quantity. Ties break on delivery id, so a replay or a
backfill produces byte-identical results.

**Settlement keeps its own recursion.** Rather than switch settlement onto the
materialised rows, `settlements.service.ts` now reads `origin: 'DIRECT'` only. This
resolves the ambiguity that would otherwise break it, and it means no farmer's payout
changes as a result of this work: settlement continues to use exact rational arithmetic
rather than values already rounded to four decimals.

## Alternatives considered

**Traverse the transformation graph on read.** Rejected as the primary mechanism. It
would have to be implemented separately in lot lineage, buyer traceability, and anchor
verification, each with its own cycle handling, and each read would pay the cost of an
unbounded graph walk. Materialised rows are indexed and cost one join. The recursion
that already exists in the allocation engine is retained where it is, because it is
exact and because moving settlement onto rounded values would move money.

**Store a single denormalised farmer list per batch.** Rejected because it discards the
quantity split, which settlement and any future partial-recall workflow need.

**Recompute during anchoring.** Rejected: the anchored payload must reflect state that
was already durable and auditable, not state invented at anchor time.

## Consequences

- Lot lineage, buyer traceability, and anchor verification name farmers through a
  transformation without any new graph traversal.
- `DIRECT` and `DERIVED` rows must never be summed. This is the sharpest edge the change
  introduces; the `CHECK` constraint and the `origin` field on the batch response make
  it visible, and settlement filters explicitly.
- Attribution is captured from **live** contributions only, so a reversed contribution
  does not travel downstream.
- Batches created before this change carry no derived attribution until the backfill is
  run. `pnpm --filter @clycites/api run cli:backfill-attribution` reports counts and
  writes only with `--apply`. It is idempotent and processes transformations in
  completion order, because a transformation may consume a batch that an earlier
  transformation produced.
- An input batch with no live contributions contributes no attribution. The output is
  still fully attributed across the farmers that can be named, and the unattributable
  input quantity is reported rather than assigned to an invented delivery.
