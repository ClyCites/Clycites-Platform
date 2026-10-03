# Cooperative field ledger UI

The web application now uses warm ivory surfaces, forest navigation, compact ledger metrics, coffee and harvest accents, restrained borders, and matching dark tokens. The shared card and table presentation carries this identity through existing workflows. Dashboard charts use shadcn ChartContainer with Recharts, API series, legends, tooltips, and searchable table alternatives. No production metrics or comparisons are fabricated.

## Expanded workflows

New or extended screens connect account security and recovery; farmer self-service and farm plots; organization invitations and role assignments; finance rates, advances, reconciliation, payment methods, settlement details and payment approvals; marketplace negotiations, amendments, fulfillment and shares; pilot CSV imports, feedback and operating registers; operational incident, privacy, retention and backup registers; entity verification, lot lineage, custody and public evidence.

Shared workflow forms validate against existing contracts, carry backend record versions, expose permission states, label controls explicitly, and refresh registers after writes. API clients retain existing authentication and organization-scoped paths. Signing out clears cached account data and offline session data.

## API inventory and limits

[The generated inventory](api-route-inventory.md) accounts for all 309 controller route variants: 296 have browser path references, 10 are equivalent aliases, one is the external device credential exchange, and two have backend contract gaps. The inventory is a static review aid; it does not establish production execution or exhaustive method and role coverage.

- Creating a pilot baseline is blocked by the strict metric value intersection rejecting measurement-period and source fields.
- Creating an operations privacy request is blocked by the strict request intersection rejecting operations-specific fields.
- Device credential exchange returns device refresh credentials; it is deliberately kept outside the staff browser session.
- Pilot device/collection-point assignment history has no list endpoint. New assignments can be managed using their returned IDs.
- Failed notification retry requires an explicit ID because the backend has no failed-notification list endpoint.
- Import review displays the backend's maximum 500 returned rows. Signed object-storage uploads need a working storage service and browser CORS configuration.

These limitations are surfaced in the UI instead of submitting invalid requests or displaying invented records. Backend contracts were not changed.

## Validation

- Web and shared UI lint and TypeScript checks.
- Web production build and shared UI package build.
- 26 unit tests, including monetary precision, contract validation, nested mutation bodies, permissions, and unavailable public verification.
- 24 Playwright cases across desktop Chrome and Pixel 7: dashboard permissions and retry, chart table interaction, keyboard navigation, persistent themes, directory pagination, finance, marketplace, account recovery, CSV upload/checksum validation, accessibility and offline smoke checks.
- Visual inspection of dashboard light/dark desktop/mobile screenshots.

Browser checks used contract-shaped API fixtures against the production build. They did not execute live financial mutations, import actual farmer records, or verify external services. Existing developer port 3000 was left untouched; review used port 3100.
