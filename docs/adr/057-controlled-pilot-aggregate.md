# ADR 057: Controlled pilot aggregate

**Decision:** Use a PostgreSQL pilot aggregate with centralized server-side transitions, optimistic
versioning, append-only status events, audit, and transactional outbox records. Clients request actions
and never submit a destination status.
