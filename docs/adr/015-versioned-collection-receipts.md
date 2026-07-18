# ADR 015: Versioned collection receipts

## Status

Accepted

## Context

Farmers need immediate human-readable evidence, while collection is not the same as final payment.

## Decision

Issue one active receipt for each accepted delivery version with a checksum, short verification code,
print view, and explicit non-payment statement. Reprints increment an audit counter. Correction
approval supersedes the original receipt and issues a new one.

## Consequences

Receipt lineage follows delivery lineage and avoids misleading payment claims. Verification remains
authenticated in Phase 2; no SMS delivery is implied.

## Alternatives considered

Overwriting receipt content was rejected. PDF-only storage was deferred; the canonical receipt is
structured data rendered by the web application.
