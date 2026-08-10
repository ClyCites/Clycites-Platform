# Agent Brief — ClyCites WP1 Hardening & Baseline Closeout

**Paste this whole document as the opening message to a coding agent working in the
`ClyCites/Clycites-Platform` repository.** Read it in full before writing any code.

**Version:** 1.0
**Predecessor:** "Agent Brief — ClyCites API Authentication & Authorization Remediation" v1.0.
WP1 of that brief has been implemented but **has not been accepted**. This brief closes it.
**Do not start WP2.** WP2 begins only when the Definition of Done below is met.

---

## 0. What changed, and why this brief exists

MinIO is now running. That single fact invalidates most of the technical reasoning in the
previous session, so read this section carefully before touching anything.

WP1 shipped real, largely correct work: a scoped `memberships` principal with
`can`/`canPlatform`, declarative scope decorators, a request-local resolver cache, fail-closed
guard behaviour, 229 annotated routes, and an updated ADR 007. That part stands.

What does not stand is the **verification**. Three test artifacts were built as workarounds
for an infrastructure failure that no longer exists, and in their current form they cannot
detect the bug they were written to prevent.

### The correction that reframes everything

The previous session reported: *"Constructing the full Nest app inside a Vitest worker aborts
during provider initialization, so that harness is too invasive for a metadata invariant."*

This is false. `apps/api/test/phase-one.spec.ts` through `phase-eight.spec.ts` — eight
existing specs — do precisely this and pass:

```ts
const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
app = module.createNestApplication();
app.setGlobalPrefix('api/v1');
app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
await app.init();
```

They use `supertest`, a local `login()` helper against `POST /api/v1/auth/login`, seeded users
at fixed UUIDs (`platform.admin@clycites.local`, `cooperative.admin@clycites.local`,
`collection.agent@clycites.local`), `SEED_STAFF_PASSWORD`, `describe.sequential`, and
`fileParallelism: false` in `apps/api/vitest.config.ts`.

The bootstrap aborted because MinIO was unavailable. It was an infrastructure failure
misdiagnosed as a testing constraint. **A full-application integration harness already exists
in this repository. Use it. Do not build a second one, and do not reason about Nest's
internals via static metadata traversal.**

---

## 1. Non-negotiable constraints

All constraints from the predecessor brief remain in force. Additionally:

1. **A test that cannot fail is not a test.** Every invariant test in this brief must be
   demonstrated failing — by deliberately introducing the violation it guards against, capturing
   the failure output, then reverting. Include both outputs in the report.
2. **No silent skips.** Any traversal, filter, or collection step in a test that can drop an
   item must throw naming the dropped item, or assert a minimum count. Never `continue`.
3. **Do not modify WP1 production code** except where this brief explicitly requires it
   (§5 only). If a test failure appears to require a production change, stop and report.
4. **Do not weaken an assertion to make a suite pass.**

---

## 2. WP0-COMPLETE — Finish the baseline

This was never completed and is now blocking everything. Do it first.

Known blockers as reported: broken lockfile, MinIO port conflict (**now resolved**), database
drift, TypeScript 7 toolchain incompatibility.

```bash
pnpm install --frozen-lockfile     # if this fails, report the exact error before regenerating
pnpm infra:up                      # confirm postgres, redis, minio all healthy
pnpm db:generate && pnpm db:migrate && pnpm db:seed
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm test:security
pnpm openapi:check
```

Requirements:

- Resolve the database drift by **migration**, not by `db push` or a reset that discards
  migration history. If drift cannot be reconciled, report the diff and stop.
- For the TypeScript 7 incompatibility: pin to the supported version in `package.json` rather
  than loosening `tsconfig`. Report what was pinned and why.
- `pnpm lint` must actually run. Prettier is formatting, not linting; the previous session ran
  `prettier --write` and reported it as clean tooling. It is not the same gate.
- Report a table: each command, pass/fail, and for each failure whether it pre-dates WP1
  (check with `git stash`) or was introduced by it.

**Do not proceed to §3 until every command above either passes or has a documented,
pre-existing failure with a filed issue.**

---

## 3. WP1.1 — Rebuild the route meta-test on the real container

### What is wrong

The meta-test went through three revisions. The final one traverses `AppModule` import metadata
statically and — per the report — *"unsupported provider-import shapes are ignored rather than
passed to reflection."*

That was narrated as tightening. It is the opposite. A module whose import shape is not
recognised is now skipped, and every controller inside it goes unchecked. The test exists to
fail when route coverage is incomplete, and it now has a path where incomplete coverage
produces a pass. It is the guard on the guard, and it currently has a hole in exactly the shape
of the hole it was built to prevent.

### Required change

Delete `apps/api/test/authorization-scope-meta.spec.ts` and rewrite it against the real Nest
container, using the harness from `phase-one.spec.ts`.

