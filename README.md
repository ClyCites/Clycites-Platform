# ClyCites Verifiable Agriculture Platform

ClyCites is a foundation for trustworthy agricultural trade in Uganda and across Africa. The first
product workflow will support farmer and farm registration, offline coffee delivery capture,
traceable lot aggregation, sales, transparent settlements, payment reconciliation, and selective
event anchoring through Hedera Consensus Service.

This repository currently provides technical foundations only. It does not implement agriculture
domain modules, authentication, payments, tokens, smart contracts, or real Hedera submissions.

## Architecture

The codebase is a strict TypeScript, pnpm/Turborepo monorepo organized as a modular monolith:

- `apps/web`: Next.js App Router interface.
- `apps/api`: NestJS versioned REST API and OpenAPI document.
- `apps/worker`: standalone NestJS BullMQ processor.
- `packages/database`: PostgreSQL schema, Prisma client, migrations, and seed.
- `packages/contracts`: framework-independent Zod API contracts.
- `packages/auth`: roles, permissions, and principal types.
- `packages/hedera`: canonical hashing and mock anchor provider.
- `packages/observability`: structured logging and request IDs.
- `packages/ui`: small accessible React component set.
- `infrastructure/docker`: reserved for future container-specific assets.
- `docs`: product, architecture, ADR, security, and operations guidance.

PostgreSQL is authoritative. Redis/BullMQ handles asynchronous work. MinIO provides local
S3-compatible storage. The API and worker remain separately deployable processes while sharing one
codebase and database boundary.

## Prerequisites

- Node.js 22 or newer
- Corepack and pnpm 11.5.0
- Docker Desktop or Docker Engine with Compose

## Local setup

```bash
cp .env.example .env
corepack enable
pnpm install --frozen-lockfile
pnpm infra:up
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The web app is at `http://localhost:3000`, API at `http://localhost:4000/api/v1`, Swagger at
`http://localhost:4000/api/docs`, and the MinIO console at `http://localhost:9001`.

The root `.env.example` documents server-only and browser-safe variables. Only variables prefixed
with `NEXT_PUBLIC_` may enter browser code. Hedera values remain empty in mock mode.

## Commands

```bash
pnpm dev                 # Run all development processes
pnpm build               # Production builds
pnpm lint                # ESLint across workspaces
pnpm typecheck           # Strict TypeScript checks
pnpm test                # Unit and component tests
pnpm test:e2e            # Endpoint and app-level tests
pnpm format              # Apply Prettier
pnpm format:check        # Verify formatting
pnpm db:generate         # Generate Prisma Client
pnpm db:migrate          # Apply/create development migrations
pnpm db:seed             # Seed foundational settings
pnpm db:studio           # Open Prisma Studio
pnpm infra:up            # Start PostgreSQL, Redis, and MinIO
pnpm infra:down          # Stop local infrastructure
```

To reset local infrastructure data intentionally, run `docker compose down --volumes`; this is
destructive. To inspect logs, run `docker compose logs -f postgres redis minio`.

## Troubleshooting

- If startup validation fails, compare `.env` with `.env.example`; errors identify invalid values.
- If `/api/v1/ready` returns 503, check `docker compose ps` and service logs.
- If Prisma cannot connect, confirm `DATABASE_URL` uses `localhost` from the host and `postgres`
  only from another Compose service.
- If the web status reports a request error, verify `NEXT_PUBLIC_API_BASE_URL` and restart Next.js.
- Port conflicts can be resolved by changing the corresponding local port variables before starting
  Compose and application processes.

## Security

Never commit `.env`, private keys, passwords, access tokens, personal data, or production connection
strings. Local defaults are disposable development credentials only. PII and full business records
must never be sent to Hedera; only minimal identifiers and cryptographic hashes may be anchored.
