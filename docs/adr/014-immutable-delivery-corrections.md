# ADR 014: Immutable delivery corrections

## Status

Accepted

## Context

Accepted weights, prices, quality facts, and confirmations affect farmer trust and cannot be edited
in place without losing evidence.

## Decision

Corrections require a reason and separate reviewer. Approval creates a new immutable delivery and
child-fact version linked with `supersedesDeliveryId`; the original becomes `CORRECTED`. State
concurrency uses a separate `lockVersion`.

## Consequences

History is explainable and self-approval is blocked in permissions, service logic, and the database.
Queries must distinguish current and historical versions.

## Alternatives considered

In-place updates and soft-deleted replacements were rejected because both obscure the facts shown on
the original receipt.
