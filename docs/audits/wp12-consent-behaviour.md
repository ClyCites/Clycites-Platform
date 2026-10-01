# WP12 consent behaviour report

This report records **what the code does today**. It deliberately does not decide what the
policy should be. Whether a delivery may be recorded for a farmer who has withheld or
withdrawn consent is a legal question with real consequences for farmers and for the
cooperative, and it must be answered by counsel and the pilot's data controller.

## Observed behaviour

Delivery capture consults **no consent record at all**.

- `FarmerConsent` records are created and read by `consents.service.ts`,
  `farmers.service.ts`, and `farmer-self-service.service.ts`.
- `deliveries.service.ts` and the offline sync path contain **no reference** to
  `farmerConsent`, `DATA_PROCESSING`, or `TRACEABILITY`.

Consequently:

| Consent purpose | Checked at delivery capture? |
| --- | --- |
| `DATA_PROCESSING` | No |
| `TRACEABILITY` | No |

A delivery is recorded identically whether the farmer has granted, never given, or
explicitly withdrawn either consent. Downstream traceability publication and sharing are
governed separately.

## Why this is not a defect that engineering should silently "fix"

Two plausible behaviours are both defensible, and they have opposite failure modes:

- **Blocking capture without consent** protects the farmer's data rights, but it can turn a
  farmer away at the collection point holding a perishable crop, converting an
  administrative gap into a direct economic loss for the person the rule exists to
  protect. It also creates an incentive to capture the delivery off-system, where the
  farmer has no record at all.
- **Recording regardless** guarantees the farmer keeps evidence of what they delivered, but
  processes personal data without a recorded lawful basis.

Choosing between these is a policy decision, not an implementation detail.

## Recommendation (for the decision-maker, not a decision)

Record the delivery and flag the consent gap, rather than refusing the farmer. This
preserves the farmer's evidence of delivery, makes the gap visible and reportable, and
allows the cooperative to remediate consent without anyone losing a crop. The same
flag-do-not-reject principle is already applied to weighing instrument provenance in
[ADR 072](../adr/072-capture-layer-hardening.md).

This recommendation is **not implemented**. No consent flag is written at capture today.

## Escalation

The following must be confirmed by counsel and the data controller before pilot:

1. The lawful basis for processing delivery data where `DATA_PROCESSING` consent is absent
   or withdrawn.
2. Whether capture must be blocked, flagged, or unaffected in that case.
3. The required treatment of deliveries already recorded before consent was withdrawn.
4. Whether `TRACEABILITY` consent governs capture at all, or only downstream publication
   and sharing.

Until these are answered, the current behaviour must be documented to pilot participants
rather than left implicit.
