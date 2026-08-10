# ADR 072: Capture layer hardening and scale

## Status

Accepted

## Context

The capture layer records the moment a farmer's crop becomes an obligation of the
cooperative. WP12 reviewed that layer for provenance, arithmetic integrity, evidence
consistency, offline robustness, and read-path cost at pilot volume. Several gaps were
found that would only surface as disputes or outages in the field.

## Decision

### 1. Weighing instrument provenance is recorded and flagged, never rejected

`WeighingInstrument` records serial number, type, calibration date, calibration
certificate reference, and status per organization. `DeliveryMeasurement` stores both the
instrument the device *reported* (`reportedInstrumentId`) and the instrument the server
could *resolve* (`instrumentId`).

A capture is **never rejected** because of instrument problems. Rejecting would mean
turning a farmer away at the scale for an administrative failure that is not theirs. The
measurement is instead recorded with `instrumentFlagged` and one of:

- `INSTRUMENT_NOT_RECORDED` — no instrument was supplied (also the default for all rows
  that existed before this ADR, so the historical gap stays visible rather than being
  silently backfilled).
- `INSTRUMENT_NOT_REGISTERED` — unknown instrument, or one belonging to another
  organization.
- `INSTRUMENT_INACTIVE` — the instrument is not `ACTIVE`.
- `CALIBRATION_LAPSED` — captured more than the calibration validity window after
  `calibratedAt`.

Calibration validity is **one year**, expressed once as
`CALIBRATION_VALIDITY_YEARS`. This is a placeholder for the Uganda National Bureau of
Standards requirement and must be confirmed against the current legal instrument before
pilot. It is deliberately a single named constant so the correction is a one-line change.

### 2. Net quantity is fixed-point, and client claims are tolerated by exactly one unit

The server always derives net quantity itself using integer arithmetic at four decimal
places. A client-supplied net claim is compared to the server value and accepted only when
it differs by at most one fixed-point unit, which absorbs device rounding without
admitting drift. Floating point is never used for quantity or money.

### 3. Measurements are append-only and superseded, never mutated

A reweigh does not update the existing row. It marks the current measurement
`supersededAt`, writes a new row at `version + 1` with `supersedesMeasurementId` pointing
at its predecessor, and recalculates pricing. A partial unique index
(`DeliveryMeasurement_one_live_type_key`) guarantees **exactly one live measurement per
delivery per type**, and check constraints keep the version and supersession state
coherent. The full weighing history therefore survives any dispute.

### 4. Acceptance copies the evidence that actually exists

Acceptance reads the latest `CONFIRMED` confirmation and copies its `confirmedAt` and
`confirmationMethod` onto the delivery, so the delivery's summary fields cannot disagree
with the confirmation record they claim to summarise.

### 5. SMS confirmation stays refused

`confirmationMethod` admits only `VERBAL_WITNESSED` and
`PRINTED_RECEIPT_ACKNOWLEDGEMENT`. `SMS_OTP` and `FARMER_PIN` are refused at the contract
boundary for both delivery creation and confirmation. `FARMER_PIN` exists in the database
enum but has **no implementation**; it is aspirational and must not be presented as an
available control.

### 6. Offline sync is bounded, rate limited per device, and remains partially successful

Batches accept 1–250 operations (raised from 25, which forced excessive round trips for a
day's collection). The JSON body cap is 1 MB, enforced before parsing. Each device is
limited to `OFFLINE_SYNC_REQUESTS_PER_MINUTE` (default 30) requests in a fixed 60-second
window using an atomic Redis script; exceeding it returns `429` with `Retry-After`.

Sync remains **partial**: each operation succeeds or fails on its own, so one bad record
never discards a day of fieldwork. Replayed operations remain idempotent under
concurrency; two identical simultaneous batches create exactly one delivery.

### 7. The delivery list uses a row-value keyset cursor

Offset pagination degraded badly at volume. The list now supports a
`<epochMillis>:<uuid>` cursor over `(serverReceivedAt, id)`, backed by
`Delivery(organizationId, serverReceivedAt, id)`.

The cursor predicate is written as a **row-value comparison**
(`("serverReceivedAt", "id") < (...)`). The logically equivalent `OR` form that Prisma's
query builder produces is *not* sargable: Postgres scanned the index and discarded 50,001
rows. Because Prisma cannot express row-value comparison, the page of ids is fetched with
a parameterised raw query and hydrated in a single follow-up query. Measurements are in
[the capture performance report](../audits/wp12-capture-performance.md).

The list also uses a narrowed include, so the number of statements per page is constant
rather than growing with the number of items. No caching is used; caching would have
hidden an N+1 rather than removing it.

## Consequences

- Instrument gaps become visible, reportable data instead of silent unknowns or refused
  deliveries.
- Weight disputes can be reconstructed from an append-only chain.
- Field devices can sync a realistic day's work without being throttled into failure, and
  a single abusive or malfunctioning device cannot exhaust the sync path.
- Deep pagination is bounded work per page.
- The calibration window and the consent question below remain open policy items that
  engineering must not close unilaterally.
