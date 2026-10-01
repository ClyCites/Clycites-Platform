# ADR 066: Preserve pilot referential integrity across Phase 9

## Status

Accepted on 2026-08-09.

## Context

Phase 8 migrations created 28 foreign keys and an index across the pilot subsystem, but the
corresponding Prisma relations were omitted from `schema.prisma`. Commit `1be1b03` repaired the
schema description without changing migration SQL.

The Phase 9 enterprise-dashboard migration on `Daniel-Dev` was generated before that repair. It
drops all 28 pilot foreign keys and the `PilotSupportCase_escalatedIncidentId_idx` index while
adding unrelated dashboard models. Repository history contains no earlier `PilotCreator` relation,
which confirms that the declarations were never removed intentionally. The drops are a schema
reconciliation side effect, not an enterprise-dashboard requirement.

## Decision

The Phase 8 constraints and index remain authoritative. Regenerate the Phase 9 migration on its own
branch against the repaired Prisma schema before integrating it. The regenerated migration must add
only the intended Phase 9 objects and must not drop pilot constraints or indexes.

Do not revert the repaired Prisma relations and do not accept destructive reconciliation SQL merely
to make migration drift disappear.

## Consequences

Phase 9 cannot integrate as commit `df70eec` currently stands. Its branch must incorporate the
schema repair from `1be1b03`, regenerate the unapplied migration, and prove that a database built
from migration history matches `schema.prisma`. Databases that already applied the old Phase 9
migration require a forward repair migration or recreation when no durable environment data exists.
