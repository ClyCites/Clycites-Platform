# Agent Brief — WP9: Hiero SDK Migration & Security Gate

**Paste as the opening message to a coding agent in `ClyCites/Clycites-Platform`.**

**Version:** 1.0
**Sequencing:** Part of §3 baseline closeout in the Master Brief. Do this **before** starting
WP2, because it is what makes `pnpm test:security` runnable as a gate.
**Size:** Small. One dependency change, one import statement, one script, one config block.

---

## 1. What this fixes and why

`pnpm audit --prod` currently reports three advisories, all reaching production through
`@hashgraph/sdk@2.81.0`:

| Severity | Package | Path |
|---|---|---|
| high ×2 | `image-size` | `@hashgraph/sdk → @hashgraph/cryptography → react-native-get-random-values → react-native → @react-native/community-cli-plugin → metro → image-size` |
| low | `elliptic` | `@hashgraph/sdk → @ethersproject/abi → … → @ethersproject/signing-key → elliptic` |

The Hedera SDK was pulling React Native and the Metro bundler into a NestJS backend, because
`@hashgraph/cryptography@1.17.0` declared `react-native-get-random-values` as a hard dependency
rather than an optional peer.

**This is already fixed upstream.** Verified against the npm registry:

- `@hiero-ledger/cryptography@1.20.1` no longer depends on `react-native-get-random-values`
  (nor on `crypto-js`, `tweetnacl`, `spark-md5`, `buffer`, `utf8`), having moved to
  `@noble/curves`, `@noble/hashes`, `@noble/ciphers`, `@scure/base`, and `@scure/bip32`.
- `@hiero-ledger/sdk@2.86.2` replaced every `@ethersproject/*` package with `ethers@6.16.0`,
  which uses `@noble/curves` instead of `elliptic`.
- `@hiero-ledger/proto` moves from `2.26.0-beta.3` to stable `2.31.0`.

So the upgrade clears all three advisories on its own. **Do not add `pnpm.overrides` for
`elliptic` or `image-size`** — they would be pinning packages that no longer appear in the tree.

Separately, `@hashgraph/*` is on a deprecation path: since v2.70.0 the SDK has been dual-
published under both namespaces, and development will continue solely under `@hiero-ledger`.
This migration is required eventually regardless of the security benefit.

---

## 2. The change

### 2.1 Dependency

`packages/hedera/package.json`:

```diff
-    "@hashgraph/sdk": "2.81.0",
+    "@hiero-ledger/sdk": "2.86.2",
```

Keep the exact pin — no caret. Confirm `2.86.2` is still `dist-tags.latest` before committing;
if a newer stable exists, use it and say so.

### 2.2 Import — the only source change in the repository

`packages/hedera/src/sdk-provider.ts` is the sole import site. Verify with:

```bash
grep -rn "@hashgraph" --include="*.ts" --include="*.tsx" apps packages | grep -v node_modules
```

```diff
 import {
   Client,
   Hbar,
   PrivateKey,
   TopicCreateTransaction,
   TopicMessageSubmitTransaction,
-} from '@hashgraph/sdk';
+} from '@hiero-ledger/sdk';
```

`@clycites/database`, `apps/api`, and `apps/worker` consume this through the
`@clycites/hedera` workspace package and need no changes.

### 2.3 Watch for these when it compiles

Five minor versions and a dependency swap. The five imported symbols are core stable API and
should be unaffected, but check:

- **`bignumber.js` 9.1.1 → 11.1.2** is a major bump, and `Hbar` is built on BigNumber. If any
  code calls `.toBigNumber()`, `.toTinybars()`, or compares Hbar values, exercise it.
- **`@ethersproject/*` → `ethers@6.16.0`** — only matters if anything reaches into ethers types
  through the SDK's public surface. Unlikely here, since ClyCites submits HCS topic messages and
  uses no EVM features.
- **`protobufjs` 8.0.0 → 8.6.6** — should be transparent.

If the SDK API has changed under any of the five imports, report it rather than working around
it.

---

## 3. Verification

```bash
pnpm install
pnpm audit --prod                          # expect: 0 vulnerabilities
pnpm why react-native image-size elliptic  # expect: not found
pnpm --filter @clycites/hedera typecheck && pnpm --filter @clycites/hedera test
pnpm --filter @clycites/api typecheck && pnpm --filter @clycites/api lint
```

Then the full suite against the isolated database:

```bash
export DATABASE_URL='postgresql://clycites:clycites_local@localhost:5432/clycites_wp1_history?schema=public'
pnpm --filter @clycites/api test && pnpm --filter @clycites/api test:e2e
pnpm openapi:check
```

Also run the Hedera CLI entry points, since they exercise the SDK more directly than the test
suite does — they should fail on missing credentials, not on missing exports:

```bash
pnpm hedera:config
```

Report the lockfile diffstat and the package-identity delta using the same `awk` extraction as
the earlier lockfile review. Expect a large **reduction** — React Native, Metro, and the
`@ethersproject` family all leave the tree. A net increase means something is wrong.

---

## 4. Make `test:security` a real gate

This gate has never executed. Set a policy that can actually pass and then run it.

In the root `package.json`:

```json
"test:security": "pnpm audit --prod --audit-level high"
```

Rationale, to be recorded in the ADR:

- **Production dependencies gate on high and critical.** After this migration that is zero, so
  the gate passes and stays meaningful.
- **Dev dependencies are report-only.** The `undici` advisories (one high, four moderate) reach
  the tree solely through `jsdom ← vitest` across nine devDependency paths, and the `vitest`
  critical requires `vitest --ui` to be listening — never true in CI or production. Add a
  separate `test:security:dev` script running plain `pnpm audit` for visibility.
- **Any accepted advisory is allowlisted by GHSA ID with a one-line justification**, never
  silently omitted.

Add a `docs/security/dependency-policy.md` recording this, so the next reviewer sees a decision
rather than an omission.

---

## 5. Commits

Three, separately:

1. `chore(deps): migrate @hashgraph/sdk 2.81.0 to @hiero-ledger/sdk 2.86.2` — body explains the
   namespace deprecation **and** that this removes the React Native/Metro chain and `elliptic`,
   citing GHSA-w3rx-r6r6-pgpr, GHSA-5p2g-fcmc-qvqq, GHSA-848j-6mx2-7j84.
2. `chore: regenerate lockfile after SDK migration` — if pnpm produces churn beyond the removal.
3. `build: gate test:security on prod high+critical` — with the policy doc.

---

## 6. What not to do

- Do not add `pnpm.overrides` for `elliptic` or `image-size`.
- Do not file an upstream issue about `react-native-get-random-values` — already fixed in
  `@hiero-ledger/cryptography@1.20.1`.
- Do not touch the anchor provider's behaviour. Real Hedera submissions remain deliberately
  excluded; this is a dependency change, not a functional one.
- Do not change `@hashgraph/hedera-wallet-connect` or any other `@hashgraph/*` package unless it
  appears in the tree — verify with the grep in §2.2 first.
- Do not silence an advisory to make the new gate pass.

## 7. Report back

1. `pnpm audit --prod` before and after.
2. The lockfile package-identity delta — removed and added.
3. Any SDK API change encountered under the five imported symbols.
4. Confirmation that `pnpm hedera:config` fails on credentials rather than on imports.
5. The `dist-tags.latest` value at the time of the change, in case it moved past `2.86.2`.
