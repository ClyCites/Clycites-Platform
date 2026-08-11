# 077. Trust layer invariants

## Status

Accepted.

## Context

WP15 set out to make anchoring real rather than mock. The work was framed as hardening, but
what it mostly did was establish which of the trust layer's stated properties were actually
true. Three were already true and had simply never been tested. Six were not true.

Two of the six were the same shape and are worth stating plainly, because they are the kind
of defect that a per-field test suite cannot see: **a whole class of events was missing from
the ledger, and the platform reported success throughout.**

- `BATCH_SPLIT` and `BATCH_MERGED` were never anchored. Both were routed to the batch payload
  builder by a `startsWith('BATCH_')` test, but their aggregate identifier is a
  transformation, so the builder looked up a batch that did not exist and returned `null`.
  `prepare()` returning `null` is indistinguishable from "not eligible", so the outbox event
  was consumed and marked handled. Sixteen transformation events were emitted; fifteen were
  anchored; there were zero split rows in `TraceabilityEvent`.
- `BATCH_TRANSFORMATION_SUPERSEDED` was emitted but absent from `EVENT_TYPE_MAP`. The
  original transformation's anchor stayed `CURRENT` on the ledger indefinitely while the
  platform had already replaced it.

The unit fixture that should have caught the first of these answered every query with the
same row, so a lookup for a nonexistent batch succeeded. A stub that answers every query is a
stub that cannot fail.

A third defect of the same character was found only by talking to the real network.
`RestMirrorProvider.findByTransactionId` queried a Mirror Node endpoint that does not exist,
using a transaction id format the REST API does not accept — the SDK renders
`0.0.7998683@1786462294.805192286`, the API wants `0.0.7998683-1786462294-805192286`. Both
mistakes return HTTP 404, which the provider maps to "no confirmation". **Against a real
mirror node no anchor could ever have been confirmed.** Every test used the in-memory mock
mirror, which resolves transaction ids from a map, so nothing exercised the URL or the format.
See `docs/operations/hedera-testnet-measurement.md`.

## Decision

The following are invariants of the trust layer. Each is enforced by a named test rather than
by review.

**Coverage is decided, not assumed.** Every event type the platform emits must be classified
either as an eligible anchor source or as deliberately unanchored. Enforced end-to-end
against the real database by `apps/api/test/anchor-coverage.spec.ts`, which reads the
distinct event types actually present in `OutboxEvent`. A new event type that nobody has
classified fails the suite.

**No eligible class is silently dropped.** Every eligible event type that has been emitted
must have produced at least one `TraceabilityEvent`. This is the assertion that caught both
transformation defects and is the reason it is stated at class granularity rather than per
event: the failure mode is absence, not corruption.

**One builder.** On-ledger messages are constructed only by `buildAnchorMessage()` in
`packages/hedera/src/index.ts`. There were four divergent copies plus a fifth in a test;
the submission, confirmation and reconciliation workers could each compute a different digest
for the same anchor. Rebuilding from identical source must produce identical bytes.

**No farmer identity or location on the ledger.** Asserted against the serialised payload
bytes with a deny-list built from the real seeded farmer rows — number, names, phones, email,
village, parish, date of birth, and farm plot centroid coordinates — not from a hand-written
list that drifts from the schema.

**Payload shape changes are deliberate.** A golden file per anchor event type, 27 entries,
compared byte-for-byte. A payload change that is not accompanied by a golden update is a
failure.

**Supersession is publicly resolvable.** A correction must carry `supersedesPayloadHash` and
`supersedesTransactionId`, both readable by a verifier who has only mirror node access.
`supersedesAnchorRef` remains for internal use but is not a public mechanism. Forward
resolution is served by `GET /api/v1/public/verify/anchors/{transactionReference}`, which
returns 404 for an unknown reference rather than inventing a status.

**The API never holds a submission key.** Boot fails if `HEDERA_OPERATOR_KEY` is present.
The guard existed; the root `.env` still carried the key, so it had never been exercised in
the real deployment shape.

**Submission implies confirmation.** Enabling submission without confirmation is a boot
failure. It is not a degraded mode — it strands every anchor in `SUBMITTED` forever while
appearing to work.

**Errors are classified by status, not by message text.** `classifySubmissionError` is
exported and tested, and prefers the SDK's structured status over substring matching, so
that a retryable network fault is never misread as permanent.

**Mirror Node lookups are tested against the real API's grammar.** `toMirrorNodeTransactionId`
is exported and tested, and the two-request confirmation path is covered by a test that fakes
both responses and asserts the exact paths requested. Mock-only coverage of an external API is
not coverage of that API.

## Consequences

`DELIVERY_ADDED_TO_BATCH` was relabelled from entity type `DELIVERY` to `BATCH`, which
changes per-entity chain grouping. A database reset is required to move to the corrected
shape; existing rows are not migrated, because anchors are append-only by design and
rewriting history to fix a labelling error is precisely the thing this layer exists to
prevent.

`BATCH_ADDED_TO_LOT`, `COOPERATIVE_LOT_SEALED` and `TRACEABILITY_RECORD_CORRECTED` remain
mapped with no producer. They are recorded as dead entries in
`docs/security/anchor-payload-inventory.md` rather than deleted, pending a decision on
whether the corresponding domain events should exist.

`prepare()` still returns `null` for both "unknown type" and "not eligible". Making it throw
was considered and rejected: builders legitimately decline for state reasons, such as a
settlement that is not yet approved. The coverage spec is the compensating control, and it
is a better one, because it checks the outcome rather than the intent.

Verification remains incomplete in one respect that no test can close: the canonical payload
is never published, so an outside party can verify timing and non-repudiation but not
content. That is documented as the gating decision in
`docs/architecture/anchor-verification-protocol.md`.
