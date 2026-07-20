# Pilot farmer import

Imports accept CSV objects up to 10 MiB through a 15-minute signed S3-compatible upload. The API stores
only a filename hash, protected object key, size, content type, and SHA-256 checksum. The worker job
contains only the import ID.

Required headers are `firstName`, `lastName`, and `district`; optional headers are `primaryPhone` and
`membershipNumber`. Unexpected columns, formula-like values, malformed phones, duplicate phone or
membership signals, and row errors require review. The worker verifies the full object checksum and
never creates farmers. Explicit confirmation creates `DRAFT` farmers and `PENDING` memberships; it
does not infer consent, activate memberships, or enroll participants. Object malware scanning remains
an external readiness blocker until a protected scanning capability is approved.
