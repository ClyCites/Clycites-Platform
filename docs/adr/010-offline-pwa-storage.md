# ADR 010: Offline PWA storage

## Status

Accepted

## Context

Rural collection must continue through intermittent connectivity without storing credentials or
mixing cooperative records.

## Decision

Use an installable Next.js PWA and Dexie IndexedDB stores partitioned by organization. Store limited
snapshots, session context, and an append-preserving operation queue. Delete local data at logout and
lock the previous partition on organization switch.

## Consequences

Agents can collect offline, but browser profiles become confidential operational stores and require
device-loss procedures. PostgreSQL remains authoritative.

## Alternatives considered

Native Android was excluded from Phase 2. Local Storage lacks structured transactions and capacity.
Caching API responses alone cannot represent mutation state safely.
