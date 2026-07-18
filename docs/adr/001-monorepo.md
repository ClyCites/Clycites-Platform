# ADR 001: TypeScript monorepo

## Status

Accepted

## Context

Web, API, workers, and shared contracts must evolve together with consistent tooling.

## Decision

Use pnpm workspaces and Turborepo in one strict TypeScript repository.

## Consequences

Atomic changes and shared checks are simple. CI caching improves, but package boundaries and task
dependencies require discipline.

## Alternatives considered

Separate repositories increased coordination and version skew. npm/yarn workspaces offered less
alignment with the chosen tooling and efficient pnpm store.
