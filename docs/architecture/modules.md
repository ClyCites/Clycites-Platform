# Modules

The runtime is a modular monolith with web, API, and worker processes. Initial API infrastructure
modules are configuration, health, database, queue, and observability. Future domain modules will
own their application services, persistence access, REST controllers, and events.

Modules may depend on shared contracts and infrastructure ports. Domain modules must not import one
another's persistence internals. Cross-module workflows use application services or durable outbox
events. A shared database does not permit arbitrary cross-module writes.
