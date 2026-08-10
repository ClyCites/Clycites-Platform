# Agent Brief — ClyCites WP6: Farmer Authentication

**Paste this whole document as the opening message to a coding agent working in the
`ClyCites/Clycites-Platform` repository.** Read it in full before writing any code.

**Version:** 1.0
**Predecessors:** "Authentication & Authorization Remediation" v1.0 (WP1–WP5) and
"WP1 Hardening & Baseline Closeout" v1.0.
**Prerequisite:** WP1 Hardening must be **merged and accepted** before this brief starts. This
work extends the authorization model that brief is currently repairing; starting early means
building on an unverified foundation.

---

## 0. Decisions already made

These were decided by the repository owner. Do not relitigate them; implement them.

| Decision | Value |
|---|---|
| Do farmers authenticate? | **Yes** |
| Login identifiers | **Username, email, and phone — all three, all unique** |
| Credential | **Password** |
| Primary recovery | **Staff-assisted reset at the cooperative** |
| Secondary recovery | **Email OTP**, for the minority of farmers who have email |
| SMS / OTP over SMS | **Deferred.** Do not integrate Africa's Talking or any SMS provider. |
| Principal shape | **One principal type with an optional `farmerId`** — *not* a discriminated union |

### Why one principal and not a union

`Farmer.userId` is a nullable unique link to `User`. Nothing prevents a user from holding both
a farmer profile and organization memberships, and in a cooperative that is the normal case —
board and committee members are farmers. A `StaffPrincipal | FarmerPrincipal` union would force
those people to choose an identity at login. Use one shape with two independent predicates, and
enforce separation through the meta-test rather than the type system.

### Why staff-assisted reset is primary

`Farmer.email` is nullable because most smallholder farmers in rural Uganda do not have email.
A farmer who logs in once a season will forget their password. If email is the only recovery
path, that farmer is locked out permanently.

The cooperative already verifies farmers in person against a QR card and a farmer number.
In-person verification is *stronger* than an OTP delivered to a phone number that may have been
recycled. This is not a degraded fallback; it is the correct primary mechanism for this user
base.

---

## 1. Ground truth

Verified against the repository. Do not assume beyond this.

**Exists already:**

- `Farmer.userId` — `String? @unique @db.Uuid`, relation `FarmerUser` to `User`, `onDelete: SetNull`.
- `Farmer.farmerNumber` — `String @unique @db.VarChar(40)`. Human-readable, already on the QR card.
- `Farmer.primaryPhone`, `Farmer.alternativePhone`, `Farmer.email` — all nullable, none unique.
- `Farmer.status` — `FarmerStatus` = `DRAFT | ACTIVE | SUSPENDED | INACTIVE | DECEASED`, default `DRAFT`.
- `User.email` — `String? @unique @db.VarChar(320)`.
- `User.phone` — `String? @db.VarChar(32)`, **indexed but NOT unique**.
- `User.passwordHash` — `String` **non-nullable**.
- `User.status` — `UserStatus` = `INVITED | ACTIVE | SUSPENDED | DISABLED`, default `INVITED`.
- `User.emailVerifiedAt`, `User.phoneVerifiedAt` — nullable, currently never read.
- `FarmerConsent` — has `capturedByUserId` (required), `captureMethod`, `status`, `withdrawnAt`.
- `ConsentType` = `DATA_PROCESSING | SMS_NOTIFICATIONS | TRACEABILITY | MARKETPLACE_VISIBILITY | SETTLEMENT_DEDUCTION`.
- `ConsentCaptureMethod` = `DIGITAL_SIGNATURE | CHECKBOX | PAPER_FORM | VERBAL_WITNESSED`.
- `DataSubjectRequest` model, related to `Farmer`.
- `ROLE_PERMISSIONS[ROLES.FARMER]` — an empty array.

**Does not exist:**

- `User.username` — no such column anywhere in the schema.
- `citext` extension — not enabled.
- Any self-service value on `ConsentCaptureMethod`.
- Any farmer-facing route.

**Migration hazards:**

- Adding `@unique` to `User.phone` will fail if duplicates exist. The seed sets no phone values,
  so seeded rows are null and Postgres permits multiple nulls — but check pilot and staging data
  before writing the migration.
- `User.passwordHash` being non-nullable means a farmer account cannot be provisioned before the
  farmer sets a password. §4 resolves this.

