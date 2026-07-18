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

Future modules require correction workflows, device revocation, signed or
attested sensitive operations where justified, rate limiting, backup restoration exercises, and
incident response procedures. This document must be revisited for every external integration.
