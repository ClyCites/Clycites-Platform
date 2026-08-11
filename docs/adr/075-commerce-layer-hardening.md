# 075. Commerce layer hardening: currency, floors, and advances

## Status

Accepted.

## Context

The commerce layer converts a sale into money owed to named farmers. Four things about it
were assumed rather than established, and writing the first end-to-end test through the
whole path — delivery, batch, transformation, lot, listing, offer, contract, order,
acceptance, proceeds, settlement — established them.

The most serious finding was not about money at all. `allocation-engine.ts` computes each
farmer's share as an exact rational number so that no rounding is introduced before the
final largest-remainder distribution. Every lineage hop multiplies denominators. Nothing
reduced the fractions, so a two-hop lineage — the ordinary case, a delivery aggregated into
a batch which is then transformed — produced a numerator around `5e300`. PostgreSQL refused
the insert and the API returned an opaque HTTP 500. **No lot that had been through a
transformation could be settled at all.** The engine's unit tests passed throughout because
they exercised the arithmetic directly with single-hop weights. The exception filter did
not log 500s, so the failure left no diagnosable trace.

Three further gaps, stated as they actually were rather than as they were assumed to be:

- Cross-currency settlement was not silently wrong; it was impossible. `createSettlementRun`
  rejected any proceeds record whose currency differed from the run's. A cooperative paid in
  USD for a lot it settles in UGX simply could not use the system.
- A farmer whose policy deductions exceeded their gross entitlement had the excess clamped
  and then **silently dropped**. Nothing recorded that the cooperative was still owed it.
  There was no database constraint behind the engine either.
- `SETTLEMENT_DEDUCTION` consent was never checked against `FarmerConsent`. The code read
  `policy.requiresFarmerConsent` and raised a blocking exception for every farmer
  unconditionally. This failed closed on money, which is the right direction to fail, but
  it meant a farmer who had granted consent was blocked exactly like one who had refused.

## Decision

### The exact ratio is reduced, and the arithmetic is otherwise untouched

`addFractions` and `normalizeWeights` reduce by the greatest common divisor. Reduction is
value-preserving: it changes the representation, never the number. The rounding rule, the
largest-remainder distribution, the residual guard and the per-farmer
`roundingAdjustmentMinor` are unchanged.

The regression that guards this is not a unit test. It is `commerce-composed-path.spec.ts`,
which walks the entire path and asserts exact-integer proportionality for three farmers
across a transformation. A unit test would not have caught the original defect and will not
catch the next one of its kind.

### An exchange rate is an immutable snapshot, and conversion fails closed

`ExchangeRate` is append-only, enforced by a trigger, with the rate stored as
`Decimal(20,8)`. A settlement run that converts records the rate's id **and a copy of the
rate value** on itself. Recording a corrected rate afterwards therefore cannot move money
that has already been settled; it creates a new row that later runs will use.

Conversion is arithmetic on integers. `toRateUnits` parses the decimal string into a scaled
bigint and refuses anything with more than eight decimal places, so an unrepresentable rate
is rejected before it is stored rather than quietly rounded. `convertMinorUnits` multiplies
and rounds half away from zero. Floating point is not used anywhere in the path, and the
unit tests carry a worked example of why: `50 * 1.15` is exactly 57.5, but in binary
floating point it is 57.49999999999999, so `Math.round` returns 57 and the farmer loses a
minor unit.

Conversion is applied **per proceeds record**, not once to the run total, so the run total
is exactly the sum of what each order contributed.

Both directions fail closed. Differing currencies with no rate supplied is
`EXCHANGE_RATE_REQUIRED`; identical currencies with a rate supplied is
`EXCHANGE_RATE_NOT_APPLICABLE`; a rate for the wrong pair is `EXCHANGE_RATE_MISMATCH`. No
default rate exists and none is inferred.

### Net entitlement has a floor, and the shortfall is carried rather than dropped

Deductions are capped at the gross entitlement. What the policy demanded but the entitlement
could not cover is written to `carriedForwardMinor` on the farmer settlement. The
cooperative's claim survives into a record instead of evaporating.

The brief for this work asked for the identity
`net = gross - deductions + adjustments - carriedForward`. That is arithmetically wrong and
was not implemented. Take gross 1000 with a policy demanding 1500: the deduction is capped
at 1000, net is 0, and 500 is carried. The brief's formula subtracts the carried 500 a
second time from a net that already reflects the full 1000 deduction. The implemented
identity is

```
netEntitlementMinor = grossEntitlementMinor - deductionsTotalMinor + adjustmentsTotalMinor
```

