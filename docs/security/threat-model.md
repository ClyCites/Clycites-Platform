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
