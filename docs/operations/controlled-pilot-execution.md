# Controlled pilot execution

This runbook governs Phase 8 pilot execution. It does not authorize deployment, real farmer data,
real SMS, money movement, Hedera mainnet, or production provider activation.

## Authority

- PostgreSQL is authoritative for lifecycle, enrollment, training, evidence, support, and decisions.
- Global emergency controls and global readiness gates always apply to every pilot.
- Pilot configuration may narrow platform capabilities but may not enable a disabled high-risk flag.
- A pilot cannot enter supervised or active use with blocking gates, an open SEV1/SEV2 incident,
  incomplete required training, no verified baseline, or no recorded human onboarding approval.
- Evaluation produces evidence only. It never generates a final decision.
- Decision approval requires a second platform administrator and an unchanged evidence hash.

## Operator sequence

1. Create a draft through `/admin/pilots` or dry-run `pnpm pilot:bootstrap`.
2. Configure dates, local limits, support hours, incident contacts, languages, and allowed features.
3. Create pilot-specific readiness gates without changing global gates.
4. Enroll eligible staff and consent-verified farmers. CSV import creates draft farmer records only.
5. Assign immutable training-module versions and record attempts, completion, or exceptional waiver.
6. Record and independently verify baseline evidence.
7. Run `pnpm pilot:preflight -- --pilot-id=<uuid>` before supervised use and activation.
8. Capture field observations, feedback, metric quality, and support cases during supervised use.
9. Complete the pilot, enter evaluation, snapshot evidence, and record a human recommendation.
10. Have a different authorized administrator approve or reject the recommendation.

## Pause and incident response

Pause sets the pilot read-only. Queued authoritative work remains in PostgreSQL and is not discarded.
Resume returns the pilot to readiness review. Escalate support work to an operational incident only
when incident criteria are met; do not merge support and incident histories.

## External blockers

Legal/privacy review, cooperative approval, Luganda human review, named support contacts, field-device
evidence, protected infrastructure, backup/restore evidence, object scanning, and any provider/testnet
approval must be supplied by accountable humans. Synthetic seed records do not satisfy these gates.
