# 074. Transformation yield ranges, loss accounting, and supersession

## Status

Accepted.

## Context

A completed transformation was, until now, accepted on the operator's word. The only
arithmetic check was that output mass did not exceed input mass. That leaves three ways
for a transformation to be wrong without anyone noticing.

1. A mistyped output quantity. Producing 40kg of parchment from 50kg of cherry is
   physically implausible — the published ratio is roughly 5:1 — but it satisfies the
   mass-gain rule and was accepted.
2. Unexplained loss. The difference between input and output was recorded only
   implicitly, as a subtraction nobody performed. An operator could write off any
   fraction of a farmer's delivery without stating where it went.
3. No way back. A completed transformation could not be corrected. It permanently
   consumed its inputs and emitted an anchor event.

Transformation weights also carried none of the instrument provenance that WP12 added to
delivery weights, so the most consequential weighing in the chain was the least
scrutinised.

## Decision

### Yield ranges are literature estimates, and flagging is not rejection

`CommodityFormConversion` holds an expected `minRatio`/`maxRatio` for a commodity form
pair, resolved organization-specific first and platform-default second. The realised
ratio (output over input, six decimals) is stored on every transformation.

The ranges shipped in the seed are marked `LITERATURE_ESTIMATE`. They come from published
coffee processing figures, not from measurements at these cooperatives. `ConversionSource`
exists so that a `MEASURED_LOCAL` or `REGULATORY` range can supersede an estimate later
without anyone having to guess what the original number was based on.

Because the range is an estimate, a transformation outside it is **flagged and accepted**,
not rejected. Rejecting on an estimate would block legitimate work — genuine variation
exists — and would teach operators to adjust quantities until the system stopped
complaining, which is precisely the falsification the flag is meant to detect. A flagged
transformation records `yieldFlagged`, a reason, and an audit entry for review.

A form change with no published range is flagged `YIELD_UNVERIFIABLE`. Silence would
misrepresent an unchecked transformation as a checked one.

A split or merge changes no form and is not flagged. Its only meaningful expectation is
mass conservation, which is enforced separately, so a flag there would be noise.

### Loss reasons are rejected, not flagged

Loss above a tenth of a percent of the input requires a `TransformationLossReason`, and
`OTHER` requires a note. This is deliberately stricter than the yield rule.

The asymmetry is the point. A yield range is an estimate about the world; the system
should be humble about it. Loss is arithmetic on the operator's own two numbers; there is
no uncertainty to be generous about. If mass went somewhere, someone knows where.

The tolerance exists so that rounding at the fourth decimal does not demand a narrative.

This is a breaking change: requests that previously succeeded with unexplained loss now
return 422 `TRANSFORMATION_LOSS_REASON_REQUIRED`.

### Correction is supersession, expressed as appended ledger entries

A completed transformation is never updated or deleted. `POST
/batch-transformations/:id/supersede` takes a reason and a full replacement, and in one
serialisable transaction:

- appends `TRANSFORMATION_OUTPUT_REVERSAL` and `TRANSFORMATION_INPUT_REVERSAL` entries,
- cancels the output batches and reverses their derived attribution,
- restores consumed inputs to `SEALED`,
- marks the original `supersededAt` while leaving its status and `completedAt` intact,
- creates the replacement with `version + 1` and `supersedesTransformationId`.

Reversal had to be an append rather than a negation because `InventoryLedgerEntry` has a
`quantity > 0` check and a trigger forbidding update and delete. Two new entry types were
added and `allocatedQuantity` subtracts the input reversal, which is what actually returns
availability to the input batch.

The original keeps `status = COMPLETED`. It did happen, and it was presented as real. The
correction records that it was later withdrawn; it does not pretend it never existed.

Supersession is refused when any output has already been allocated or consumed. Reversing
a quantity that is already downstream would require cascading corrections through lots,
custody and settlement, which is a larger decision than this one.

### Transformation weights reuse the delivery instrument rule

`assessWeighingInstrument` is reused verbatim rather than reimplemented, so a
transformation weight and a delivery weight are judged by one rule. A quantity with no
instrument recorded defaults to flagged, not trusted.

## Consequences

- A mistyped transformation quantity now surfaces for review instead of silently
  redistributing a farmer's coffee.
- Every kilogram that enters a transformation and does not leave it carries a named
  reason.
- Correcting a transformation is possible and leaves a complete before-and-after record,
  at the cost of a new endpoint and two new ledger entry types.
- The yield ranges are only as good as the literature behind them. They are marked as
  such and are expected to be replaced by measured local ranges. Until then the flag
  means "worth a look", not "wrong".
- `CommodityFormConversion` cannot yet be managed through the API, so replacing an
  estimate currently requires a migration or direct insert.
- Partial and covering indexes used by this work exist only in migrations, because Prisma
  cannot express them.
