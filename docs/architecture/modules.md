# Modules

The runtime is a modular monolith with web, API, and worker processes. Infrastructure modules cover
configuration, health, database, queue, observability, audit, and transactional outbox writes.
Phase 1 domain modules cover authentication, identity/authorization, users, organizations,
memberships, collection points, farmers, farms, consent, and farmer QR identities.

Modules may depend on shared contracts and infrastructure ports. Domain modules must not import one
another's persistence internals. Cross-module workflows use application services or durable outbox
events. A shared database does not permit arbitrary cross-module writes.

Organization-scoped controllers carry `organizationId` in the route. Guards authenticate the
access token and resolve current active memberships before permission checks. Services still scope
every database query by organization; route guards are not a substitute for persistence isolation.
