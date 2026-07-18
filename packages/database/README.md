# Database package

PostgreSQL is the authoritative store. This package owns the Prisma schema, migrations, generated
client, and lifecycle-aware database service.

The foundation uses standard UUIDs. UUIDv7 would improve insertion locality, but relying on it would
require a PostgreSQL extension or application library that is not consistently available across the
supported local and hosted environments. Client-generated UUIDs can be introduced through an ADR
when offline domain records are implemented.
