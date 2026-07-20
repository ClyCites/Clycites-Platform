# ADR 061: Protected farmer imports

**Decision:** CSV source files use protected S3-compatible storage, short-lived signed uploads, checksum
verification, identifier-only jobs, bounded parsing, row-level review, and explicit confirmation. Import
does not establish consent or enrollment.
