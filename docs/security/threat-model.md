# Threat model

Primary assets are farmer identity and contact data, delivery and quality records, settlement and
payment evidence, organization boundaries, credentials, and traceability integrity.

Key threats include stolen rural devices, offline replay or tampering, cross-organization access,
privilege escalation, forged weights or corrections, queue replay, object URL leakage, log exposure,
dependency compromise, and Hedera key theft. Phase 1 mitigations include Argon2id password hashing,
short-lived signed access tokens, opaque rotating refresh cookies with server-side hashes and reuse
rejection, login throttling, active-user and active-membership checks, explicit permissions,
organization-scoped queries, append-preserving consent history, audit records, transactional outbox
writes, strict validation, request IDs, and PII-free QR payloads. Local Hedera remains mock-only.

Phase 2 adds active device assignment and revocation, open-session checks, organization-partitioned
local data, local deletion/locking hooks, canonical payload hashes, operation uniqueness, bounded
partial batches, optimistic locking, server-side fixed-point calculations, immutable correction and
receipt versions, and requester/reviewer separation. Residual risks include a stolen unlocked
browser profile before revocation, manual scale fraud, verbal-confirmation coercion, and local data
extraction from a compromised OS. Production deployments still require managed-device controls,
encryption at rest, backup restoration exercises, and incident response procedures.

Phase 3 adds quantity over-allocation, concurrent allocation, false lineage, unauthorized custody
receipt, and accidental public PII disclosure. Allocation writes lock source rows in deterministic
order, compare fixed-scale server totals with append-only ledger debits, and commit domain, audit,
and outbox records atomically. Public traceability uses a dedicated allowlisted serializer and never
returns farmer identities, delivery IDs, farm coordinates, private notes, user IDs, or audit data.

Phase 4 adds payload tampering, broken predecessor chains, duplicate queue delivery, ambiguous network
timeouts, forged Mirror responses, unknown topic messages, correlation of public identifiers, HCS key
theft, accidental mainnet use, and misleading integrity claims. Mitigations include strict versioned
canonicalization, keyed HMAC references, atomic outbox/trace/anchor writes, stable queue IDs,
conditional claims, no blind retry after unknown outcomes, full Mirror message comparison, bounded
checkpoint reconciliation, immutable anchor evidence, restrictive foreign keys, organization-scoped
queries, granular permissions, and dedicated public serializers. Operator keys and reference secrets
remain server-only and must be stored and rotated through managed secret infrastructure. Residual
risks include compromised domain inputs, colluding operators, stolen signing keys, Mirror outages,
metadata timing correlation, and canonicalization defects. HCS confirmation proves neither farmer
identity nor original weight, quality, custody, or location accuracy.

Phase 8 adds pilot-scope overlap, lifecycle bypass, false training/baseline claims, CSV injection and
resource exhaustion, object substitution, duplicate farmer creation, anonymous-feedback
re-identification, support-case leakage, metric cherry-picking, and unilateral go/no-go decisions.
Mitigations include centralized transitions, optimistic versions, global-plus-pilot readiness checks,
service-level organization authorization, active-enrollment uniqueness, versioned training evidence,
10 MiB signed uploads, metadata and full-content SHA-256 verification, strict CSV schemas, formula-prefix
rejection, identifier-only jobs, row-level duplicate review, typed metrics with quality state, minimized
anonymous feedback, separate support/incidents, append-only decisions, evidence hashes, and two-person
approval. Residual risks include malicious but syntactically valid CSV content before external malware
scanning, colluding approvers, inaccurate field evidence, and compromised operator devices.
