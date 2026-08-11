# Anchor payload inventory

Scope: every field ClyCites derives when it anchors a domain event, classified by disclosure
risk. Generated from `apps/api/src/anchoring/anchor-payload.golden.json`, which is itself
produced from the live payload builders in `anchor-eligibility.service.ts` and asserted
byte-for-byte by `anchor-payload.golden.test.ts`.

## The finding that changes how this document should be read

**The canonical payload is never submitted to Hedera. Only its SHA-256 hash is.**

The on-ledger message is a closed envelope validated by `anchorMessageSchema` (`.strict()`)
and built by the single shared `buildAnchorMessage()` in `packages/hedera/src/index.ts`. It
carries twelve fields: schema version, event type, organization reference, entity type,
entity reference, payload hash, occurred-at, and the four supersession fields. Nothing else
reaches a Hedera topic. No API returns a canonical payload; the payloads live only in
`TraceabilityEvent.canonicalPayload` inside the tenant database.

Two consequences follow, and they pull in opposite directions.

1. The brute-force concern usually raised about hashed identifiers — that an attacker with
   the payload and a small identifier space can enumerate preimages — **is not publicly
   reachable today**, because the public never sees a payload.
2. For exactly the same reason, **no third party can independently verify anything beyond
   "a hash with these coordinates was published at this consensus time"**. Hedera proves
   ordering and non-repudiation of an opaque digest. It does not, today, let an outside
   party check that the digest corresponds to the record ClyCites shows them.

The moment ClyCites publishes canonical payloads to make verification real, every raw field
in the tables below becomes public and every hash below becomes a brute-force target. This
document is therefore the gating artefact for that decision, not a description of a solved
problem. See `docs/architecture/anchor-verification-protocol.md`.

## Classification key

| Class | Meaning |
| --- | --- |
| `raw` | The literal value appears in the canonical payload. |
| `hash` | A SHA-256 digest of a structured value; reversible by enumeration if the input space is small. |
| `ref` | A keyed HMAC privacy reference (`hmacReference`), unenumerable without the secret. |
| `derived` | A value with no external referent (counts, units, enums, schema version). |

Privacy references are keyed by `ANCHOR_REFERENCE_SECRET` with a version tag. Losing the
secret makes old references unresolvable; leaking it makes every `ref` field enumerable.

## Envelope (every event type)

| Field | Class | Notes |
| --- | --- | --- |
| `schemaVersion` | `derived` | Canonical JSON version. |
| `eventType` | `derived` | One of 27 anchor event types. |
| `organizationRef` | `ref` | HMAC over `('ORGANIZATION', organizationId)`. |
| `entityType` / `entityRef` | `derived` / `ref` | Entity class in the clear, identifier keyed. |
| `payloadHash` | `hash` | SHA-256 of the canonical payload. |
| `occurredAt` | `raw` | Domain event timestamp. |
| `supersedesAnchorRef` | `ref` | Internal-only; not resolvable by an outside verifier. |
| `supersedesPayloadHash` | `hash` | Publicly resolvable pointer to the withdrawn message. |
| `supersedesTransactionId` | `raw` | Publicly resolvable pointer to the withdrawn message. |

`organizationId` also appears `raw` inside the canonical payload of every event type. That
is safe only under the finding above.

## Delivery family

`DELIVERY_ACCEPTED`, `DELIVERY_CORRECTED`, `RECEIPT_ISSUED`, `DELIVERY_ADDED_TO_BATCH`

| Field | Class | Notes |
| --- | --- | --- |
| `eventId`, `deliveryId`, `deliveryPublicId` | `raw` | Internal identifiers. |
| `farmerReferenceHash` | `ref` | The only farmer-derived value. No name, phone, number, village or plot coordinate is ever included — asserted by `anchor-payload-privacy.test.ts` and by the e2e deny-list in `test/anchor-coverage.spec.ts`, which builds its forbidden set from the real seeded farmer rows. |
| `commodityCode`, `commodityFormCode`, `quantityUnit` | `derived` | Reference data. |
| `netQuantity` | `raw` | The measured figure; the point of anchoring. |
| `qualitySummaryHash` | `hash` | Small input space — grade enums and integer scores. Enumerable if payloads are ever published. |
| `receiptChecksum` | `hash` | Binds the farmer-facing receipt document. |
| `acceptedAt`, `recordVersion` | `raw` / `derived` | |

`DELIVERY_ADDED_TO_BATCH` reuses the delivery payload but is correctly labelled
`entityType = 'BATCH'` since its aggregate is the batch. This was a defect fixed in WP15;
it had been grouping the per-entity chain wrongly.

## Batch and lot family

`BATCH_CREATED`, `BATCH_SEALED`, `BATCH_ADDED_TO_LOT` /
`LOT_CREATED`, `LOT_SEALED`, `LOT_QUALITY_APPROVED`

| Field | Class | Notes |
| --- | --- | --- |
| `batchId`/`lotId`, `batchPublicId`/`lotPublicId` | `raw` | |
| `quantity`, `status`, `sealedAt` | `raw` / `derived` | |
| `contributionHashes` / `parentEventHashes` | `hash` | Each element is `hashPayload({ deliveryId, quantity })`. **These are the highest-risk hashes in the system.** A verifier who knows a delivery identifier can confirm the quantity by trial, and the list length discloses how many farmers contributed to a batch. |
| `qualitySummaryHash` | `hash` | As above. |

`BATCH_ADDED_TO_LOT` and `COOPERATIVE_LOT_SEALED` are mapped but their source events are
emitted nowhere in the codebase. They are dead map entries and should either be wired up or
removed; leaving them gives a false impression of coverage.

