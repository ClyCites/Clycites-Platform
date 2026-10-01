# ADR 068: Account-class password policy

## Status

Accepted

## Decision

Use one password validator with an explicit persisted account class. Staff and buyers require at
least 12 non-whitespace characters. Farmers require at least 8. Neither class has composition rules,
and both are screened against a local list of common passwords.

The provisioning flow declares `STAFF` or `FARMER`; the validator never derives it from a role,
membership, or farmer profile. This keeps dual-role accounts deterministic. The 8-character farmer
minimum is a deliberate weakening for people who may authenticate only a few times per season,
where a longer requirement is likely to produce written passwords. Aggressive per-account lockout
and breach screening are compensating controls.

## Consequences

A small local common-password list is materially weaker than a comprehensive breached-password
corpus. It avoids a new external dependency but remains a documented coverage gap. Expanding the
corpus or selecting a breach-screening provider requires a separate operational and privacy review.
