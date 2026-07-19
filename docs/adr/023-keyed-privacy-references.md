# ADR 023: Keyed privacy references

## Status

Accepted

## Decision

Represent organizations, entities, and superseded anchors on HCS with versioned, domain-separated
HMAC-SHA-256 references. Plain database identifiers are forbidden.

## Consequences

Public correlation is reduced, while secret custody and historical key-version retention become
operational requirements.
