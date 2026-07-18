# System context

Cooperative staff use the web application at collection points and offices. Buyers and public
verifiers use constrained web views. The web application calls the versioned REST API; the API owns
business transactions in PostgreSQL and schedules asynchronous work through Redis/BullMQ. The worker
processes queued jobs. MinIO stores objects outside relational rows.

Future integrations include identity providers, payment providers, and Hedera Consensus Service.
They must enter through explicit adapters. PostgreSQL remains authoritative; Hedera is evidence of
selected event hashes, not a business database.
