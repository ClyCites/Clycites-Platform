# Phase 5 marketplace and fulfillment

The authoritative flow is approved inspected lot -> listing -> offer negotiation -> reservation ->
two-party sales contract -> order -> custody transfer -> buyer inspection and acceptance -> completed
order. Seller and buyer organization IDs are stored on every commercial aggregate so reads and
actions can be constrained without inferring ownership from UI state.

Listings expose only approved lot inventory. `listedQuantity` is immutable inventory intent and
`availableQuantity` is reduced only by accepted offers. Partial reservations remain discoverable and
accept further offers. Pause hides a listing without releasing commitments; close ends remaining
availability; cancellation is limited to commitments that can still be safely unwound. Offers use
integer minor-unit money and fixed-decimal quantities. The current submitting party may withdraw;
the counterparty may reject or counter.

Contract, reservation, and pre-dispatch order cancellation share one allocation restoration rule.
The transaction locks the commercial row, listing, and lot, restores no more than the listed
quantity, preserves terminal listing states, and clears the lot sale hold only when no active,
contracted, or consumed reservation remains. The expiration worker uses `FOR UPDATE SKIP LOCKED` and
is idempotent across overlapping worker instances.

Private traceability shares are seller-created, buyer-specific, scope-limited, expiring, and
revocable. The response is assembled from an allowlist for lot summary, quality, custody, lineage,
and documents. Farmer IDs, contact details, internal notes, credentials, and unrestricted records are
never included. PostgreSQL remains authoritative; mock Hedera evidence covers selected publication,
offer acceptance, contract activation, order, buyer acceptance, and completion milestones.