---

## 2. Non-negotiable constraints

All constraints from both predecessor briefs remain in force. Additionally:

1. **Farmers get exactly one write capability: consent withdrawal.** Everything else is read.
   No farmer may create, amend, or delete a delivery, batch, lot, settlement, farm, or QR
   identity. The append-only observation model depends on this.
2. **Subject scoping must never widen organization scoping.** A farmer's access derives from
   being the subject of a record, never from a membership. Do not let `canAccessOwnFarmerRecord`
   accept "the caller is an admin of an organization this farmer belongs to" — that is what
   organization-scoped routes are for. Keep the two axes independent.
3. **No SMS provider integration.** Deferred by decision.
4. **New dependencies:** `libphonenumber-js` is authorised for E.164 normalisation. Nothing
   else without asking.
5. **No public identifier-availability endpoint.** Three identifiers means three enumeration
   oracles; do not add a fourth by exposing "is this username taken".
6. **Unverified identifiers may authenticate but must never recover.** An unverified email or
   phone cannot receive a reset.

---

## 3. WP6a — Authorization model

### 3.1 Principal

Extend the WP1 principal:

```ts
export interface AuthenticatedPrincipal {
  readonly subjectId: string;          // User id
  readonly sessionId: string;
  readonly platformRole?: typeof ROLES.PLATFORM_ADMIN;
  readonly memberships: ReadonlyMap<string, Role>;   // may be empty
  readonly farmerId?: string;          // present iff an ACTIVE farmer profile is linked
}
```

`farmerId` is populated only when the linked `Farmer` has `status = ACTIVE` and
`deletedAt = null`. A `DRAFT`, `SUSPENDED`, `INACTIVE`, or `DECEASED` farmer profile yields no
`farmerId`, so every subject-scoped route denies automatically.

### 3.2 Predicate

```ts
export const canAccessOwnFarmerRecord = (
  principal: AuthenticatedPrincipal,
  permission: Permission,
  recordFarmerId: string,
): boolean =>
  principal.farmerId !== undefined &&
  principal.farmerId === recordFarmerId &&
  FARMER_SELF_PERMISSIONS.includes(permission);
```

Note what is absent: no platform-admin bypass. A platform admin reads farmer data through
organization-scoped or platform routes with their own audit trail, not by impersonating the
subject axis.

### 3.3 Permission set

Replace the empty `ROLE_PERMISSIONS[ROLES.FARMER]` with an explicit self-scoped set. Namespace
these distinctly so they can never be granted by an organization role:

```
FARMER_SELF_DELIVERY_READ
FARMER_SELF_SETTLEMENT_READ
FARMER_SELF_STATEMENT_READ
FARMER_SELF_FARM_READ
FARMER_SELF_QR_READ
FARMER_SELF_CONSENT_READ
FARMER_SELF_CONSENT_WITHDRAW      // the only write
FARMER_SELF_PROFILE_READ
FARMER_SELF_PRIVACY_REQUEST_CREATE
```

Assert in a unit test that no `ROLE_PERMISSIONS` entry other than `FARMER` contains any
`FARMER_SELF_*` permission, and that `can()` never returns true for one.

### 3.4 `@SubjectScoped()`

A fourth scope marker, subject to the same rules as `@SelfScopedList()` from the hardening
brief:

- Mutually exclusive with the other three markers; the meta-test fails on any route carrying two.
- Permitted only for `FARMER_SELF_*` permissions. Any other permission on a `@SubjectScoped`
  route fails at guard evaluation **and** in the meta-test.
- The guard denies unless `principal.farmerId` is present.
- Every `@SubjectScoped` route must filter on `principal.farmerId` in the service layer.
  Enumerate each one with the file and line of its filter in the PR.

### 3.5 The cross-tenant risk, stated plainly

A farmer delivering to two cooperatives sees both sets of records in one view. That is the
intended product behaviour and a genuine differentiator — and it means the subject axis
deliberately crosses the organization boundary WP1 sealed. The route is *supposed* to be
organization-unscoped, so the WP1 meta-test will not catch a leak here.

Compensating requirement: an integration test per `@SubjectScoped` route asserting that farmer A
receives zero of farmer B's records, including when A and B belong to the same cooperative, and
including when A is also staff at that cooperative.

