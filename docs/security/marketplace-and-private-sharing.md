# Marketplace and private sharing security

All marketplace and commerce routes require an authenticated principal, an organization-scoped URL,
and a granular permission. Services independently verify that the organization is the seller, buyer,
offer submitter, offer counterparty, amendment requester, or amendment counterparty required by the
action. A URL organization ID is never sufficient ownership proof.

Commercial state changes use strict Zod request contracts, positive versions where the model supports
optimistic concurrency, fixed-decimal quantity strings, three-letter currencies, and integer
minor-unit money strings. Serializable row locking prevents competing acceptances or releases from
creating negative or duplicated availability. Audit and outbox records commit with the domain state.

Public marketplace reads expose listing and approved lot merchandising data, not farmer or private
lineage records. Traceability shares are limited to one named buyer, explicit scopes, and an expiry.
Revocation clears the token hash and immediately denies reads. Shared responses are built from a
field allowlist; do not replace this with direct Prisma serialization. Access tokens, password hashes,
farmer identity, phone numbers, villages, internal notes, and Hedera/operator secrets are prohibited.

Hedera payloads contain minimal identifiers, quantities, status facts, hashes, and keyed privacy
references. They do not contain contract prose, buyer contact data, access tokens, or payment data.
Production settlement and payment threats are outside Phase 5 and require a new threat-model review.
