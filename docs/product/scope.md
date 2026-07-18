# Product scope

The initial product direction covers cooperative registration of farmers and farms, offline coffee
delivery and quality capture, traceable lot creation, buyer sales, transparent farmer settlement,
payment reconciliation, and selected Hedera event anchoring.

This foundation release establishes runtime, data, queue, contract, observability, and documentation
boundaries. It deliberately excludes domain implementations, authentication, payment rails,
cryptocurrency, tokens, smart contracts, and real Hedera transactions.

Success means future product increments can add cohesive modules inside the modular monolith without
changing the foundational deployment topology or duplicating contracts.