with `carriedForwardMinor` constrained separately: it is non-negative, and it can only be
non-zero when `netEntitlementMinor` is zero — a shortfall is only possible once the
entitlement is exhausted.

### Advances are a ledger, not a balance

`FarmerAdvance` holds the issued amount and the outstanding balance; `FarmerAdvanceRecovery`
is an append-only row linking each recovery to the exact `SettlementDeduction` that effected
it. Recovery therefore has a per-settlement audit trail rather than a decremented number.
Recovery deductions carry the new `ADVANCE_RECOVERY` source so they are distinguishable from
policy deductions in every downstream report.

A recovery can never exceed the outstanding balance. This is enforced in the planner and
again by a CHECK constraint requiring `0 <= outstandingMinor <= issuedAmountMinor`.

### CHECK constraints are a second line, not the first

Every monetary invariant above is enforced in the service and again in the database:
non-negative net, non-negative carry-forward, non-negative gross, the identity itself, the
carry-forward exhaustion rule, positive advance amounts, the advance write-off being
all-three-columns-or-none, positive exchange rates, and distinct currencies on a rate.

The service is where the correct behaviour lives. The constraints exist because a settlement
that is wrong is worse than a settlement that fails, and because the next person to write a
migration or a repair script will not have read the service. The hardening test suite
demonstrates the constraint firing, not merely the service check.

### Commercial locks have one order

Every path that locks more than one commercial row takes them in the order
`SalesOrder -> SalesContract -> MarketplaceListing -> CooperativeLot -> LotReservation`.

Three paths violated it. `transitionReservation` and the expiry worker locked the
reservation before the listing it belongs to; `cancelOrder` reached the contract only
through an implicit update lock, after the listing; and `createSettlementRun` locked a set
of proceeds records in whatever order the set iterated. All four are now aligned, and the
proceeds ids are sorted so two overlapping runs queue instead of deadlocking.

The reservation is deliberately last. It is the row every cancellation path ends at, so
making it the tail of the order removes the cycle rather than merely reshuffling it. The
expiry worker gave up `FOR UPDATE SKIP LOCKED` to achieve this: it now reads its due
candidates first, takes the canonical locks, and re-reads each candidate under its own lock,
skipping any that was released while it queued.

### The platform remains non-custodial

Confirmed rather than assumed: there is no payment SDK, escrow, wallet or provider
integration anywhere in the codebase. `PaymentInstruction` is a record of an instruction the
cooperative carries out elsewhere. Advances and exchange rates are bookkeeping over money
that moves outside the platform. Nothing in this work package changes that, and the
constraint is recorded here so it is not eroded by a later change that looks like a natural
extension.

## Consequences

### Known gaps

**Minor-unit exponents are assumed equal.** `convertMinorUnits` maps minor units to minor
units. If the base and quote currencies have different exponents — converting to JPY, which
has none — the result is wrong by a factor of one hundred. Every currency in use here is
treated as two decimal places, including UGX, which by ISO 4217 has none. That is an
existing convention in this codebase, not something introduced by this work, but the
conversion path is the first place where it becomes a correctness question rather than a
presentation one. A currency with a differing exponent must not be added without an exponent
table and a change to this function.

**The one existing settlement run was not recomputed.** `STL-KIS-2026-001` is a seeded
fixture with hardcoded amounts and an all-`f` placeholder lineage hash. It draws on a
transformation output batch with no farmer contributions, so it exhibits the defect this
package fixes — but there is nothing to recompute and no production data behind it.
Approved settlements remain immutable regardless.

**Lock ordering is now uniform, and stays that way only by discipline.** There are 45
`FOR UPDATE` sites in the commerce and settlement services and no mechanism that enforces
the order between them. The canonical order is
`SalesOrder -> SalesContract -> MarketplaceListing -> CooperativeLot -> LotReservation`, and
an implicit lock taken by an `update` counts. A new path that writes one of these tables
without taking its lock in that position reintroduces the deadlock.

**List endpoints are unbounded.** Eleven organization-scoped list methods impose no `take`.
They are permission-guarded, so the cost falls on the cooperative's own staff, but they are
a denial-of-service surface at production volume. Recorded in the scale artifact.

### What improved measurably

Settlement calculation issued `4N + 22` statements — 3222 for 800 farmers. It now issues 25
regardless of N, and wall clock for 800 farmers fell from 1653 ms to 375 ms. The per-farmer
advance lookup planned perfectly in isolation; the cost was round trips, which is why the
problem was invisible to plan inspection and only appeared under measurement. Wall clock
remains linear in N and nothing here makes a large run cheap.

No caching was introduced in settlement generation, and none should be. A settlement reads
the state that exists at the moment it runs.
