# ADR 070: Location observation provenance

## Status

Accepted

## Context

Traceability and EUDR evidence needs location context without turning a farmer, user, device, or
delivery into a continuously located subject. Collection can occur under canopy and on low-cost
devices, so a reading may be absent or imprecise. The platform must retain useful evidence without
blocking legitimate field work or treating missing evidence as adverse evidence.

EUDR geolocation can also require a polygon for production plots larger than four hectares. Prisma
does not provide a portable PostgreSQL geometry mapping in this platform, and PostGIS is not part of
the current deployment baseline.

## Decision

Location belongs to an observation with provenance, never to an identity and never as a bare
coordinate. Farm coordinates record how, when, and by whom they were located. A `FarmPlot` stores a
survey method, survey time, optional accuracy, and a GeoJSON Polygon. Collection-session opening and
closing readings store their own accuracy and a distance snapshot from the collection point's
reference coordinates.

Distance is calculated once when the observation is written and is not recomputed if the collection
point later moves. The default 500 metre threshold is deliberately loose for rural collection and
canopy conditions. A precise reading beyond the threshold creates an audit flag but never rejects or
blocks the session. Missing reference coordinates, a missing reading, or accuracy worse than the
threshold cannot support an adverse flag.

Plot boundaries use GeoJSON in PostgreSQL JSON rather than PostGIS. The service validates polygon
shape, closure, Uganda bounds, and self-intersection, then derives centroid, vertex count, and area.
Clients cannot submit those derived values. Declared-versus-computed area differences greater than
25 percent are flagged for review. The plot model supplies polygon evidence when the EUDR
four-hectare rule requires more than a representative point.

Delivery-level location capture is deferred because the platform has no approved mobile capture
modality for deliveries. Seeded plot and coordinate fixtures are synthetic local-development data
and are not field-survey evidence.

Precise coordinates, boundaries, and centroids are excluded from public and buyer-facing
traceability. District is the maximum location granularity in those responses.

## Consequences

The system retains imperfect evidence while keeping collection operational. Reference-coordinate
changes do not rewrite history, so distance snapshots remain explainable against the reference in
force when captured. Geometry validation remains application-owned and may need migration to a
spatial database capability if spatial query requirements expand.

Current consent policy and ADR 009 do not explicitly state that plot geolocation is covered. Whether
existing consent is sufficient or a new consent type and wording are required is a legal decision for
counsel; this ADR does not decide it.
