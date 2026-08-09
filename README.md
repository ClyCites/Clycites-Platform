# ClyCites Verifiable Agriculture Platform

ClyCites is a platform for trustworthy agricultural trade in Uganda and across Africa. Phase 5
supports authenticated, organization-isolated coffee collection and physical traceability: registered
devices and sessions, farmer QR lookup, exact weight and price capture, configured quality checks,
farmer confirmation, receipts, idempotent synchronization, produce batches, transformations,
cooperative lots, quality inspection, custody transfer, and privacy-safe QR publication.

It also supports a cooperative lot marketplace, buyer organizations, offer negotiation, quantity
reservations, two-party sales contracts, fulfillment orders, buyer inspection and acceptance, and
scope-limited private traceability sharing. Settlements, payment movement, mobile money, escrow,
stablecoins, HTS, lending, insurance, native Android, Bluetooth scales, and real Hedera submissions
remain deliberately excluded.

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

The [authentication backbone](docs/architecture/authentication-backbone.md) is the design of record
for identity, sessions, authorization, recovery, MFA, and device authentication across WP2-WP7.

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

The idempotent local seed creates a platform administrator, cooperative administrator, collection
agent, finance officer, one cooperative, one recipient exporter, one collection point, three farmers, Coffee and five forms,
quality definitions, an active collection device/session, accepted and pending deliveries, and a
corrected receipt chain. It also creates complete batch, transformation, lot, inspection, custody,
public traceability, marketplace, buyer, offer, contract, order, and private-share fixtures, plus
representative mock HCS anchor states and verification history.
Credentials are controlled by the `SEED_*` values in `.env`;
defaults are documented local-only credentials and must never be used outside disposable data.

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
pnpm db:seed             # Seed deterministic Phase 1-5 development data
pnpm db:studio           # Open Prisma Studio
pnpm infra:up            # Start PostgreSQL, Redis, and MinIO
pnpm infra:down          # Stop local infrastructure
```

Controlled pilot operations:

```bash
pnpm pilot:preflight -- --pilot-id=<pilot-uuid> # Read-only; blocked pilots exit 2
pnpm pilot:bootstrap -- --config=tools/pilot-bootstrap.example.json # Dry-run by default
pnpm openapi:check       # Generate and validate the API schema in memory
pnpm test:accessibility  # Named semantic and keyboard browser checks
pnpm test:offline        # Named degraded-connectivity browser checks
pnpm test:performance    # Named bounded render browser smoke
pnpm test:security       # Authorization tests and dependency audit
```

See [controlled pilot execution](docs/operations/controlled-pilot-execution.md),
[farmer imports](docs/operations/pilot-farmer-import.md), and
[support and evaluation](docs/operations/pilot-support-and-evaluation.md). Synthetic fixtures are not
field evidence or external approval.

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
See `docs/architecture/hedera.md` and `docs/operations/phase-four-hedera.md` before enabling a real
provider. Hedera confirmation is integrity evidence, not proof that original physical claims are true.
See `docs/architecture/phase-five-marketplace.md` and
`docs/operations/phase-five-marketplace.md` for the commercial workflow and recovery rules.
