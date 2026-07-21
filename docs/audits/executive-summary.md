# Executive Audit Summary

## Recommendation

**`GO_FOR_INTERNAL_STAGING`**

The repository genuinely builds, migrates, seeds, starts and passes meaningful API/worker tests. It is suitable for an internal, synthetic staging environment using local/mock providers. It is **not ready for a supervised controlled pilot** because offline field durability, complete tenant-isolation coverage, a live browser-to-provider journey, backup restore, dynamic finance flow, training/readiness evidence and human/legal approvals remain unresolved.

## Repository State

- Audited branch: `staging`
- Commit: `3cb62a2b9fc6fad453d61b2a5575b241bf87d264`
- Initial working tree: clean
- Final changes: audit reports only under `docs/audits/`
- Environment: macOS 26.5.2; Node 24.14.1; pnpm 11.5.0; Docker 29.5.3; Compose 5.1.4

## What Works

Frozen installation, formatting, linting, type checking and production builds passed. A fresh isolated PostgreSQL database applied all 10 migrations, reported current and accepted the seed twice. PostgreSQL, Redis and MinIO reached healthy state. API health/readiness/version/Swagger, web login route and worker Redis startup worked locally. Phase 1-8 API integration passed 37 tests; workers passed 11 tests; mock Hedera completed one submit-confirm-verify path.

Identity/RBAC, atomic farmer registration, fixed-point delivery calculations, receipts/corrections, offline API idempotency, quantity conservation, lots/custody/public serializers, marketplace reservation concurrency, allocation arithmetic, finance masking/separation, readiness gates and pilot evidence have real code and meaningful test evidence.

## What Is Partial Or Mocked

The complete web workflow was not exercised against the live API: all 10 Playwright cases use route fixtures. Later commerce/finance/pilot tests often read seeded records rather than creating one continuous journey. Hedera SDK/Mirror code is testnet-capable but unverified. Payments and SMS are mock/manual/console only. Object storage is verified only with local MinIO. Offline browser persistence and field hardware are not verified.

## What Is Broken Or Missing

No repository-wide build or migration break was found. Bare `pnpm db:generate` fails without `DATABASE_URL`, which should be documented. Missing capabilities include MFA/recent-auth, receipt printer support and production provider adapters. Backup restore, rural low-connectivity, representative Android, accessibility, localization and protected-environment exercises have not been performed.

## Highest Risks

1. Refresh-token rotation is vulnerable to a concurrent double-rotation race.
2. Several required nested-resource tenant isolation cases lack direct same-role cross-organization tests.
3. Cached offline field data cannot be remotely erased from a lost device; durability/privacy scenarios are untested.
4. No live browser journey proves UI, authorization, persistence, audit, outbox and mock providers connect end to end.
5. Commerce-to-settlement-to-payment is not dynamically tested as one financial flow.

## Provider And Field Readiness

- Hedera: `SANDBOX_CAPABLE`; mock/local verified, no testnet call, not mainnet ready/enabled.
- Payments: `MOCK_ONLY`; manual/mock behavior, no sandbox/production adapter.
- SMS: `MOCK_ONLY`; no carrier adapter or delivery callback validation.
- Object storage: `LOCAL_READY`; local MinIO healthy, production access/recovery unverified.
- Offline: API idempotency is verified; PWA field readiness is not.

## Synthetic Journey

The requested journey could not be completed as one connected run. Independent executed segments cover login/farmer registration, delivery/receipt, batch/lot/custody, listing/offer concurrency, seeded settlement reads, mock worker providers, and blocked pilot evaluation. The flow stops at live UI integration, full contract/order lifecycle, dynamic proceeds/settlement/payment creation, import/training, and human pilot approval. Authorization was not bypassed to force completion.

## Capability And Blocker Counts

Matrix capabilities: 44 `VERIFIED_IMPLEMENTED`, 10 `IMPLEMENTED_NOT_VERIFIED`, 14 `PARTIALLY_IMPLEMENTED`, 2 `SCAFFOLDED`, 3 `DOCUMENTED_ONLY`, 1 `MOCK_ONLY`, 0 `BROKEN`, 2 `NOT_IMPLEMENTED`, 0 `NOT_APPLICABLE`.

Blockers: 0 P0, 8 P1, 6 P2, 3 P3.

## Immediate Wave

First make refresh rotation atomic and add the ten direct isolation tests. Then prove offline restart/revocation/cache behavior, complete the dynamic finance flow, and execute a restore drill. Only after those pass should the team build the single live synthetic browser journey and close pilot gates.

## Human Decisions Still Required

Ugandan legal/privacy review, cooperative agreement, farmer consent wording, finance/provider approval, Hedera key custody and testnet authorization, SMS/payment provider selection, Luganda review, accessibility sign-off, target Android/printer/scale selection, incident/support ownership, and an explicit human go/no-go decision.
