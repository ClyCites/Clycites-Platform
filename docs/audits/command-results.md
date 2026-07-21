# Audit Command Results

Audit date: 2026-07-21. Branch `staging`, commit `3cb62a2b9fc6fad453d61b2a5575b241bf87d264`. Secrets and local credentials are omitted. Durations are wall-clock where `/usr/bin/time` was used.

| Command                                    | Purpose                | Exit code | Result         | Duration | Failure summary                                                           |
| ------------------------------------------ | ---------------------- | --------: | -------------- | -------: | ------------------------------------------------------------------------- |
| `git status --short --branch`              | Establish baseline     |         0 | PASS           |      n/a | Clean, tracking `origin/staging`                                          |
| `git rev-parse`                            | Record revision        |         0 | PASS           |      n/a | Branch and SHA recorded                                                   |
| Toolchain version probes                   | Record environment     |         0 | PASS           |      n/a | Node 24.14.1, pnpm 11.5.0, Docker 29.5.3, Compose 5.1.4, macOS 26.5.2     |
| `pnpm install --frozen-lockfile`           | Deterministic install  |         0 | PASS           |    1.05s | Lockfile current; 12 workspace projects                                   |
| `pnpm format:check`                        | Formatting             |         0 | PASS           |    4.29s | All files matched                                                         |
| `pnpm lint`                                | Workspace lint         |         0 | PASS           |   23.12s | 15/15 Turbo tasks                                                         |
| `pnpm typecheck`                           | Type safety            |         0 | PASS           |   15.19s | 15/15 Turbo tasks                                                         |
| `pnpm build`                               | Production builds      |         0 | PASS           |   30.49s | API, worker, packages and 49 web routes built                             |
| `docker compose ps --format json`          | Pre-audit infra state  |         1 | BLOCKED        |      n/a | Docker daemon initially stopped                                           |
| `pnpm infra:up`                            | Local infrastructure   |         0 | PASS           |    5.98s | PostgreSQL, Redis, MinIO healthy; bucket initialized                      |
| `pnpm db:generate`                         | Bare Prisma generation |         1 | FAIL           |    4.82s | `DATABASE_URL` is required by Prisma config                               |
| `pnpm db:generate` with isolated URL       | Generate client        |         0 | PASS           |    8.97s | Prisma Client 7.8.0 generated                                             |
| `prisma migrate deploy`                    | Clean migration        |         0 | PASS           |    5.94s | 10/10 migrations applied from zero                                        |
| `prisma migrate status`                    | Migration status       |         0 | PASS           |    3.47s | Schema current                                                            |
| First `pnpm db:seed`                       | Synthetic fixtures     |         0 | PASS           |    8.36s | Seed completed                                                            |
| Second `pnpm db:seed`                      | Idempotency            |         0 | PASS           |    5.96s | Repeated seed completed without conflict                                  |
| `pnpm test`                                | Unit/package tests     |         0 | PASS           |   22.31s | All configured package tasks passed; DB/UI/observability contain no tests |
| API `test:e2e`                             | Phase 1-8 integration  |         0 | PASS           |   32.12s | 8 files, 37 tests passed                                                  |
| Worker `test:e2e`                          | Async processors       |         0 | PASS           |    5.02s | 4 files, 11 tests passed                                                  |
| Web `test:e2e`                             | Browser smoke          |         0 | PASS           |   17.81s | 10/10 across desktop/mobile; API calls mocked                             |
| `pnpm test:accessibility`                  | Accessibility smoke    |         0 | PASS           |    3.64s | 2/2 semantic/focus/overflow cases; fixture API                            |
| `pnpm test:offline`                        | Offline smoke          |         0 | PASS           |    3.11s | 2/2 aborted-preflight shell cases; not collection durability              |
| `pnpm test:performance`                    | Performance smoke      |         0 | PASS           |    2.96s | 2/2 mocked pilot-list timing cases                                        |
| `pnpm test:security`                       | Auth and audit         |         0 | PASS WITH NOTE |    1.58s | 14/14 permission tests; one low advisory                                  |
| `pnpm openapi:check`                       | API document           |         0 | PASS           |    6.04s | OpenAPI 3.0.0, 204 paths                                                  |
| `pnpm pilot:preflight ... --allow-blocked` | Pilot readiness        |         0 | EXPECTED BLOCK |    2.71s | `passed:false`; gates, training, human approval failed                    |
| `pnpm audit --prod --audit-level moderate` | Dependency audit       |         0 | PASS WITH NOTE |    2.57s | One low-severity advisory                                                 |
| Built web startup + `/login`               | Web runtime            |         0 | PASS           |      n/a | HTTP 200                                                                  |
| Bare API/worker startup                    | Environment validation |         1 | EXPECTED FAIL  |      n/a | Required `DATABASE_URL` absent in new terminal sessions                   |
| Configured API/worker startup              | Runtime validation     |         0 | PASS           |      n/a | API listened; worker connected to Redis and emitted structured JSON       |
| Health/readiness/version/Swagger probes    | Runtime endpoints      |         0 | PASS           |      n/a | 200; PostgreSQL/Redis up; request ID propagated; docs available           |
| `pnpm infra:down`                          | Cleanup                |         0 | PASS           |    1.14s | Containers/network removed; named volumes retained                        |

No real Hedera, payment, SMS, production database, or production object-storage operation was attempted. Next.js changed `next-env.d.ts` during its dev-server test; the single generated import was restored to the recorded clean baseline before reporting.
