# ADR 031: Authoritative financial settlement and manual payment reconciliation

## Status

Accepted

## Decision

PostgreSQL is authoritative for sale proceeds, lineage allocations, deductions, farmer
settlements, statements, payment instructions, attempts, and reconciliation. Money is stored in
minor units and allocation arithmetic uses exact integers with deterministic largest-remainder
rounding. A settlement snapshots source versions and lineage before approval; approved totals and
terminal payment evidence are immutable.

Recording and approval are separate actions. A user cannot verify proceeds they recorded, approve
a policy or payment destination they created, approve a settlement they submitted, approve a
payment instruction they created, or confirm reconciliation evidence they matched.

Payment destinations are encrypted with AES-256-GCM under a dedicated 32-byte key. API responses,
logs, jobs, audits, and Hedera payloads contain only masked identifiers or privacy-safe hashes.
BullMQ jobs contain only instruction identifiers and expected versions. The supported providers
are `manual` and `mock`; submission is not payment completion. Only separately reviewed,
amount-and-currency-matched evidence moves an instruction to `COMPLETED`.

Hedera receives hashes for settlement approval, statement issuance, and confirmed payment. It does
not receive farmer identity, payment destinations, external references, or evidence documents and
never controls a financial transition.

## Consequences

Financial history remains reproducible and auditable under retries and concurrent actions. The
platform does not custody funds, provide escrow or wallets, issue tokens, lend, score credit,
insure, file tax, or act as a general ledger. Real payment providers require a later provider and
operational-security decision.
