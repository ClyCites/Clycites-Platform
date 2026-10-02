# Web UI redesign

The web app uses its existing Tailwind v4 and shadcn configuration, semantic CSS tokens, CVA buttons, Lucide icons, and shared UI package. The responsive application shell now owns the navigation, organization selector, breadcrumbs, user menu, and light/dark theme controls. Public routes keep a compact header; printable content hides the shell and uses light print tokens.

Shared page headers, route tabs, cards, status badges, and table styling carry the design through organization, farmer, collection, delivery, finance, marketplace, administration, pilot, traceability, and verification workflows. The farmer directory uses a reusable data table with server pagination and search/status filters. Existing forms, API contracts, access checks, and offline collection logic are retained.

## Dashboard data

- `/analytics/overview`: active farmers, deliveries, accepted deliveries, acceptance rate, collection points, delivery trends, and delivery status breakdowns.
- `/analytics/finance`: settlement counts and gross/net entitlements in the API-provided currency. Requested only with `analytics.finance.read` or platform administrator access.
- `/operations/summary`: active users, pending/failed report exports, and audit counts. Requested only with `operations.read` or platform administrator access.
- `/audit/search`: five recent administrative events. Requested only with `audit.read` or platform administrator access.

Metrics link to their source workflows. Charts include keyboard-accessible point labels and searchable, sortable, paginated data alternatives. Refresh retries available dashboard queries. Dates and dashboard update times use Africa/Kampala; the API's existing date range aggregation semantics remain unchanged. The operations and recent activity panels have their own time windows and do not imply that the analytics date filter applies to them.

## Data limitations

The existing overview endpoint does not aggregate collection weight, payment totals, marketplace volume, or verification coverage. Those workflows remain accessible through the navigation; the dashboard does not display invented totals or sum partial paginated lists. The current analytics service supplies null comparisons, which the UI omits. Extending these metrics requires backend aggregate contracts with units, currencies, organization scope, and date range semantics.

Recent activity represents the administrative audit feed, not a comprehensive agricultural event feed. Operational exceptions currently cover failed report exports; an organization-wide task queue or delivery/payment exception aggregate would need an additional endpoint.

## Validation

Web lint, TypeScript checks, Vitest, and the production build are required. Browser coverage includes desktop/mobile finance and marketplace workflows, pilot accessibility/offline/performance smoke checks, dashboard chart exploration, permission-scoped requests, theme persistence, mobile drawer focus handling, sidebar collapse, and server-paginated farmer search.

During implementation the existing development server was retained. Browser tests ran against a separate production preview using temporary fixture copies pointed at the configured API origin. Test metrics are confined to browser fixtures; application queries use the real endpoints above.
