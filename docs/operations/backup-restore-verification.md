# Backup and restore verification

## Scope

Verify PostgreSQL authority, required object-storage evidence, encryption, retention, and recovery
timing. Redis is not an authoritative backup source. Never run a restore drill against production.

## Drill

1. Select an encrypted backup and record an opaque backup reference, environment, start time,
   retention date, and expected recovery point. Do not record credentials or storage URLs.
2. Provision or select an isolated disposable PostgreSQL database with no production network path.
3. Restore the backup using the database platform's supported restore tooling.
4. Run `pnpm --filter @clycites/database exec prisma migrate status` against the restored database.
5. Verify organization counts, audit/outbox continuity, accepted delivery totals, lot ledger
   balances, approved settlement totals, completed payment reconciliation, and append-only trigger
   behavior.
6. Verify object keys referenced by evidence records exist without downloading or publishing
   sensitive documents unnecessarily.
7. Measure recovery point and recovery time against the approved objectives.
8. Record `PASSED` only when integrity checks and both objectives are met. Otherwise record
   `FAILED`, open an incident, and keep the readiness gate blocked.

Seeded development backup records are synthetic and cannot satisfy a production backup gate.