---

## 4. WP6b — Identity: three unique identifiers

### 4.1 Schema

Add to `User`:

```prisma
username        String?   @unique @db.VarChar(40)
usernameSetAt   DateTime? @db.Timestamptz(3)
```

Add `@unique` to `User.phone`. Check for duplicates in every environment before the migration
runs; if any exist, stop and report rather than deleting rows.

Make `passwordHash` nullable and add a database CHECK constraint enforcing
`status <> 'ACTIVE' OR password_hash IS NOT NULL`. This lets staff provision a farmer account
that the farmer activates by setting their own password. Update every read site that assumes
non-null.

### 4.2 Normalisation — canonical storage only

Store the canonical form. Never store the raw input.

- **Email:** trimmed, lowercased.
- **Phone:** E.164 via `libphonenumber-js`, default region `UG`. `0772123456` and
  `+256772123456` and `256772123456` must all normalise to `+256772123456`. Without this the
  unique constraint is decorative.
- **Username:** trimmed, lowercased. Store lowercase only; there is no display form.

### 4.3 Username format — enforced at registration

- 4–40 characters, `[a-z0-9._-]`, must begin with a letter.
- **Must not be purely numeric** and **must not contain `@`**. This is a security constraint,
  not cosmetics: see §4.4.
- Must not be in a reserved list — at minimum `admin`, `administrator`, `root`, `system`,
  `support`, `help`, `api`, `clycites`, `platform`, `null`, `undefined`, plus every `ROLES` value
  lowercased.
- No two consecutive separator characters; no leading or trailing separator.

**Default username for farmers:** derive from `farmerNumber`, lowercased. Every farmer already
carries it printed on their QR card, so it is the one identifier they cannot forget. It contains
letters, so it cannot collide with the phone pattern. Farmers may change it later; staff may not
change it on their behalf.

### 4.4 Input classification — the takeover vector

The login endpoint accepts one `identifier` field. It must classify deterministically, in this
order:

1. Contains `@` → treat as **email**.
2. Matches `^\+?[0-9][0-9\s()\-]{5,}$` → normalise and treat as **phone**.
3. Otherwise → treat as **username**.

If usernames were allowed to be purely numeric, a user could register the username
`256772123456` and shadow another farmer's phone number, or capture login attempts intended for
them. The §4.3 constraints are what make this classifier safe. Add a test asserting that
registering a numeric username is rejected, and one asserting each of the three branches
resolves to the expected user.

Perform exactly one lookup, against the classified column. Do not fall back to searching the
other two columns on a miss — that reintroduces the ambiguity.

### 4.5 Retiring identifiers

When a user changes their username, email, or phone, the old value must not become immediately
claimable. Otherwise someone claims a recently released phone number or username and receives
that person's recovery flows.

New model:

```prisma
model RetiredIdentifier {
  id           String    @id @default(uuid()) @db.Uuid
  kind         IdentifierKind          // USERNAME | EMAIL | PHONE
  valueHash    String    @db.VarChar(64)   // HMAC-SHA256, never the raw value
  userId       String    @db.Uuid
  retiredAt    DateTime  @default(now()) @db.Timestamptz(3)
  claimableAt  DateTime  @db.Timestamptz(3)
  @@unique([kind, valueHash])
  @@index([claimableAt])
}
```

Cooldown of 180 days, configurable via `AUTH_IDENTIFIER_COOLDOWN_DAYS`. Registration and
identifier-change flows must check it. A `PLATFORM_ADMIN` may override with a recorded audit
event and a reason.

### 4.6 Verification state

`emailVerifiedAt` and `phoneVerifiedAt` are currently written by nothing and read by nothing.
For this work package:

- An unverified email or phone **may** be used to authenticate.
- An unverified email or phone **may not** receive a recovery flow (§6).
- Verification of email happens via the OTP flow in §6.2. Phone verification is deferred with
  SMS; leave `phoneVerifiedAt` null and do not fake it.

---

## 5. WP6c — Account provisioning and login

### 5.1 Provisioning

A cooperative staff member with the appropriate permission creates a farmer account for an
existing `ACTIVE` farmer. This creates a `User` with `status = INVITED`, `passwordHash = null`,
`username` derived from `farmerNumber`, and links `Farmer.userId`.

