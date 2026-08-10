# ADR 039: Ordered JWT signing key ring

## Status

Accepted

## Context

A single symmetric access-token secret makes routine rotation invalidate every live token or require
a coordinated outage.

## Decision

Configure an ordered HS256 key ring whose entries have unique `kid` values. Sign with the first key
and verify only with the configured key selected by the token's `kid`. Keep the previous key during a
rotation window and remove it after all tokens it signed have expired.

Apply a configurable clock tolerance, limited to 300 seconds and defaulted to 120 seconds. Reject a
missing or unknown `kid`; do not try every key.

## Consequences

Rotation is a rolling configuration change. Operators must preserve key order and unique identifiers,
and production configuration must supply non-local key material.

## Alternatives considered

JWKS, asymmetric signing, and KMS integration were rejected as unnecessary operational complexity
for the current deployment. Verification by trial against every key was rejected because `kid` is
the explicit rotation contract.
