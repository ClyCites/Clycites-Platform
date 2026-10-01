# ClyCites Authentication Backbone

**Status:** Design of record. WP2-WP8 implement this document.  
**Version:** 1.0  
**Date:** 2026-08-09

This is the design the work packages implement. The briefs are remediation-shaped - "fix this
defect" - and cannot be read as a system. This can. It is the artifact a security reviewer, a
lender's technical diligence, or a new engineer should be handed first.

When authentication artifacts disagree, established codebase facts take precedence. This backbone
owns the system design and composition; work-package briefs own implementation mechanics and
sequencing. Contradictions should be corrected in the artifact that exceeds that responsibility.

## 1. Populations

Four kinds of principal authenticate. They are not variations of one design; they differ in
identifier, credential, recovery, and authorization axis.

| Population       | Identifier             | Credential                                 | Recovery                            | Axis                 |
| ---------------- | ---------------------- | ------------------------------------------ | ----------------------------------- | -------------------- |
| Platform admin   | email                  | password + TOTP                            | second platform admin               | platform             |
| Staff and buyers | email, username        | password                                   | email reset                         | organization         |
| Farmers          | username, email, phone | password (8-character minimum)             | staff-assisted; email OTP secondary | subject              |
| Field devices    | device public ID       | device token bound to a `RegisteredDevice` | staff re-provision                  | organization, capped |

A single `User` row may hold more than one of these. A cooperative board member is staff _and_ a
farmer. A collection agent operates a device _and_ logs in on the web. The model must not force a
choice at login.

## 2. Identity

### 2.1 One user, three identifiers

`User` carries `username`, `email`, and `phone`, each `@unique`. Login accepts one `identifier`
field and classifies deterministically:

1. Contains `@` -> **email**.
2. Matches `^\+?[0-9][0-9\s()\-]{5,}$` -> **phone**.
3. Otherwise -> **username**.

Exactly one lookup follows, against the classified column. **No fallback across columns**. A
fallback reintroduces the ambiguity the classifier exists to remove.

This makes two registration constraints load-bearing rather than cosmetic: usernames may not be
purely numeric, and may not contain `@`. Without them, a user registers `256772123456` and shadows
another farmer's phone.

### 2.2 Canonical storage

Store the canonical form; never the raw input.

- Email: trimmed and lowercased.
- Phone: E.164 via `libphonenumber-js`, default region `UG`. `0772...`, `+256772...`, and
  `256772...` all collapse to `+256772...`. Without this the unique constraint is decorative.
- Username: trimmed, lowercased, 4-40 characters of `[a-z0-9._-]`, leading letter, not reserved.

Farmers default to `farmerNumber` lowercased - the one identifier already printed on their QR card
and therefore the one they cannot forget.

### 2.3 Retirement

A changed identifier enters `RetiredIdentifier` (hashed, never raw) and is unclaimable for 180 days.
Otherwise a released phone number or username becomes an inbound path to the previous owner's
recovery flows. Uganda's number-recycling rate makes this a live concern rather than a theoretical
one.

## 3. Sessions and tokens

### 3.1 Session is the unit of revocation

Everything hangs off a `Session` row. Access tokens are short-lived assertions _about_ a session,
never independent bearer credentials.

- **Access token:** JWT, 15 minutes, `jti` = `sessionId`. Verification loads the session and rejects
  unless it is live and the subject matches. This is what makes logout mean logout.
- **Refresh token:** 256 bits of CSPRNG, HMAC-SHA256 at rest (not Argon2 - it has full entropy and
  needs no memory-hard KDF), rotated on use; reuse revokes the session.

### 3.2 Two delivery channels, deliberately separate

- **Browser:** refresh token in an httpOnly cookie, unversioned path, `SameSite` chosen to match the
  deployment topology.
- **Device:** refresh token in the response body from `POST /auth/device/token`, bound to a
  `RegisteredDevice`.

Do not attempt to serve both from one endpoint via a header switch. The cookie flow and the body
flow have different threat models, different revocation triggers, and different TTLs.

