# Agent Brief — WP1 Hardening Addendum: Baseline Unblock & Pre-Fix Evidence Capture

**Paste this document together with "WP1 Hardening & Baseline Closeout" v1.0.** This addendum
amends that brief. Where the two conflict, this document wins.

**Version:** 1.1
**Amends:** WP1 Hardening & Baseline Closeout v1.0 — adds §0, replaces §5, extends §2.
**Reason:** WP1 was merged to `origin/staging` at `958859e` before its verification artifacts
were accepted. The baseline remains blocked by database drift (issue #17), a TypeScript
toolchain incompatibility, and a lockfile failure. Nothing downstream can proceed until this is
cleared.

---

## §0 — Establish position before changing anything

`origin/staging` currently contains WP1's production code **and** its rejected verification
artifacts. This is recoverable — there are no real users — but `staging` does not presently
mean "verified," and that has consequences for how you work.

### 0.1 Do not revert the merge

The production code from WP1 is wanted and correct: the scoped `memberships` principal,
`can`/`canPlatform`, the scope decorators, `ScopeResolverService`, the 229 route annotations,
and ADR 007. Only the **verification** was rejected. Reverting would discard good work to fix a
test problem.

All hardening work proceeds as a **forward fix** on a branch off current `staging`. Do not
rebase, do not revert, do not rewrite history.

### 0.2 Capture the pre-fix commit hash — do this first

This is the most perishable thing in the repository right now, and §5 depends on it.

```bash
git rev-parse 958859e            # the merge commit
git rev-parse 958859e^1          # staging tip immediately BEFORE WP1 landed
git log -1 --format='%H %ci %s' 958859e^1
```

`958859e^1` is the pre-fix state — the last commit where the cross-tenant authorization defect
was live. Record its full 40-character SHA. Write it into
`docs/security/2026-08-wp1-cross-tenant-authorization.md` immediately, in a stub file, before
doing anything else. If that hash is lost you cannot reproduce the vulnerability, and the
evidence artifact becomes a reconstruction rather than a demonstration.

Then confirm the schema was untouched by WP1:

```bash
git --no-pager diff --stat 958859e^1 958859e -- \
  packages/database/prisma/schema.prisma \
  packages/database/prisma/migrations
```

**Empty output is required for §5 to work**, because it means one database serves both the
pre-fix and post-fix worktrees. If it is not empty, stop and report — §5 needs a different
approach and you should not improvise one.

### 0.3 Mark staging as unverified

Add to `docs/adr/007-organization-authorization.md` a dated status line stating that the
authorization work merged at `958859e` has unaccepted verification, that the meta-test and
tenancy suite are being rebuilt, and that no work package after WP1 may branch from `staging`
until this brief's Definition of Done is met.

Remove that line in the final hardening PR. It is a tripwire for anyone who walks into the
repository this week, not permanent documentation.

---

## §2-EXTENDED — Clearing the baseline blockers

The hardening brief's §2 stands. These are the specific procedures for the three blockers that
stopped the previous attempt.

### 2.1 Database drift (issue #17) — the decision procedure

Do not reach for `migrate reset` or `db push` before completing this diagnosis. Run all four
and record the output of each.

```bash
export SHADOW_DATABASE_URL='postgresql://clycites:clycites_local@localhost:5432/clycites_shadow?schema=public'
createdb -h localhost -U clycites clycites_shadow || true

cd packages/database

# A. Headline status
pnpm exec prisma migrate status

# B. Do the migrations fully produce schema.prisma?
#    Empty output => migration history is complete.
pnpm exec prisma migrate diff \
  --from-migrations ./prisma/migrations \
  --to-schema-datamodel ./prisma/schema.prisma \
  --shadow-database-url "$SHADOW_DATABASE_URL" --script

# C. Does the live dev database match the migration history?
#    Non-empty output => drift.
pnpm exec prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-migrations ./prisma/migrations \
  --shadow-database-url "$SHADOW_DATABASE_URL" --script

# D. What does the live database contain that the migrations do not produce?
pnpm exec prisma migrate diff \
  --from-migrations ./prisma/migrations \
  --to-url "$DATABASE_URL" \
  --shadow-database-url "$SHADOW_DATABASE_URL" --script
```

Classify every difference from C and D into exactly one bucket:

| Bucket | Meaning | Action |
|---|---|---|
| **1** | Present in migrations, absent from the live DB | Replay fixes it. No work needed. |
| **2** | Present in `schema.prisma`, absent from migrations (B non-empty) | Generate the missing migration with `prisma migrate dev --name <descriptive>` **before** resetting. |
| **3** | Present in the live DB, produced by nothing | Someone ran `db push` or hand-edited. Decide per object: capture as a migration, or discard. |

**Bucket 3 is the only one where a reset destroys work.** Enumerate every bucket-3 object
explicitly in your report — table, column, index, constraint, enum value — with a
capture-or-discard recommendation for each. Do not decide unilaterally on anything that looks
like it holds data.

Once buckets 2 and 3 are resolved and committed as migrations:

```bash
pnpm exec prisma migrate reset --force    # dev database only
pnpm exec prisma migrate deploy
pnpm db:seed
pnpm exec prisma migrate status            # must report no pending migrations, no drift
```

The hardening brief's instruction to "resolve by migration, not by reset" exists to protect
**migration history**, not dev data. Replaying a complete and coherent history onto a clean
database satisfies it. There is no production database and no real tenant data — say so in the
PR so the reasoning is on record.

`prisma db push` remains forbidden at every step.

### 2.2 TypeScript toolchain

The reported incompatibility is with TypeScript 7. The decorator metadata that NestJS and Prisma
depend on is the likely fault line.

Pin the last known-good 5.x in the root `package.json`, and add a `pnpm.overrides` entry if a
transitive dependency is pulling 7 in. Do **not** loosen `tsconfig.json`,
`experimentalDecorators`, `emitDecoratorMetadata`, or `strict` to make the newer compiler pass.

Report: the version pinned, whether an override was needed, and the exact error that made 7
unusable — that last one is what tells you when it's safe to move.

### 2.3 Lockfile

`pnpm install --frozen-lockfile` failing means the lockfile and the manifests disagree.

Capture the exact error first. Then regenerate with `pnpm install`, commit the lockfile as its
own commit, and report `git diff --stat` on it. If the regenerated lockfile moves more than a
handful of packages, stop and report before continuing — a large unexplained dependency shift
during a security work package is its own problem.

---

## §5-REPLACED — Vulnerability proof from the pre-fix commit

**This replaces §5 of the hardening brief in full.** The original said to revert
`packages/auth` on a scratch branch. That is now unnecessary and weaker: the pre-fix state is a
real commit with a real hash you can cite.

### 5.1 The design constraint this imposes on the tenancy suite

The rewritten tenancy suite from §4 of the hardening brief must run **unchanged** against
`958859e^1`. That is only possible if it touches nothing WP1 introduced.

Therefore the suite must:

- Interact **only over HTTP**, via `supertest` against the booted application.
- Import nothing from `packages/auth` internals — no `can`, no `canPlatform`, no
  `AuthenticatedPrincipal`.
- Import nothing from `apps/api/src/identity/` — no decorators, no `ScopeResolverService`,
  no guard.
- Obtain tokens only through `POST /api/v1/auth/login`.
- Build fixtures only through Prisma models that exist on both sides of the merge.

This is not a stylistic preference. A suite that imports WP1 symbols cannot compile against the
pre-fix commit, and you lose the ability to demonstrate the defect. Treat any such import as a
build error.

### 5.2 Procedure

```bash
PREFIX_SHA=$(git rev-parse 958859e^1)

# Isolated checkout of the vulnerable state
git worktree add ../clycites-prefix "$PREFIX_SHA"
cd ../clycites-prefix
pnpm install

# Bring across ONLY the new tenancy suite — no other file
cp ../Clycites-Platform/apps/api/test/authorization-tenancy.spec.ts apps/api/test/

# Same database: §0.2 established the schema is identical across the merge
export DATABASE_URL='postgresql://clycites:clycites_local@localhost:5432/clycites?schema=public'
pnpm --filter @clycites/api exec vitest run test/authorization-tenancy.spec.ts \
  2>&1 | tee /tmp/prefix-tenancy-output.txt
```

Expected: the cross-tenant cases fail — a `200` where a `403` belongs. The positive controls
should still pass, which is what proves the suite is exercising the API rather than simply
erroring out.

If the suite fails to compile or every case errors, the suite is coupled to WP1 and §5.1 has
been violated. Fix the suite, do not fix the output.

Clean up with `git worktree remove ../clycites-prefix` when finished. Preserve the captured
output.

### 5.3 The artifact

Write `docs/security/2026-08-wp1-cross-tenant-authorization.md` containing:

1. **Identification.** Pre-fix commit `<PREFIX_SHA>`, fix merge `958859e`, hardening PR
   reference. Dates for each.
2. **The defect.** `principalForUser` flattened roles across all memberships;
   `PermissionsGuard` consulted `request.params.organizationId` only where present; ten
   controllers carried permissioned routes with no such parameter.
3. **Reachability.** The concrete request — verb, path, role, org — by which a
   `COOPERATIVE_ADMIN` at cooperative A reached cooperative B's pilot participants.
4. **Demonstration.** The verbatim captured output from 5.2, with the command used and the
   commit it ran against.
5. **The fix.** Scoped principal, `can`/`canPlatform`, declarative scope markers, fail-closed
   guard, 229 annotated routes.
6. **The regression barrier.** The rebuilt meta-test: what it enumerates, what it now makes
   impossible, and its count floors.
7. **Exposure.** Whether this was ever deployed with real tenant data. If the answer is no
   because ClyCites has no users yet, write that sentence explicitly and date it. It is the
   most important line in the document and it stops being true the first time a cooperative
   signs up.

This document is for a lender's security review, an EUDR auditor, and technical diligence. Write
it for a reader who does not know the codebase.

---

## §6 — Amended Definition of Done

The hardening brief's §8 stands, plus:

- The pre-fix SHA is recorded in the security document and the §0.2 schema check came back
  empty (or the discrepancy was reported and resolved before proceeding).
- Issue #17 is closed with the four diagnostic outputs and the bucket classification attached.
- `prisma migrate status` reports no pending migrations and no drift.
- The TypeScript pin is committed with the error that motivated it.
- The lockfile is regenerated in its own commit with a reported diffstat.
- The tenancy suite is demonstrably free of WP1 imports and has been run successfully against
  `958859e^1`.
- The ADR 007 tripwire line from §0.3 is added, then removed in the final PR.

## §7 — Report back

In addition to the hardening brief's §10:

1. The pre-fix SHA and the §0.2 schema diff result.
2. The four drift diagnostics verbatim, with every bucket-3 object enumerated and a
   capture-or-discard recommendation for each.
3. The pre-fix tenancy run: command, commit, and full output.
4. Any file in the tenancy suite that had to change to make it run against the pre-fix commit —
   and confirmation that the same file still passes against `staging`.
5. Anything in §0–§2 that turned out to be wrong about the repository's actual state.
