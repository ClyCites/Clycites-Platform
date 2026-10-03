# Local development

Copy `.env.example` to `.env`, install with `pnpm install --frozen-lockfile`, and run
`pnpm infra:up`. Confirm the long-running services are healthy with `docker compose ps`; the
one-shot `record-store-init` service should exit successfully after creating the `S3_BUCKET` bucket.

Generate and migrate Prisma with `pnpm db:generate && pnpm db:migrate && pnpm db:seed`, then start
applications using `pnpm dev`. Stop infrastructure with `pnpm infra:down`. Named volumes preserve
data. Use `docker compose down --volumes` only for an intentional reset.

The seed is idempotent and creates Phase 1 staff, cooperative, collection-point, farmer, farm,
consent, and QR fixtures. Local sign-in addresses and the shared development password are configured
through `SEED_*` variables in `.env.example`. These values are unsafe for shared or production
environments. To verify repeatability, run `pnpm db:seed` twice; both runs should succeed without
duplicating scoped records.

The seeded platform administrator is enrolled in TOTP, as platform administrators always require
it. To skip the code step locally, set `AUTH_MFA_DEV_BYPASS=true` and restart the API; sessions it
creates count as MFA-satisfied and the login audit event records `mfaDevelopmentBypass`. The API
refuses to start with the flag in production. Otherwise, add `SEED_PLATFORM_ADMIN_TOTP_SECRET` to an
authenticator app.

The API startup hook enqueues one fixed `system.foundation-check` job only in development when
`ENQUEUE_FOUNDATION_CHECK=true`. No arbitrary enqueue endpoint exists. Hedera must remain in `mock`
mode locally unless an approved integration test environment is explicitly configured.
