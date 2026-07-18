# ADR 011: Fixed-point delivery calculation

## Status

Accepted

## Context

Binary floating point can produce inconsistent weights and money across clients and servers.

## Decision

Represent API quantities as decimal strings, money as minor-unit strings, PostgreSQL quantities as
fixed decimals, and money as `BIGINT`. Calculate authoritative totals with scaled `bigint` arithmetic
and half-up rounding on the server.

## Consequences

Serialization is explicit and arithmetic is reproducible. Clients may submit expected totals only
for mismatch detection.

## Alternatives considered

JavaScript numbers were rejected for precision. A general money library was unnecessary for the
single UGX minor-unit workflow and would not replace database constraints.