### 3.3 Signing

HS256 with a `kid` header and an ordered key list: verify against current and previous, sign with
current. This converts key rotation from an outage into a rolling operation. No JWKS, no asymmetric
signing, no KMS.

## 4. Authorization - three axes

Permissions are never a flat list on the principal. They are a function of principal, permission,
and scope. Three scopes exist and they do not overlap.

```text
canPlatform(principal, permission)
  -> platformRole === PLATFORM_ADMIN and permission in PLATFORM_ADMIN_PERMISSIONS

can(principal, permission, organizationId)
  -> canPlatform(...) OR principal.memberships.get(organizationId) grants it

canAccessOwnFarmerRecord(principal, permission, recordFarmerId)
  -> principal.farmerId === recordFarmerId AND permission in FARMER_SELF_*
  -> no platform-admin bypass
```

Every route declares exactly one scope marker: `@PlatformScope`, `@OrgScopeFromParam`,
`@OrgScopeFromEntity`, `@SelfScopedList`, or `@SubjectScoped`. Two markers is a bug. Zero markers
denies, loudly, and fails the route meta-test.

**The role vocabulary is closed.** Eight roles, permissions defined statically, verified by a unit
test. Custom or database-defined roles are a deliberate architectural change that requires
revisiting this entire section - not a feature to be added incrementally.

### 4.1 The subject axis crosses tenant boundaries by design

A farmer delivering to two cooperatives sees both in one view. That is the product differentiator,
and it means `/me` routes are deliberately organization-unscoped - so the route meta-test, which
guards the organization axis, **cannot** detect a leak there.

The only things standing between that and a cross-tenant read are the per-route service filter on
`principal.farmerId` and the farmer-A-sees-zero-of-farmer-B tests. Those tests are load-bearing in a
way the others are not.

## 5. Composition rules

Three cases exist where two work packages are each internally correct and do not compose. None is
covered by an existing brief.

### 5.1 Device sessions must be denied on the subject axis - IMPLEMENTED

A collection agent may also be a farmer. Their device session is capped to the device's
organization. But `/me` routes are subject-scoped and carry no organization, so the cap does not
apply to them.

**Rule:** a session with `deviceId` set is denied on every `@SubjectScoped` route,
unconditionally. Device sessions exist for field data capture on a shared handset. Personal
delivery and settlement history must not be reachable from a device that four other people also
use.

Enforce in the guard, assert in the meta-test, and test explicitly.

Device credential exchange is also denied when the assigned user has enrolled in MFA. A device
session has no interactive MFA completion channel, so issuing one would create an unusable session
that fails this rule on its first request.

### 5.2 MFA is a property of the user, not of the axis - IMPLEMENTED

If a cooperative admin enrolls in optional TOTP and is also a farmer, does their `/me` access
require MFA?

**Rule:** yes. `Session.mfaSatisfiedAt` gates the session, not the route. An MFA-enrolled user has
every session subject to it regardless of which axis a given request uses. A second factor that a
user can sidestep by changing endpoints is not a second factor.

Corollary: farmers are never _offered_ MFA, but a farmer who is also staff and has enrolled is
subject to it on farmer routes too.

### 5.3 Password policy is per account class and needs one enforcement point - WP5

Staff and buyers: 12 characters. Farmers: 8, with aggressive per-account lockout and breach
screening.

**Rule:** a single validator takes the account class as an explicit argument. Never infer it from
role, membership, or the presence of a farmer profile - a dual-role user would then get whichever
policy the inference happened to pick. The provisioning flow declares the class; the validator does
not guess.

Record the 8-character farmer policy in the ADR as a deliberate, documented weakening for a
population that logs in twice a season and would otherwise write passwords down. It is not an
oversight, and it should not be silently "fixed."

## 6. Recovery

Recovery is where this system meets its users most painfully, and it is population-specific.

- **Platform admin:** a second platform admin. Never self-service. If only one exists, use a written
  break-glass procedure, not a code path.
- **Staff and buyers:** email reset. Token hashed, single use, 30 minutes, all sessions revoked on
  completion.
