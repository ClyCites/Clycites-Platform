# Threat model

Primary assets are farmer identity and contact data, delivery and quality records, settlement and
payment evidence, organization boundaries, credentials, and traceability integrity.

Key threats include stolen rural devices, offline replay or tampering, cross-organization access,
privilege escalation, forged weights or corrections, queue replay, object URL leakage, log exposure,
dependency compromise, and Hedera key theft. Foundational mitigations include UUID/idempotency
records, append-only operations, transactional outbox, strict validation, request IDs, redaction,
least-privilege roles, private object storage, dependency scanning, and mock-only local Hedera.

Future modules require authorization tests, correction/audit workflows, device revocation, signed or
attested sensitive operations where justified, rate limiting, backup restoration exercises, and
incident response procedures. This document must be revisited for every external integration.