Activation: a single-use, expiring activation code is handed to the farmer in person or read to
them. Redeeming it sets their password and transitions the user to `ACTIVE`. Reuse the WP5
invitation machinery if it has landed; if not, build it here and note the overlap.

### 5.2 Login gating

Farmer login requires **all** of:

- `User.status = ACTIVE` and `deletedAt` null,
- `User.passwordHash` not null,
- linked `Farmer.status = ACTIVE` and `Farmer.deletedAt` null.

When a farmer transitions to `SUSPENDED`, `INACTIVE`, or `DECEASED`, revoke every session for
their linked user in the same transaction. Add a test for `DECEASED` specifically.

Estate and next-of-kin access after `DECEASED` is **out of scope**. Record it as an open
question; do not invent a policy.

### 5.3 Password policy

WP5 specifies a 12-character minimum. Applied to smallholder farmers, that guarantees written-
down and shared credentials, which is worse than a shorter password with real lockout.

Differentiate:

- **Staff, buyers, platform admins:** 12 characters minimum, unchanged.
- **Farmer accounts:** 8 characters minimum, with mandatory per-account lockout from WP3b and
  breach-list screening.

Record the tradeoff explicitly in the ADR. This is a deliberate, documented weakening for a
specific population, not an oversight — write it down so the next reviewer does not "fix" it.

### 5.4 Rate limiting

The WP3b per-account limiter applies to farmer login unchanged. Because there are now three
identifier types, key the limiter on the **resolved user id** where a user resolves, and on the
hashed normalised identifier where none does — otherwise an attacker rotates identifier types
to get three times the budget against one account.

---

## 6. WP6d — Recovery

### 6.1 Staff-assisted reset (primary)

A cooperative staff member with a new `FARMER_ACCOUNT_RESET` permission — granted to
`COOPERATIVE_ADMIN` only, never to `COLLECTION_AGENT` — initiates a reset for a farmer in their
own organization.

The flow must be built so the staff member never learns the password:

1. Staff initiates. System generates a single-use code, valid 24 hours, stored hashed.
2. The farmer redeems the code and sets their own password.
3. All of the farmer's existing sessions are revoked on redemption.

**This is a privilege-escalation surface and must be treated as one.** A cooperative admin who
can reset a farmer's password can otherwise read that farmer's records at *other* cooperatives
— crossing the boundary WP1 exists to enforce. Required controls:

- An `AuditEvent` on initiation recording the staff user, the farmer, and the organization.
- A second `AuditEvent` on redemption.
- A durable, farmer-visible notification: "your account was reset by {staff} at {organization}
  on {date}", readable from the farmer's own account and not dismissible by staff.
- Rate limit per staff user per day; alert above the threshold.
- Staff may only reset for farmers with an `ACTIVE` `FarmerOrganizationMembership` in an
  organization where the staff member holds the permission.

New model `FarmerAccountReset` with hashed code, `initiatedByUserId`, `organizationId`,
`expiresAt`, `redeemedAt`, `revokedAt`.

### 6.2 Email OTP (secondary)

Only available when `User.email` is present **and** `emailVerifiedAt` is not null. Six-digit
code, 10-minute expiry, single use, stored hashed, maximum 5 verification attempts before
invalidation.

`POST /auth/password-reset/request` returns `202` unconditionally regardless of whether the
account or email exists. Enqueue delivery via BullMQ and log that it would send — do not
integrate an email provider without asking.

On success, revoke all sessions and emit an audit event.

---

## 7. WP6e — Farmer-facing endpoints

All under `@SubjectScoped()`. No `organizationId` in any path; each returns the farmer's records
across every cooperative they deliver to.

```
GET    /me/profile
GET    /me/deliveries
GET    /me/deliveries/:deliveryId
GET    /me/settlements
GET    /me/statements
GET    /me/farms
GET    /me/qr-identities
GET    /me/consents
POST   /me/consents/:consentId/withdraw
POST   /me/privacy-requests
```

`GET /me/profile` must not expose `registeredByUserId`, internal audit fields, or any other
farmer's data.

Contact-detail updates are **not** included. Changing email or phone changes a login identifier
and must go through §4.5's retirement flow with verification — do not bolt it onto a farmer
self-service PATCH.

### Consent withdrawal

