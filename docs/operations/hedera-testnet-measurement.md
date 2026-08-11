# Hedera testnet measurement, August 2026

Measured with `pnpm hedera:measure <sampleCount>`
(`tools/hedera-testnet-measure.ts`), five samples against topic `0.0.9703202` on testnet.
The script is not wired into any test or CI job; it spends real testnet HBAR and is run by hand.

## Result

```json
{
  "network": "TESTNET",
  "topicId": "0.0.9703202",
  "samples": 5,
  "allMessagesMatched": true,
  "messageBytes": 813,
  "submitMs": { "p50": 634, "p95": 724 },
  "confirmMs": { "p50": 5617, "p95": 6729 }
}
```

Each sample submits the worst-case message: a correction, which carries the full supersession
block and is therefore the largest envelope the system produces. `allMessagesMatched` means
every message read back from the mirror node was byte-identical to the one submitted.

## Cost

From the mirror node transaction record for a measured submission:

```
charged_tx_fee: 979985 tinybars = 0.00979985 HBAR
```

At the configured `HEDERA_USD_PER_HBAR=0.10`, that is **about $0.00098 per anchor**, or
roughly **$1 per thousand anchors**. The configured cap `HEDERA_MAX_TRANSACTION_FEE_USD=1`
is three orders of magnitude above the observed cost, which is a safe cap but not a useful
alarm — a fee that had somehow risen a hundredfold would still pass it.

For scale: a cooperative running a thousand deliveries a season produces on the order of a
few thousand anchors once batches, transformations, lots, custody, commerce and settlement
events are counted. Anchoring cost is not a constraint at pilot scale.

**This is the evidence against batching.** Batching was raised as a response to per-message
cost. At $0.001 per message there is no cost problem to solve, and batching would cost the
one-message-one-event correspondence that makes the verification protocol explainable.
Recommendation: do not batch. Revisit only if a per-organization topic strategy plus real
volume changes the arithmetic.

## Latency

Submission returns in about 0.6s; the message is readable on the mirror node about 5–7s after
submission. The confirmation worker's poll interval and timeout should be read against those
numbers: a timeout below about 15s would produce spurious `UNKNOWN_OUTCOME` results under
normal conditions.

Submission does not await a receipt, so the 0.6s is not on any user-visible path. Nothing in
the product waits for consensus.

## Message size

**813 bytes against a 1024-byte limit.** That is 21% headroom on the worst case, and it is
less comfortable than it sounds: most of the envelope is fixed-width hashes and privacy
references, so adding one more 64-hex reference field costs about 90 bytes, or a third of the
remaining margin. Two more such fields would exceed the limit and turn every correction into
a `HEDERA_MESSAGE_TOO_LARGE` permanent failure.

`anchor-message.test.ts` asserts the budget for the longest event type. That assertion should
be treated as a hard design constraint rather than a smoke test.

## Defect found by this measurement

The first run failed with `Sample 0 never appeared on the mirror node`, while a direct query
of the topic showed all five messages present and correct.

`RestMirrorProvider.findByTransactionId` was querying
`/api/v1/topics/messages?transaction.id=...`. That endpoint does not exist, and the SDK's
transaction id format — `0.0.7998683@1786462294.805192286` — is not the format the REST API
accepts, which is `0.0.7998683-1786462294-805192286`. Both the wrong-endpoint and
wrong-format errors return HTTP 404, which the provider maps to "no confirmation".

**Consequence: against a real mirror node, no anchor could ever have been confirmed.** The
confirmation worker would have polled to timeout on every anchor, and reconciliation's
`findSubmission` would have reported every successful submission as missing. Anchors would
have accumulated in `SUBMITTED` indefinitely — the exact failure the submission-implies-
confirmation guard was added to prevent, arriving instead from the code.

Every existing test used `MockMirrorProvider`, which resolves transaction ids from an
in-memory map, so no test exercised the URL or the format. This was only ever findable by
talking to the real network.

Fixed by a two-request lookup — transaction record for the consensus timestamp and topic,
then the topic message at that timestamp — with an exported `toMirrorNodeTransactionId`
converter, covered by three tests in `providers.test.ts` including one that fakes the two
responses and asserts the exact paths requested.

## Not measured

Topic creation cost and latency, which matters for the per-organization topic strategy in
ADR 076 because it lands inside a tenant's first anchor. That should be measured before that
ADR moves from Proposed to Accepted.