- **Farmers, primary:** staff-assisted at the cooperative. The cooperative already verifies farmers
  in person against a QR card and farmer number; in-person verification beats an OTP to a
  possibly-recycled SIM. Staff never learn the password: they trigger a single-use code the farmer
  redeems themselves.
- **Farmers, secondary:** email OTP, available only where `emailVerifiedAt` is set. Most
  smallholders have no email, which is precisely why this is secondary.
- **Devices:** staff re-provision. No self-service path.

**An unverified email or phone may authenticate but may never recover.** That single rule closes the
account-takeover path that three login identifiers would otherwise open.

### 6.1 Staff-assisted reset is a privilege-escalation surface

A cooperative admin who resets a farmer's password can then read that farmer's records at _other_
cooperatives - crossing the boundary the organization axis exists to enforce.

The controls make it detectable, not impossible: audit on initiation and redemption, a durable
farmer-visible notification that staff cannot dismiss, per-admin daily rate limits, and membership
verification before initiation. Making it impossible requires delivering the code through a channel
the initiating admin does not control - the one place SMS would earn its cost.

## 7. Audit - currently unspecified

`AuditEvent` is append-only and never mutated. But no brief states which authentication events are
mandatory or how long they are kept, and Uganda's Data Protection and Privacy Act 2019 has things to
say about both.

Minimum event set: login success, login failure (with hashed identifier, never raw), lockout, logout,
session revocation, password change, password reset initiated and completed, staff-assisted reset
initiated and redeemed, identifier change, MFA enrollment, MFA failure, recovery-code use, device
registration and revocation, consent grant and withdrawal.

**Open:** retention period, and whether farmers can read their own authentication history via `/me`.
Both are counsel questions, not engineering ones. They are called out here so they stop being
invisible.

## 8. Invariants

Each invariant should have a test whose failure is demonstrated before it is trusted.

1. No route reaches a handler without an explicit scope marker.
2. Permissions are never evaluated without a scope.
3. `FARMER_SELF_*` permissions are held by no role except `FARMER`, and `can()` never grants one.
4. A revoked session's access token is rejected immediately.
5. Login timing does not reveal account existence.
6. A device session is rejected on every subject-scoped route.
7. An MFA-enrolled user has no session that bypasses MFA.
8. Farmer A retrieves zero of farmer B's records on every subject-scoped route.
9. An identifier retired inside the cooldown cannot be claimed.
10. An unverified channel cannot initiate recovery.
11. Farmers hold exactly one write capability: consent withdrawal.
12. No secret - password, token, reset code, TOTP secret, raw identifier - reaches a log.

## 9. Deliberately excluded

SMS and telecom integration. Asymmetric signing, JWKS, SSO, OAuth, external identity providers.
Permission caching and JWT allowlists. Farmer write access beyond consent withdrawal. Biometrics.
Database-defined custom roles.

These are written down so they stop being reconsidered each session.

## 10. Implementation status

| Section     | Area                                        | Package | Status                   |
| ----------- | ------------------------------------------- | ------- | ------------------------ |
| 4           | Three axes, closed role set                 | WP1     | Merged; hardening merged |
| 3.1         | Session-bound access tokens                 | WP2     | Complete                 |
| -           | Login timing, account limiting, audit actor | WP3     | Complete                 |
| 3.1         | Refresh hashing, status codes, cookie path  | WP4     | Complete                 |
| 6           | Invitation, reset, change, verification     | WP5     | Complete                 |
| 2, 4        | Farmer identity, credentials, subject axis  | WP6     | Complete                 |
| 3.2, 3.3, 9 | Device sessions, MFA, key rotation          | WP7     | Complete                 |
| 5.1, 5.2    | Device and MFA composition                  | WP7     | Complete                 |
| 5.3         | Explicit account-class password policy      | WP5     | Complete                 |
| 6, 8, 12    | Credential email, terminal secret handling  | WP8     | Complete                 |

Sections 5.1 and 5.2 are implemented by WP7. Section 5.3 is implemented by WP5.