## Transformation family

`BATCH_SPLIT`, `BATCH_MERGED`, `TRANSFORMATION_COMPLETED`, `TRANSFORMATION_SUPERSEDED`

| Field | Class | Notes |
| --- | --- | --- |
| `transformationId`, `batchId` inside `outputs` | `raw` | Published unkeyed while every sibling identifier in the envelope is keyed. Inconsistent; safe only under the finding above. |
| `transformationType` | `derived` | |
| `parentEventHashes` | `hash` | Same concern as the batch family. |
| `outputs` | `raw` | Quantities and units per output batch. |
| `replacedByTransformationRef` | `ref` | `TRANSFORMATION_SUPERSEDED` only. |
| `supersessionReasonHash` | `hash` | The operator's free-text reason is hashed, never published. The privacy test plants a farmer name in that field and asserts it does not survive. |

Two defects in this family were found and fixed in WP15.

- `BATCH_SPLIT` and `BATCH_MERGED` **were never anchored at all**. Both routed to the batch
  payload builder on a `startsWith('BATCH_')` test, but their aggregate identifier is a
  transformation, so the builder found no batch and returned `null`. Every split and merge
  was silently absent from the ledger. The test fixture that should have caught this
  answered every query with the same row, so it could not fail.
- `BATCH_TRANSFORMATION_SUPERSEDED` was emitted but absent from `EVENT_TYPE_MAP`. The
  superseded transformation's anchor therefore stayed `CURRENT` on the ledger forever while
  the platform had already replaced it — the ledger asserting as current a record the
  platform knew to be withdrawn.

Note a cosmetic artefact: `transformationType` reads `"TRANSFORMATION"` in the `BATCH_SPLIT`
golden because all three transformation goldens are generated from one shared fixture row.

## Custody, commerce and settlement

| Event type | Raw | Keyed or hashed |
| --- | --- | --- |
| `CUSTODY_TRANSFER_CONFIRMED` | `custodyTransferId`, `lotId`, `quantity`, `receivedAt` | `recipientOrganizationReference` |
| `MARKETPLACE_LISTING_PUBLISHED` | `listingId`, `listingPublicId`, `lotPublicId`, `listedQuantity`, `currency`, `pricingMethod`, `publishedAt` | — |
| `OFFER_ACCEPTED` | `offerId`, `offerPublicId`, `listingId`, `quantity`, `unitPriceMinor`, `totalAmountMinor`, `acceptedAt` | `buyerOrganizationReference` |
| `SALES_CONTRACT_ACTIVATED` | `contractId`, `contractPublicId`, `lotId`, `quantity`, `totalAmountMinor`, `activatedAt` | `buyerOrganizationReference` |
| `ORDER_DISPATCHED`, `ORDER_RECEIVED`, `SALES_ORDER_COMPLETED` | `orderId`, `orderPublicId`, `contractId`, `lotId`, `custodyTransferId`, `quantity`, `status`, `milestoneAt` | `buyerOrganizationReference` |
| `BUYER_ACCEPTANCE_RECORDED` | `acceptanceId`, `orderId`, `decision`, `acceptedQuantity`, `decidedAt` | `buyerOrganizationReference` |
| `SETTLEMENT_APPROVED` | `approvedAt`, `recordVersion` | `settlementReference`, `lineageSnapshotHash`, `approvalDigest` |
| `FARMER_STATEMENT_ISSUED` | `statementVersion`, `issuedAt` | `statementReference`, `settlementReference`, `statementChecksum` |
| `PAYMENT_CONFIRMED` | `confirmedAt` | `reconciliationReference`, `paymentInstructionReference`, `confirmationDigest` |

**Prices are anchored in the clear.** `unitPriceMinor` and `totalAmountMinor` in
`OFFER_ACCEPTED` and `SALES_CONTRACT_ACTIVATED` are the commercial terms of a private
bilateral deal. The settlement family, by contrast, publishes only digests — no farmer, no
amount. The inconsistency is deliberate at the settlement end and accidental at the
commerce end; it must be resolved before payloads are published.

## Correction family

`TRACEABILITY_RECORD_CORRECTED`, `TRACEABILITY_RECORD_SUPERSEDED` carry only
`schemaVersion`, `eventId`, `eventType`, `organizationId`, `entityId` — all `raw`. The
substance of a correction lives in the superseding event, not here.

`TRACEABILITY_RECORD_CORRECTED` has no emitting source event; it is a dead map entry.

## Liveness

Of the 27 anchor event types, `BATCH_ADDED_TO_LOT`, `COOPERATIVE_LOT_SEALED` and
`TRACEABILITY_RECORD_CORRECTED` have no producer anywhere in the codebase. The remainder are
exercised by the end-to-end suite. `test/anchor-coverage.spec.ts` enforces two invariants
against the real database: every event type the platform emits is classified either eligible
or deliberately unanchored, and every eligible type that has been emitted has produced at
least one `TraceabilityEvent`. That second assertion is what caught the two transformation
defects; a per-type unit test could not have, because the defect was a whole class of events
being absent rather than a wrong field within one.

## Open items

1. Decide whether canonical payloads are published. Everything above is conditional on it.
2. If they are: key `transformationId`/`batchId`, salt or key `qualitySummaryHash` and the
   contribution hashes, and reconsider clear-text prices.
3. Wire up or delete the three dead event types.
4. `prepare()` returns `null` indistinguishably for "unknown event type" and "known type,
   not currently eligible". Making it throw was considered and rejected — builders
   legitimately decline for state reasons, such as a settlement not yet approved. The
   coverage spec is the compensating control.
