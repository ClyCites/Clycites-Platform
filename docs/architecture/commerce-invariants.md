# Commerce invariants

Each invariant below is enforced in code and covered by a test. Where an invariant was
added in response to a defect, the defect was demonstrated failing before the enforcing
change existed.

See [ADR 075](../adr/075-commerce-layer-hardening.md) for the reasoning, and
[wp14-settlement-scale.md](../audits/artifacts/wp14-settlement-scale.md) for the measured
cost of settlement generation.

## 1. Settlement money reaches every contributing farmer, through a transformation

A settlement over a lot drawn from a transformation output allocates to each farmer who
delivered into the input batches, in proportion to what they delivered.

- Enforced by: `allocation-engine.ts` computing exact rational shares over the derived
  `FarmerBatchContribution` rows, with fractions reduced by their greatest common divisor
  at every combining step.
- Test: `apps/api/test/commerce-composed-path.spec.ts`, which walks delivery, batch, seal,
  transformation, lot, listing, offer, contract, order, custody, acceptance, completion,
  proceeds, verification and settlement, then asserts exact-integer proportionality for
  three farmers.
- Demonstrated failing: yes. Before reduction, a two-hop lineage produced a numerator of
  roughly `5e300`; PostgreSQL rejected the `SettlementAllocation` insert with `value ... is
  out of range for type bigint` and the API returned HTTP 500. No transformed lot could be
  settled. The engine's own unit tests passed throughout, because they exercise single-hop
  weights.

## 2. Allocated money is conserved

Per farmer, gross allocation is exactly proportional to delivered quantity, and the sum of
gross allocations plus the rounding residual equals the run total.

- Enforced by: largest-remainder distribution over integer minor units, with an explicit
  residual guard and a per-farmer `roundingAdjustmentMinor`.
- Tests: `apps/api/test/commerce-composed-path.spec.ts` asserts
  `grossSum + roundingResidualMinor === grossAllocatedMinor` and that this equals the
  expected total; `apps/api/src/settlements/allocation-engine.spec.ts` covers the algebra.

## 3. A cross-currency run without a recorded rate does not exist

A settlement run whose proceeds are in a different currency from the run must carry an
`ExchangeRate`, or the run is refused outright and no partial run is left behind.

- Enforced by: `SettlementsService.resolveConversion` raising `EXCHANGE_RATE_REQUIRED`, and
  the `SettlementRun_exchange_rate_required_check` constraint.
- Test: `apps/api/test/commerce-hardening.spec.ts`, "refuses a cross-currency settlement run
  that carries no recorded rate, leaving no partial run", which asserts both the rejection
  and the absence of any run row afterwards.

The inverse also fails closed: a rate supplied for a same-currency run is
`EXCHANGE_RATE_NOT_APPLICABLE`, and a rate for the wrong pair is `EXCHANGE_RATE_MISMATCH`.

## 4. A rate recorded later cannot move money already settled

A converting run copies both the rate's id and the rate value onto itself.

- Enforced by: `SettlementRun.sourceCurrency`, `exchangeRateId` and `exchangeRateApplied`,
  the `SettlementRun_exchange_rate_snapshot_check` constraint, and the
  `ExchangeRate_append_only` trigger, which makes the rate row itself immutable.
- Test: `apps/api/test/commerce-hardening.spec.ts`, "snapshots the exchange rate it used so
  a later rate cannot move settled money", which records a second, different rate for the
  same pair after settling and asserts the settled amounts are unchanged.

## 5. Conversion introduces no floating point

Rates are parsed into scaled bigints and applied by integer multiplication with rounding
half away from zero. A rate with more than eight decimal places is refused at the point of
recording rather than rounded silently.

- Enforced by: `apps/api/src/settlements/exchange-rate.ts`.
- Test: `apps/api/src/settlements/exchange-rate.spec.ts`, which includes a worked
  counter-example — `50 * 1.15` is exactly 57.5, but evaluates to 57.49999999999999 in
  binary floating point, so `Math.round` returns 57 where the correct answer is 58.

Conversion is applied per proceeds record, so the run total is exactly the sum of what each
order contributed rather than a conversion of the sum.

## 6. Net entitlement is never negative, and the shortfall is never dropped

Deductions are capped at the gross entitlement. The uncovered remainder is recorded in
`carriedForwardMinor`, not discarded.

