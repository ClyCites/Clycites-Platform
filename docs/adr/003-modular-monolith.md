# ADR 003: Modular monolith

## Status

Accepted

## Context

The product needs multiple cohesive business capabilities but does not yet need independent service teams.

## Decision

Implement domain capabilities as explicit NestJS modules in one API and one database, with a separate
worker process for asynchronous jobs.

## Consequences

Transactions, local development, and deployments stay understandable. Boundaries are conventions
enforced by imports and tests; careless shared-table access could erode them.

## Alternatives considered

Microservices introduced network contracts, distributed transactions, and operational burden too
early. A single unstructured application would make later capability ownership difficult.
