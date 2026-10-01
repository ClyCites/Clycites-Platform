# Capture invariants

These are the properties the capture layer must hold. Each is enforced in code and proven
by a numbered automated test. A test that cannot fail proves nothing, so each invariant
was also confirmed to fail when the corresponding protection is removed.

| # | Invariant | Enforced by | Proven by |
| --- | --- | --- | --- |
| 1 | Net quantity is derived by the server with fixed-point integer arithmetic; a client's net claim is accepted only within one fixed-point unit | `apps/api/src/batches/quantity.ts`, delivery calculation | `delivery-calculation.spec.ts` |
| 2 | A capture with a missing, unknown, inactive, or out-of-calibration instrument is recorded and flagged, never rejected | `apps/api/src/deliveries/delivery-instrument.ts` | `delivery-instrument.spec.ts` |
| 3 | Measurements are append-only; a reweigh supersedes and leaves exactly one live measurement per delivery per type, with intact lineage | partial unique index + check constraints + `DeliveriesService.reweigh` | `phase-two.spec.ts` invariant 3 |
| 4 | Acceptance copies confirmation evidence that actually exists and matches the confirmation record | `DeliveriesService.accept` | `phase-two.spec.ts` invariant 4 |
| 5 | SMS-based confirmation is refused at the contract boundary for both creation and confirmation | `confirmationMethodSchema` | `delivery-confirmation.spec.ts` |
| 6 | Offline sync is bounded (1–250 operations, 1 MB body), rate limited per device with `Retry-After`, and remains partially successful | `offline-sync-rate-limiter.service.ts`, `main.ts`, contracts | `phase-two.spec.ts` invariant 6 |
| 7 | Concurrent identical sync batches create exactly one delivery and one offline operation | unique constraint + conflict handling | `phase-two.spec.ts` invariant 7 |
| 8 | Delivery pages are stable under a keyset cursor (no duplicates, no omissions) and cost a constant number of statements regardless of page size | row-value cursor + composite index + narrowed include | `phase-two.spec.ts` invariant 8 |

## Non-vacuity

Invariants were written against failing behaviour before the fix, or verified by
deliberately reintroducing the fault:

- **Invariant 2** was first observed failing with `Cannot find module './delivery-instrument.js'`.
- **Invariant 8** was verified by weakening the cursor boundary from `<` to `<=`; the test
  immediately reported a duplicate row across page boundaries (9 unique ids where 10 were
  required). The boundary was then restored.
- **Invariant 8's** query-count assertion observes real Prisma query events rather than
  inferring cost, and asserts the statement count is identical for a 1-item and a 25-item
  page. Replacing the batched hydration with a per-item lookup raised the count from a
  constant 13 to 61 and the test failed, so the assertion does detect an N+1. An earlier
  form of this assertion also compared the count against the number of items returned;
  that was removed because it silently depended on how many deliveries happened to exist
  and failed on a freshly seeded database while the code was correct.

## Open items not decided by engineering

- The one-year calibration validity window is a placeholder pending confirmation of the
  current Uganda National Bureau of Standards requirement.
- Consent behaviour at capture time is reported in
  [the consent behaviour report](../audits/wp12-consent-behaviour.md) and is a policy
  decision for counsel, not for this codebase.
- `FARMER_PIN` exists in the database enum with no implementation. It must not be offered
  as a control until it is built.
