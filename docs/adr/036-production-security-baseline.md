# ADR 036: Production startup and dependency security baseline

## Status

Accepted

## Decision

Production startup requires an HTTPS web origin, secure refresh cookies, disabled interactive API
documentation, and non-local token, payment-encryption, and Hedera-reference secrets. Proxy trust
is explicit and defaults to zero hops. Browser API calls have a 15-second deadline composed with
caller cancellation.

CI uses a frozen lockfile, scans tracked files for common credential patterns, checks migration
status, and rejects moderate-or-higher production dependency advisories. Compatible transitive
overrides are permitted when the patched release remains within the parent package's accepted
major contract and runtime tests cover the affected integration.

## Consequences

Insecure production defaults fail early and dependency remediation is reproducible. The current
Hedera dependency tree retains one low-severity `elliptic` advisory because the stated patched
version is not published; Hedera remains testnet/mock constrained and this residual risk must stay
visible until an upstream release removes it.