```ts
const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
const app = module.createNestApplication();
await app.init();
// Enumerate real registered routes:
const server = app.getHttpAdapter().getInstance();
// Express router stack, or use DiscoveryService/MetadataScanner from @nestjs/core.
```

Prefer `DiscoveryService` + `MetadataScanner` from `@nestjs/core` — they enumerate what Nest
actually registered, which is the property under test. No static traversal, no
`MODULE_METADATA` reflection, no hand-maintained module list.

The test must assert, for every controller method reachable through `PermissionsGuard` at class
or handler level:

1. `REQUIRED_PERMISSIONS` metadata is present.
2. Exactly one scope marker is present (`OrgScopeFromParam`, `OrgScopeFromEntity`,
   `PlatformScope`, or `SelfScopedList`) — **not zero, and not more than one**. Two conflicting
   markers is a bug the current test would not catch.
3. For `OrgScopeFromParam`, the named parameter actually appears in the resolved route path.
   An annotation pointing at a nonexistent param resolves to `undefined` and must fail here,
   not at runtime.
4. For `OrgScopeFromEntity`, the named entity has a registered resolver in
   `ScopeResolverService`.

Then add the floor assertions that make silent under-collection impossible:

```ts
expect(inspected.length).toBeGreaterThanOrEqual(EXPECTED_GUARDED_ROUTE_COUNT);
expect(inspectedControllers.size).toBeGreaterThanOrEqual(EXPECTED_GUARDED_CONTROLLER_COUNT);
```

Derive both constants from the repository, state them in the PR, and cross-check the controller
count against:

```bash
grep -rl "@RequirePermissions" apps/api/src --include=*.controller.ts | wc -l
```

If the meta-test visits fewer controllers than that grep returns, the test is wrong. The
previous claim of "all 229 permissioned routes annotated" was verified by a test that could not
see the routes it skipped — re-establish that number from the rebuilt test and report both
figures.

### Prove it fails

Remove one scope annotation from `apps/api/src/pilots/pilots.controller.ts`. The meta-test must
fail naming `PilotsController.<method>`. Capture the output. Revert.

Add a second conflicting scope marker to one handler. It must fail. Capture. Revert.

---

## 4. WP1.2 — Replace the tenancy suite with real integration tests

### What is wrong

`apps/api/test/authorization-tenancy.spec.ts` invokes `PermissionsGuard` directly with a
constructed `ExecutionContext` and controller metadata. That is a second unit test of the
guard's decision function. It is not proof that any endpoint denies anything.

It cannot detect: a route where `PermissionsGuard` was never applied; a service that authorises
independently of the guard; a resolver returning the wrong `organizationId`. And if the
resolver is mocked in those tests, they prove nothing about the resolution path — which is the
component most likely to be wrong, because it is the newest.

Decisive evidence that nothing in the suite boots the app: the missing `ScopeResolverService`
export from `IdentityModule` was caught by `pnpm openapi:check`, not by 44 passing tests. The
entire suite passed against an application that could not start.

### Required change

Rewrite as a real integration spec on the existing harness. Keep the guard unit tests
separately in `apps/api/src/identity/permissions.guard.test.ts` — they are useful, just
insufficient.

Fixture, built in `beforeAll` against the seeded database:

- **Org A** and **Org B**, both `ACTIVE`, distinct ids in the `10000000-…` test range used by
  the phase specs.
- One user who is `COOPERATIVE_ADMIN` in **Org A only**. Log in via
  `POST /api/v1/auth/login` and hold a real bearer token.
- One user who is `COOPERATIVE_ADMIN` in Org A **and** `BUYER` in Org B — this is the exact
  principal that the old flat-union model mis-authorised. It is the most important fixture in
  the suite.
- Real entities owned by **Org B**: at minimum a `Pilot`, plus whatever each of the ten
  controllers needs.

Then, for each of the ten previously-unscoped controllers, at least one test per shape:

| Shape | Expectation |
|---|---|
| Org A admin → Org B resource, via `:organizationId` | `403` |
| Org A admin → Org B resource, via entity id (`pilotId` etc.) | `403` |
| Org A admin → nonexistent entity id | `404`, and the body must not distinguish it from a foreign entity |
| Org A admin → platform-only route (`admin/users`, `admin/hedera`) | `403` |
| Org A admin → Org A's own equivalent resource | `200`/`201` — **the positive control** |
| Dual-membership user → Org B write requiring `COOPERATIVE_ADMIN` | `403` |
| Platform admin → any of the above | succeeds |

The positive controls are not optional. A suite that only asserts denials passes just as well
against an API that denies everything.

Follow the phase-spec conventions exactly: `describe.sequential`, teardown that deletes created
`auditEvent`, `outboxEvent`, `session`, and fixture rows, and no reliance on test ordering
across files.

### Prove it fails

Revert `packages/auth` to the flat `permissionsForRoles` union on a scratch branch and run this
suite. It must fail on the cross-tenant cases. Capture the output — that artifact is the
subject of §5.

---

