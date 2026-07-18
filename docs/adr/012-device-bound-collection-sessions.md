# ADR 012: Device-bound collection sessions

## Status

Accepted

## Context

Offline snapshots and mutations must be limited after device loss or reassignment.

## Decision

Bind each collection session to an active organization, collection point, assigned user, and
registered device. Require the matching open session for snapshots and delivery creation. Revocation
suspends open sessions.

## Consequences

Revocation has an immediate server-side control point. Agents must open a new session when devices or
collection points change.

## Alternatives considered

User authentication alone cannot distinguish lost devices. Permanent device secrets were rejected
because Phase 2 uses the existing short-lived web session and server-side assignment checks.
