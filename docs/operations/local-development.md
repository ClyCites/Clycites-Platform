# Local development

Copy `.env.example` to `.env`, install with `pnpm install --frozen-lockfile`, and run
`pnpm infra:up`. Confirm all three long-running services are healthy with `docker compose ps`; the
one-shot `minio-init` service should exit successfully.

Generate and migrate Prisma with `pnpm db:generate && pnpm db:migrate && pnpm db:seed`, then start
applications using `pnpm dev`. Stop infrastructure with `pnpm infra:down`. Named volumes preserve
data. Use `docker compose down --volumes` only for an intentional reset.

The API startup hook enqueues one fixed `system.foundation-check` job only in development when
`ENQUEUE_FOUNDATION_CHECK=true`. No arbitrary enqueue endpoint exists. Hedera must remain in `mock`
mode locally unless an approved integration test environment is explicitly configured.
