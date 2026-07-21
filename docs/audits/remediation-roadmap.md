# Remediation Roadmap

This is sequencing guidance only; no remediation was implemented during the audit.

## Wave 0: Repository Can Run

| Blocker              | Required outcome                   | Likely modules              | Prerequisites             | Validation          | Definition of done                                                               |
| -------------------- | ---------------------------------- | --------------------------- | ------------------------- | ------------------- | -------------------------------------------------------------------------------- |
| Operational baseline | Repeatable configured local/CI run | Root scripts, Prisma config | Safe environment template | Full command matrix | Frozen install, migrate, seed, tests, build and startup pass from clean checkout |

Wave 0 passed in this audit except bare Prisma commands require `DATABASE_URL`; document that prerequisite.

## Wave 1: Security And Data Integrity

| Blocker | Required outcome                                 | Likely modules                   | Prerequisites              | Validation                     | Definition of done                                                      |
| ------- | ------------------------------------------------ | -------------------------------- | -------------------------- | ------------------------------ | ----------------------------------------------------------------------- |
| BLK-001 | One-time refresh rotation                        | API auth/database                | Session concurrency design | Concurrent API test            | Exactly one successor token is accepted                                 |
| BLK-002 | Direct tenant isolation                          | Guards and domain services       | Two-org roles/records      | Ten integration scenarios      | No cross-org existence or data disclosure                               |
| BLK-003 | Durable, privacy-aware offline use               | Web PWA/offline API              | Device test lab            | Playwright + physical protocol | No loss/duplication; revoked device rejected; caches isolated/expired   |
| BLK-005 | Financial integrity from order to reconciliation | Marketplace/settlements/worker   | Dynamic order fixture      | Finance E2E                    | Exact totals, distinct approvals, idempotent mock/manual reconciliation |
| BLK-006 | Recoverable authority                            | Database/object storage/runbooks | Isolated backup target     | Restore command/checklist      | RPO/RTO and integrity evidence approved                                 |

## Wave 2: Complete Synthetic Workflow

| Blocker               | Required outcome                      | Likely modules           | Prerequisites             | Validation                     | Definition of done                                                |
| --------------------- | ------------------------------------- | ------------------------ | ------------------------- | ------------------------------ | ----------------------------------------------------------------- |
| BLK-004               | Live browser journey                  | Web/API/worker           | Wave 1 boundaries         | Playwright without route mocks | UI, API, DB, audit, outbox and mock providers agree at every step |
| BLK-008               | Safe enrollment import                | Pilot API/worker/storage | Tenant object policy      | Import integration suite       | Validation, quarantine, dedup and review all pass                 |
| Connected async flows | No disconnected outbox/provider stage | API/worker               | Dynamic synthetic journey | DB/job assertions              | Every eligible event reaches one idempotent terminal/review state |

## Wave 3: Pilot Operational Readiness

| Blocker | Required outcome                          | Likely modules           | Prerequisites     | Validation                       | Definition of done                                               |
| ------- | ----------------------------------------- | ------------------------ | ----------------- | -------------------------------- | ---------------------------------------------------------------- |
| BLK-007 | Evidence-backed pilot approval            | Pilot/operations         | Waves 1-2         | Preflight without override       | All blocking gates pass; training and human approval recorded    |
| BLK-013 | Observable and supportable staging        | Observability/operations | Protected staging | Incident/load/security exercises | Alerts, support, pause and restore drills meet approved criteria |
| BLK-014 | Accessible/localized/legal field workflow | Web/docs/agreements      | Stable workflows  | Human review records             | Required reviewers sign off                                      |

## Wave 4: External Readiness

| Blocker     | Required outcome                       | Likely modules        | Prerequisites            | Validation              | Definition of done                                                |
| ----------- | -------------------------------------- | --------------------- | ------------------------ | ----------------------- | ----------------------------------------------------------------- |
| BLK-009     | Hedera testnet verified                | Hedera/worker/SRE     | Approved keys/topic      | Testnet runbook         | Confirmed/reconciled synthetic anchors with cost/privacy evidence |
| BLK-010     | Payment sandbox/provider certified     | Finance/integration   | Provider/legal selection | Sandbox certification   | Callback, duplicate, reversal and unknown outcomes approved       |
| BLK-011     | SMS sandbox verified                   | Notifications         | Provider/consent         | Sandbox tests           | Consent, localization and delivery states approved                |
| BLK-012     | Production-compatible storage verified | Storage/SRE           | Cloud/KMS                | Security/restore tests  | Access and recovery controls approved                             |
| BLK-015-017 | Field hardware and expansion           | Product/hardware/data | Pilot evidence           | Device acceptance tests | Human-approved post-pilot scope                                   |
