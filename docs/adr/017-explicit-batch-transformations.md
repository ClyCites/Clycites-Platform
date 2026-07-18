# ADR 017: Explicit batch transformations

## Status

Accepted

## Decision

Model split, merge, and processing as one transformation record with immutable input and output relations. Output quantity cannot exceed input quantity. Only processing may change commodity form.

## Consequences

Mass balance and process loss are visible. Outputs are new sealed batches rather than mutations of input batches.
