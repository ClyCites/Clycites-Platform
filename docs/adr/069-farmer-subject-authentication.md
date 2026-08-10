# ADR 069: Farmer subject authentication

## Status

Accepted

## Context

Farmers need direct access to their own records across every cooperative while staff access remains
organization-scoped. A person may be both a farmer and cooperative staff. Farmers commonly know a
printed farmer number or phone number rather than an email address, and many require in-person
credential recovery.

## Decision

Use one authenticated principal with an optional `farmerId`, not separate staff and farmer principal
types. Populate `farmerId` only for an active, non-deleted linked farmer. Organization permissions
and farmer-self permissions are independent predicates; platform administration does not bypass the
subject predicate.

Subject-scoped `/me` routes deliberately cross organization boundaries and always filter directly on
`principal.farmerId`. A dual-role user's memberships continue to authorize staff routes but never
widen `/me` results.

Accept one login `identifier` and classify it deterministically: an `@` means email, the phone-shaped
pattern means phone, and everything else means username. Canonical storage is lowercase for email
and username and E.164 for phone. Usernames cannot be numeric because a numeric username could
shadow another account's phone number. Changed identifiers remain HMAC-only retirement records and
are unavailable for 180 days by default.

Staff-assisted reset is the primary farmer recovery path. A cooperative administrator verifies the
farmer in person, issues a single-use 24-hour code, and never handles the new password. Verified
email supports a secondary six-digit, ten-minute OTP. Credential delivery remains synthetic through
the queue and console provider; email and SMS provider integrations remain deferred.

Farmer passwords have an eight-character minimum with breach-list screening and the existing
per-account lockout. Staff, buyers, and platform administrators retain the twelve-character minimum.
This deliberate tradeoff avoids driving low-frequency farmer users toward shared or written-down
credentials while retaining online guessing controls.

## Consequences

The subject axis can return records from multiple organizations, so every subject route requires a
cross-farmer isolation test. Staff reset is a privilege-escalation surface and requires organization
membership validation, audit events, rate limiting, session revocation, and a durable farmer-visible
notification. Identifier classification cannot fall back to another column after a miss.

Estate access after a farmer is deceased, the legal floor for data-processing withdrawal, and the
handling of settlement-deduction withdrawal with outstanding advances remain owner decisions.
