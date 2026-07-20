# Pilot go-live and incident runbook

## Decision ownership

The pilot decision owner reviews `/admin/operations`. A go decision requires zero open blocking
gates. Automated checks may attach evidence but cannot approve legal, provider, equipment, or
training gates. Record the reviewer, timestamp, evidence references, known risks, rollback owner,
and support rota before changing a gate to `READY` or `READY_WITH_RISK`.

## Pre-flight

1. Confirm production startup validation succeeds with HTTPS, secure cookies, API docs disabled,
   and managed secrets. Never paste secret values into evidence or tickets.
2. Confirm migrations report no pending or failed migration and seed commands are disabled in the
   production deployment process.
3. Confirm the latest PostgreSQL backup is encrypted and a restore test has passed against an
   isolated database within the agreed RPO and RTO.
4. Confirm Redis loss leaves PostgreSQL reads available and queues recover without duplicate
   financial, notification, or Hedera outcomes.
5. Confirm real payment, SMS, and Hedera mainnet submission remain disabled. Hedera pilot use is
   limited to an explicitly approved testnet configuration.
6. Complete keyboard, mobile, low-connectivity, organization-switch, logout-cleanup, and field
   scale/printer checks on representative equipment.
7. Confirm named incident commander, technical lead, privacy lead, cooperative contact, and farmer
   support contact are available.

## Incident response

1. Create an incident with category, severity, impact, detection time, and organization scope.
2. For suspected credential or privacy exposure, restrict access, revoke sessions and devices,
   rotate affected credentials, preserve evidence, and notify the privacy lead. Do not put PII or
   secrets in incident titles or logs.
3. For payment uncertainty, stop submission and reconcile evidence. `SUBMITTED` is not paid.
4. For Hedera uncertainty, stop submission and reconcile transaction ID, hash, topic message, and
   Mirror evidence. PostgreSQL remains authoritative.
5. For queue failure, pause producers if duplicate side effects are possible. Resume only after
   checking idempotency keys and claimed records.
6. Resolve with impact, root cause, mitigation, validation, and follow-up owner. Human owners decide
   whether notification or regulatory reporting is required.

## Rollback

Disable the affected high-risk feature flag, stop workers that can create external side effects,
retain PostgreSQL evidence, and restore the last known application version. Database migrations
are forward-only; use a reviewed corrective migration rather than editing or reverting applied
migration files.
