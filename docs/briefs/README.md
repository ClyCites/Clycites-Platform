# Authentication Briefs

Working documents for the ClyCites authentication effort, August 2026. Drop these in
`docs/briefs/` so agents can read them from the repository rather than from pasted text.

## Precedence

Highest first. This resolves a contradiction that existed between earlier documents.

1. **The codebase.** Any factual claim in any document may be stale — verify before trusting.
   WP4.5 described a defect that did not exist; WP7 may have enforced a rule against routes that
   do not exist yet.
2. **`authentication-backbone.md`.** Owns *design*: which axes exist, how they compose, what the
   invariants are.
3. **The work-package briefs.** Own *implementation and sequencing*: how to build it, in what
   order.

A brief contradicting the backbone on design loses and gets amended. The backbone contradicting
a brief on implementation mechanics loses.

## The documents

| File | Role | Status |
|---|---|---|
| `clycites-auth-backbone.md` | **Design of record.** Read this first. | Current |
| `clycites-auth-master-brief.md` | Sequencing, owner decisions, WP7 origin spec | Current |
| `clycites-auth-remediation-brief.md` | Original WP0–WP6 survey | Superseded in parts |
| `clycites-wp1-hardening-brief.md` | WP1 verification rebuild | Complete |
| `clycites-wp1-hardening-addendum.md` | Baseline unblock, pre-fix evidence capture | Complete |
| `clycites-wp9-hiero-sdk-brief.md` | Hiero SDK migration, security gate | Complete |
| `clycites-wp2-3-4-brief.md` | Session binding, login hardening, hygiene | Complete |
| `clycites-wp5-6-7-brief.md` | WP4-R, WP5, WP7; WP6 amendments | In progress |
| `clycites-wp6-farmer-auth-brief.md` | Farmer identity, credentials, subject axis | Not started |

Two documents contain content superseded elsewhere. `clycites-auth-remediation-brief.md` §WP1
was rebuilt by the hardening brief, and its §WP5 is expanded in `wp5-6-7`. Read the later
document where they overlap.

## Known state, 2026-08-10

**Done:** WP1 (three-axis authorization, fail-closed guard, closed role set, route meta-test),
WP1 hardening, WP9, WP2 (session-bound tokens), WP3 (login hardening), WP4 (hygiene).

**Reported done, needs verification:** WP7. It was built ahead of WP5 and WP6. Backbone §5.1
denies device sessions on `@SubjectScoped` routes — but that marker belongs to WP6, so if no
route carries it, the rule is unreachable and its test passes vacuously. Check with
`grep -rn "SubjectScoped" apps/api/src --include=*.ts`.

**Not started:** WP4-R, WP5, WP6.

WP5 is the one that matters most: `UserStatus` defaults to `INVITED`, login requires `ACTIVE`,
and no path exists between them. Every user in the system came from the seed script.

## Open owner decisions

- **Branch policy.** `staging` serves as both working and integration branch. Every gate in
  these briefs assumes they are different. Either protect it, or delete the PR language.
- **Mail transport.** Without one, password reset generates a token that is never delivered.
  Provider choice involves deliverability from Uganda, cost, and DPA implications. Pilot blocker.
- **Auth audit retention**, and whether farmers may read their own authentication history via
  `/me`. Both are counsel questions — backbone §7.
- **Consent withdrawal limits.** `SETTLEMENT_DEDUCTION` against outstanding advances;
  `DATA_PROCESSING` legal floor during an active contract. Counsel, not code.
- **Estate access** after a farmer is marked `DECEASED`.

## Not part of this effort

The ClyCites Kernel specification and the earlier architecture plan predate this work and were
explicitly dropped. Do not reconcile against them.
