# Anchor verification protocol

How an outside party checks a ClyCites anchor, and — the part that was broken until WP15 —
how they follow a withdrawn record to the one that replaced it.

## What Hedera proves, and what it does not

A Hedera Consensus Service message proves that a specific byte sequence was submitted by the
holder of a specific account key and assigned a consensus timestamp and sequence number that
cannot afterwards be altered or reordered. That is the whole of it.

It does not prove that the weight was measured honestly, that the quality grade was assessed
competently, that the custody handover physically happened, or that the farmer named in the
platform is the farmer who delivered. Every public response carries this as an explicit
`limitation` string rather than leaving the reader to infer it.

## The message

`buildAnchorMessage()` in `packages/hedera/src/index.ts` is the only place an on-ledger
message is constructed. Until WP15 there were four divergent copies — one per worker plus a
dead one in the API — and a fifth inline in a test. They disagreed about which fields to
include, which meant the confirmation and reconciliation workers could compute a different
digest for the same anchor than the submission worker had published. `anchor-message.test.ts`
now asserts the property that matters: rebuilding from the same source yields identical bytes.

The message is `.strict()`, so an unknown key is a submission failure rather than a silently
widened envelope, and it fits well inside the 1024-byte practical budget even for the
longest event type with a full supersession block.

## Verifying a single message

1. Take the transaction reference and topic coordinates from the ClyCites public response, or
   read them off a mirror node.
2. Fetch the message from a mirror node using `mirrorNodeUrl`, which the API supplies.
3. Compare the `payloadHash` in the message with the one ClyCites published.

Step 3 is where verification currently stops. The canonical payload is not published, so the
digest is opaque to the verifier — see `docs/security/anchor-payload-inventory.md`. A
verifier can prove *when* ClyCites committed to a record, and that ClyCites has not changed
its story since. They cannot yet prove *what* the record said.

## Following a supersession

Corrections are append-only. A correction never rewrites the earlier message; it publishes a
new one and marks the earlier anchor `SUPERSEDED` in the platform database.

The earlier design carried only `supersedesAnchorRef`, an HMAC over the internal anchor
identifier. Because the key is private, an outside verifier reading the withdrawn message off
a mirror node had no way to discover that it had been withdrawn, still less to find the
replacement. **The ledger asserted a record as current that the platform had already
replaced.** That is the defect this protocol closes.

Two publicly resolvable fields were added to the message:

- `supersedesPayloadHash` — the digest of the record being withdrawn.
- `supersedesTransactionId` — its Hedera transaction reference.

Both are optional and null when the message is not a correction.

A verifier walks the chain backwards from any correction using `supersedesTransactionId`
alone, with no ClyCites involvement.

Walking *forwards* — from a message you already hold to the correction that replaced it —
cannot be done from the ledger, because at the time the withdrawn message was published its
replacement did not exist. That direction requires the platform:

```
GET /api/v1/public/verify/anchors/{transactionReference}
```

Unauthenticated, rate-limited to 60 requests per minute. It answers with one of three
statuses:

| Status | Meaning |
| --- | --- |
| `CURRENT` | This is the record ClyCites stands behind. |
| `SUPERSEDED` | Withdrawn by a later correction; `supersededBy` points to it. |
| `NOT_CONFIRMED` | Submitted but not yet confirmed by a mirror node. Consensus coordinates are absent, and the response says so rather than implying finality. |

An unrecognised transaction reference returns 404. It does not return an invented status —
`anchor-coverage.spec.ts` asserts this specifically, because "unknown" quietly rendered as
"not anchored" would be the kind of failure that reads as a successful verification.

The response contains ledger coordinates, both supersession pointers, a plain-language
`explanation` and the `limitation` above. It contains no organization identifier, no entity
identifier and no anchor identifier; the coverage spec asserts their absence against the
serialised body.

`GET /api/v1/public/verify/lots/{publicId}` carries the same `supersededBy` pointer, so a
consumer starting from a lot rather than a transaction reaches the same place.

## Key custody

The API refuses to boot if `HEDERA_OPERATOR_KEY` is present in its environment. Only the
worker submits. The check was already written but the root `.env` still carried the key,
which meant the guard had never actually been exercised against a real deployment shape; the
key now lives in `apps/worker/.env` and `.env.example` documents the split.

Mainnet additionally requires `HEDERA_MAINNET_ACKNOWLEDGEMENT=I_UNDERSTAND_MAINNET_CHARGES`.

A further guard was added in WP15: enabling submission without enabling confirmation is now
a boot failure in all three configuration schemas. That combination is not a degraded mode —
it strands every anchor in `SUBMITTED` permanently, with nothing to ever advance it, while
the dashboard shows anchors being produced.

## Measured behaviour

Submission takes about 0.6s and a message becomes readable on the mirror node about 5–7s
later; a correction is 813 bytes against a 1024-byte limit; each anchor costs about $0.001.
The confirmation path itself was broken until WP15 — see
`docs/operations/hedera-testnet-measurement.md`, which records the numbers and the defect the
measurement uncovered.
