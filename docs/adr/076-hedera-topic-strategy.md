# 076. Hedera topic strategy

## Status

Proposed.

## Context

Every anchor ClyCites has ever produced goes to one topic, named by a single `HEDERA_TOPIC_ID`
environment variable, with the worker defaulting to `0.0.424242`. That was never a decision;
it is what a single variable in a single process naturally produces, and it held while
anchoring was mock-only and single-tenant in practice.

Three properties of that arrangement matter now that real submission is imminent.

**Sequence numbers are the tenant list.** A topic's sequence numbers are dense, public and
monotonic. Anyone watching a shared topic learns the exact rate at which the whole platform
transacts, and by correlating with the timestamps in `MARKETPLACE_LISTING_PUBLISHED` and
`ORDER_DISPATCHED` responses, can partition that traffic by cooperative with fair accuracy.
The message payload is keyed; the traffic pattern is not. This is the main argument against
one topic and it is not addressed by anything in the payload design.

**One key signs for everyone.** A single operator key on a single topic means a compromise
of the worker is a compromise of every cooperative's ledger record simultaneously, with no
containment boundary and no ability to rotate one tenant without rotating all.

**Blast radius on failure.** A topic that becomes unavailable, or whose submit key is lost,
takes the whole platform's anchoring with it.

Against that, one topic is cheap, simple, and gives a single global ordering that makes
reconciliation straightforward — the reconciliation worker currently scans one topic.

## Decision

Move to one topic per organization, created lazily on the organization's first eligible
anchor and recorded on the organization row. Keep `HEDERA_TOPIC_ID` as an explicit override
for local and test environments, where a shared topic is the sensible default.

Per-organization, not per-entity or per-event-type: entity-level topics multiply topic
creation cost without adding a privacy boundary that the keyed references do not already
provide, and the cooperative is the unit that actually has an adversarial relationship with
other tenants.

Do not implement this before the testnet cost and latency measurement. Topic creation has a
cost and a latency of its own, and it happens on a tenant's first anchor — that is, inside a
user-visible path — so the measurement should cover creation, not only submission.

## Consequences

Reconciliation must iterate topics rather than scan one, and the confirmation worker must
resolve a topic per anchor rather than read it from configuration. Both already read
`topicId` from the anchor row rather than from configuration, so the change is smaller than
it first appears.

Onboarding a cooperative acquires a chargeable Hedera operation. That cost must be visible
in the pilot budget rather than discovered in an invoice.

Batching, which is the obvious response to per-message cost, becomes less effective because
messages can only be batched within a topic. This is a real cost of the decision and is
recorded rather than argued away. Batching is deferred regardless: a batched message
loses the one-message-one-event correspondence that makes the current verification protocol
explainable, and that trade should not be made before there is measured evidence that
per-message cost is actually a constraint.

## Alternatives rejected

**Keep one topic and accept the traffic disclosure.** Defensible for a single-cooperative
pilot, indefensible once two cooperatives who compete for the same buyers are on the platform.

**One topic per event type.** Optimises for the reader who wants all settlements, which is
nobody outside the platform, and worsens the traffic-analysis problem by making the traffic
self-labelling.