## 5. WP1.3 — Produce the vulnerability-proof artifact

"Pre-fix failed with `can is not a function`" is a compilation error. It documents an API
rename, not a security defect. There is currently no evidence in the repository that the
cross-tenant hole ever existed.

You need that evidence. Not for the codebase — for the lender security review, the EUDR
auditor, and anyone doing technical diligence on ClyCites. "We fixed it" is worth much less
than "here is the test that demonstrates it, here is the output, here is the commit that
closes it."

Create `docs/security/2026-08-wp1-cross-tenant-authorization.md` containing:

1. **The defect.** `principalForUser` flattened roles across all memberships; `PermissionsGuard`
   checked `request.params.organizationId` only when present; ten controllers had no such
   param.
2. **Reachability.** The concrete request a `COOPERATIVE_ADMIN` at co-op A could make against
   co-op B's pilot participants, with the HTTP verb and path.
3. **Demonstration.** The §4 suite run against the pre-fix model, with real output showing a
   `200` where a `403` belongs.
4. **The fix**, with commit references.
5. **The regression barrier** — the meta-test, and what it now makes impossible.
6. **Exposure assessment.** Was this ever deployed anywhere with real tenant data? If the
   answer is no because there are no real users yet, write that down explicitly. It is the
   most important sentence in the document and it will not be true forever.

---

## 6. WP1.4 — Audit `@SelfScopedList()`

This marker is a scope bypass by construction: it tells the guard "there is no single
organization here, let the service filter." That is legitimate for list endpoints and dangerous
everywhere else.

Verify and enforce:

1. The guard permits `SelfScopedList` **only** when every required permission is a read
   permission. Define "read" explicitly — a permission whose value ends in `.read`, plus any
   documented exceptions listed in code. Anything else must throw at guard evaluation.
2. The meta-test fails if a `SelfScopedList` route requires a non-read permission.
3. Every current `SelfScopedList` route has service-layer filtering by
   `principal.memberships`. Enumerate them in the PR with the file and line of the filter. A
   route with the marker and no filter is an open endpoint.
4. Add an integration test per `SelfScopedList` route: the Org A admin's list response must
   contain zero Org B records.

Report the full list of routes carrying this marker. If it is more than a handful, that is
itself a finding.

---

## 7. WP1.5 — File the `operations/overview` regression

Making it `PlatformScope` was the correct fail-closed call and the reasoning was sound: it
mixes membership-filtered records with global readiness, backup, notification, and outbox data,
so a self-scoped marker would have leaked global data to cooperative admins.

But cooperative admins have now silently lost their operations view. Do not let that ship
unremarked.

- Open a tracked issue: split `operations/overview` into a membership-scoped view and a
  platform-only global view.
- Note the behaviour change in the PR description and in ADR 007.
- Check whether `apps/web` calls this endpoint for non-platform users. If it does, the web app
  now shows an error to cooperative admins — report it; do not fix it in this PR.

---

## 8. Definition of done

- Every command in §2 passes, or has a documented pre-existing failure with an issue filed.
- `pnpm lint`, `pnpm test:e2e`, and `pnpm test:security` have **actually been executed** and
  their output included.
- The meta-test enumerates routes from the running Nest container, has no skip path, asserts
  count floors, and has been demonstrated failing on: a removed annotation, a conflicting
  double annotation, a param pointing at a nonexistent path parameter.
- The tenancy suite boots the real app, uses real bearer tokens from real logins, covers all
  ten controllers across all seven shapes in the table, and includes positive controls.
- The dual-membership (`COOPERATIVE_ADMIN` at A + `BUYER` at B) fixture exists and is exercised.
- `docs/security/2026-08-wp1-cross-tenant-authorization.md` exists with real captured output.
- `SelfScopedList` is constrained to read permissions, enforced in both guard and meta-test,
  and every route carrying it has a verified service-layer filter and a leak test.
- The `operations/overview` regression is filed and documented.
- Guarded-route and guarded-controller counts are re-established from the rebuilt meta-test and
  reported alongside the `grep` cross-check.

## 9. What not to do

- Do not build a new test harness. One exists.
- Do not reintroduce static module traversal.
- Do not mock `ScopeResolverService` in the integration suite. Resolution is the thing under
  test.
- Do not start WP2, and do not make WP2 changes "while you are in there."
- Do not delete or rewrite the phase-one through phase-eight specs to accommodate new fixtures.
  If they conflict, isolate your fixtures.
- Do not report a suite as green without stating which commands were run verbatim.

## 10. Report back

1. The §2 baseline table.
2. For each of §3–§7: what changed by file, the deliberate-failure output, the passing output.
3. Guarded-route and guarded-controller counts, from the meta-test and from `grep`, and an
   explanation if they differ.
4. Anything found that this brief did not anticipate — especially any further place where
   authorization is decided outside `PermissionsGuard`.
5. Any point where you were tempted to weaken a constraint, and what you did instead.
