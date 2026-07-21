# Test Quality Audit

## Inventory And Results

There are **31 test files** under `apps` and `packages`. The audit executed package tests, 8 API phase integration files (37 tests), 4 worker files (11 tests), and 3 Playwright specs across two projects (10 cases). No skipped/disabled test was reported by executed commands.

| Package/suite                           | Evidence                                                          | Quality assessment                                                                |
| --------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Auth                                    | 14 permission tests                                               | Strong role matrix, no HTTP/session concurrency                                   |
| Contracts                               | 3 envelope/identifier tests                                       | Very narrow relative to contract surface                                          |
| Hedera                                  | Config/hash/provider tests                                        | Good mock/error classification; no network                                        |
| API unit                                | Calculation, allocation, encryption, environment, pilot lifecycle | High-value deterministic logic; limited property testing                          |
| API Phase 1-8                           | 37 passing integration tests                                      | Meaningful DB/HTTP assertions, but many later-phase reads depend on seed fixtures |
| Worker                                  | 11 passing tests                                                  | Good claim/idempotency/mock outcome coverage                                      |
| Web unit                                | 11 observed passing tests                                         | API client/localization/basic render only                                         |
| Playwright                              | 10 cases                                                          | All API calls mocked; no axe scan, live API, real offline or load test            |
| Database/UI/observability package tests | None                                                              | Scripts use `--passWithNoTests`                                                   |

## Critical-Risk Mapping

| Risk                       | Coverage                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------ |
| Cross-organization access  | Partial: farmer and batch direct; several required nested resources indirect/missing |
| Offline loss               | Missing browser durability/restart/storage tests                                     |
| Duplicate delivery         | Covered by idempotency replay/payload mismatch                                       |
| Quantity over-allocation   | Covered in Phase 3                                                                   |
| Lot over-reservation       | Covered by concurrent offer acceptance                                               |
| Settlement mismatch        | Unit calculations and seeded totals; dynamic order-to-settlement missing             |
| Duplicate payment          | Claim/version/idempotency tests; provider callback duplicate absent                  |
| Provider unknown outcome   | Hedera mock covered; payment real-provider case absent                               |
| Hedera PII leakage         | Public serializer/mock payload tests                                                 |
| Payment identifier leakage | API serialization and encryption unit tests                                          |
| Backup and restore         | Missing                                                                              |
| Pilot-gate bypass          | State/preflight tests pass; protected environment absent                             |

## Weak Or Misleading Signals

- Test names are not counted as implementation evidence; results were inspected.
- Browser accessibility checks assert semantics/focus/overflow, not WCAG conformance.
- Browser performance uses mocked data and a five-second page budget, not backend performance.
- Browser offline aborts one request and does not test collection persistence.
- Seed idempotency passed, but no before/after cardinality snapshot was recorded.
- API phase suites can pass independently using seeded records, so they are not one complete Phase 1→8 journey.

## Missing Suites

Direct ten-scenario tenant isolation, live UI/API journey, full offline durability, database trigger/restore, CSV import worker, object-storage authorization, payment callback security, DAST, load/concurrency beyond selected races, and real provider sandbox tests.