Add `SELF_SERVICE` to `ConsentCaptureMethod`. Withdrawal sets `status = WITHDRAWN` and
`withdrawnAt`; it never deletes the `FarmerConsent` row, and it never mutates any record already
captured under that consent. Consent governs future processing, not the historical log.

`capturedByUserId` on the withdrawal record is the farmer's own user id.

**Open question — do not decide alone.** `SETTLEMENT_DEDUCTION` withdrawal has live financial
consequences: a farmer withdrawing it mid-season may have outstanding advances against future
deliveries. `DATA_PROCESSING` withdrawal may have a legal floor the cooperative cannot go below
while a contract is active. Implement self-service withdrawal for `TRACEABILITY`,
`MARKETPLACE_VISIBILITY`, and `SMS_NOTIFICATIONS`. For `SETTLEMENT_DEDUCTION` and
`DATA_PROCESSING`, return `409` with a message directing the farmer to their cooperative, and
**report the question** for a legal decision.

---

## 8. Testing

Reuse the harness from `apps/api/test/phase-one.spec.ts`. Real app boot, real tokens, supertest.

New spec `apps/api/test/farmer-authentication.spec.ts` must cover:

- Login by each of the three identifier types resolving to the same user.
- `0772123456`, `+256772123456`, and `256772123456` all authenticating the same account.
- Numeric username rejected at registration.
- Reserved username rejected.
- Retired identifier not claimable inside the cooldown; claimable after.
- Login denied for `DRAFT`, `SUSPENDED`, `INACTIVE`, and `DECEASED` farmer status.
- `DECEASED` transition revoking live sessions.
- Farmer with deliveries at two cooperatives seeing both in `GET /me/deliveries`.
- **Farmer A receives zero of farmer B's records on every `@SubjectScoped` route**, including
  when both belong to the same cooperative.
- A farmer who is *also* a cooperative admin: staff routes work on the membership axis, `/me`
  routes return only their own farmer records, and the two do not blend.
- Farmer denied on every staff route they might reach.
- Staff-assisted reset: full flow, audit events present, notification visible to the farmer,
  sessions revoked, and a `COLLECTION_AGENT` denied the permission.
- A cooperative admin from org A denied reset for a farmer with no membership in org A.
- Email OTP reset refused for an unverified email.
- Self-service withdrawal succeeding for `TRACEABILITY` and returning `409` for
  `SETTLEMENT_DEDUCTION`.

Every one of these must be demonstrated failing before the fix, per the hardening brief's rules.

---

## 9. Definition of done

- All commands from the hardening brief's §2 baseline pass.
- The meta-test enforces `@SubjectScoped` exclusivity and the `FARMER_SELF_*`-only rule.
- Every `@SubjectScoped` route is enumerated in the PR with its service-layer filter location.
- Unit test proving no non-`FARMER` role can hold a `FARMER_SELF_*` permission.
- Migrations are additive; the `User.phone` unique migration reports duplicate checks per
  environment.
- `.env.example` documents `AUTH_IDENTIFIER_COOLDOWN_DAYS` and any new variables.
- New ADR covering: the single-principal decision and why not a union; the subject axis
  deliberately crossing organization boundaries; the three-identifier classifier and why
  usernames cannot be numeric; staff-assisted reset as primary recovery; the differentiated
  farmer password policy.
- `docs/security/` note on the staff-assisted-reset escalation surface and its controls.
- Open questions reported, not answered: estate access after `DECEASED`; legal floor on
  `DATA_PROCESSING` withdrawal; `SETTLEMENT_DEDUCTION` withdrawal against outstanding advances.

## 10. What not to do

- Do not integrate SMS. Do not add Africa's Talking.
- Do not give farmers any write capability beyond consent withdrawal.
- Do not let a platform admin authenticate through the subject axis.
- Do not add a public username-availability endpoint.
- Do not fall back across identifier columns when the classified lookup misses.
- Do not fabricate `phoneVerifiedAt`.
- Do not weaken the WP1 organization scoping to make a `/me` route work. If a `/me` route seems
  to need it, the route is wrong.

## 11. Report back

1. Duplicate-phone findings per environment, before the unique migration.
2. Every `@SubjectScoped` route, with its service-layer filter.
3. Deliberate-failure output and passing output for each test in §8.
4. The three open questions from §9, restated for decision.
5. Any point where you were tempted to weaken a constraint, and what you did instead.