- Enforced by: the deduction loop in `SettlementsService.calculate`, and the constraints
  `FarmerSettlement_net_non_negative_check`,
  `FarmerSettlement_carried_forward_non_negative_check` and
  `FarmerSettlement_carry_forward_exhausted_check` — the last requiring that carry-forward
  is only non-zero when net is zero.
- Test: `apps/api/test/commerce-hardening.spec.ts`, "enforces the settlement identity in the
  database, not only in the service", which writes a violating row directly and asserts the
  constraint rejects it by name.

## 7. The settlement identity holds on every row

```
netEntitlementMinor = grossEntitlementMinor - deductionsTotalMinor + adjustmentsTotalMinor
```

- Enforced by: `FarmerSettlement_identity_check`, in addition to the service computing it.
- Test: as invariant 6.

This is not the identity the work package brief asked for. The brief also subtracted
`carriedForwardMinor`, which double-counts a shortfall that the capped deduction already
reflects. ADR 075 carries the counter-example.

## 8. An advance recovery never exceeds its outstanding balance

- Enforced by: `planAdvanceRecovery` taking the minimum of the outstanding balance and the
  available entitlement, and the `FarmerAdvance` constraint
  `0 <= outstandingMinor <= issuedAmountMinor`.
- Test: `apps/api/test/commerce-hardening.spec.ts`, "never recovers more from a farmer
  advance than its outstanding balance", which issues an advance smaller than the
  entitlement and asserts the recovery stops at the balance.

Every recovery writes an append-only `FarmerAdvanceRecovery` row linked to the exact
`SettlementDeduction` that effected it, so the balance is derivable from the ledger rather
than trusted as a decremented number. Recovery deductions carry source `ADVANCE_RECOVERY`.

## 9. Deduction consent is read from the consent record

A policy that requires farmer consent is applied only to farmers who granted
`SETTLEMENT_DEDUCTION` consent and have not withdrawn it; the rest raise a blocking
exception.

- Enforced by: `SettlementsService.farmersWithDeductionConsent`, one query for the whole
  run.
- Previously: the code never consulted `FarmerConsent` at all. It read
  `policy.requiresFarmerConsent` and blocked every farmer unconditionally. That failed
  closed on money, but blocked farmers who had in fact consented.

## 10. No traceability share scope exposes farm location or farmer identity

None of the five `TraceabilityShareScope` values can reach farm coordinates, plot geometry,
or farmer personal data.

- Enforced by: `CommerceService.sharedTrace` using an explicit field allowlist with no
  object spread, terminating at `Delivery` with `select: { publicId, deliveryNumber,
  acceptedAt }`.
- Test: `apps/api/test/commerce-hardening.spec.ts`, "exposes no farm coordinates or plot
  geometry through any traceability share scope", which places a plot with known boundary
  geometry and a distinctive centroid on a contributing farmer's farm, then requests a share
  for every scope combined and for each scope alone, asserting none of those values appear
  anywhere in the serialised response.

The assertion is non-vacuous in two ways: the coordinate list read back from the database is
asserted to be non-empty, so there is always something to look for, and each share response
is asserted to be a 200, so a failed request cannot pass as a clean one.

## 11. Competing commercial operations on one lot serialise instead of deadlocking

- Enforced by: every path taking locks in one canonical order,
  `SalesOrder -> SalesContract -> MarketplaceListing -> CooperativeLot -> LotReservation`.
  `transitionReservation` and the expiry worker previously took the reservation first and
  `cancelOrder` reached the contract last, through an implicit update lock;
  `createSettlementRun` locked a set of proceeds records in unsorted order.
- Test: `apps/api/test/commerce-hardening.spec.ts`, "serialises competing commercial
  operations on one lot instead of deadlocking", which fires concurrent operations and
  asserts every outcome is a definite success or a definite business rejection, never a
  deadlock error.

The reservation is now the last lock on every path, so the reservation cannot be held while
waiting for a listing, lot or contract that another transaction holds while waiting for the
reservation. `apps/worker/src/commercial-expiration.worker.ts` no longer selects its
candidate with `FOR UPDATE SKIP LOCKED`; it reads the due reservations first, then takes the
canonical locks and re-reads each candidate under its lock, so a reservation released while
the worker queued is skipped rather than released twice.

## Note on test isolation

`apps/api/test/phase-five.spec.ts` is not idempotent: it revokes the seeded traceability
share and terminates the seeded contract, so a second run against the same database fails
with 409 and 422 rather than a real regression. The end-to-end suite must be run against a
freshly reset and seeded database.
