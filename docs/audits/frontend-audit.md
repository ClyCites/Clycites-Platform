# Frontend Audit

## Inventory

The production build emitted **49 routes**: public root/login/offline/system status/trace/verify routes; platform-admin Hedera, operations, organizations and pilot routes; and organization workspaces for overview, members, collection points, farmers, coffee configuration, collection, devices, deliveries, traceability, marketplace and finance.

The app uses Next.js 16, React 19, Tailwind, React Query, React Hook Form, Zod contracts, Dexie and Lucide. [components.json](../../apps/web/components.json) configures shadcn conventions, while reusable primitives are exported by [packages/ui/src/index.tsx](../../packages/ui/src/index.tsx); this is a small custom system rather than a broad generated shadcn component set.

Protected navigation is client-session and API-permission driven. No Next middleware protects route rendering, so URL access may render a shell before API authorization resolves. API guards remain authoritative; UI hiding is not treated as authorization.

## Runtime And Tests

- Production build and `/login` runtime returned successfully.
- Five Vitest files passed 11 tests.
- Three Playwright specs produced 10 passing desktop/mobile cases.
- Every Playwright API call is intercepted at port 4999. Marketplace, finance and pilot browser tests therefore validate fixture rendering, masking, basic responsiveness and shell error states, not API connectivity.
- The `@accessibility` check verifies semantic navigation, focus visibility and overflow; it is not a WCAG scanner.
- The `@offline` check aborts one pilot preflight request; it does not test IndexedDB delivery recovery, service-worker caching, sync interruption, conflicts, logout cleanup or browser restart.
- The `@performance` check measures a mocked pilot list under five seconds, not an API/load smoke test.

## Integration And State Handling

API client refresh and bearer-token behavior have unit coverage. Forms use shared Zod contracts in important paths. Shared loading, empty and error primitives exist, but conflict/retry treatment varies by workspace. Finance UI masks payment identifiers in its fixture test. Public verification wording correctly limits what Hedera evidence proves.

The PWA manifest, [public/sw.js](../../apps/web/public/sw.js), Dexie database and collection workspace exist. Service-worker existence is not installability evidence. Organization locking and explicit logout cleanup exist in the client, but no browser test proves cleanup or protects data when a device is lost without logout.

## Status

| Area                                | Status                     | Reason                                                                 |
| ----------------------------------- | -------------------------- | ---------------------------------------------------------------------- |
| Route/build surface                 | `VERIFIED_IMPLEMENTED`     | Build and route generation passed                                      |
| Login/API client                    | `PARTIALLY_IMPLEMENTED`    | Unit-tested; no live browser login journey                             |
| Collection UI                       | `PARTIALLY_IMPLEMENTED`    | UI/client storage exist; full live/offline journey not exercised       |
| Traceability/marketplace/finance UI | `PARTIALLY_IMPLEMENTED`    | Broad workspaces exist; browser evidence is fixture-only               |
| Pilot UI                            | `PARTIALLY_IMPLEMENTED`    | Fixture-driven control room and blocked preflight wording              |
| Accessibility                       | `PARTIALLY_IMPLEMENTED`    | Narrow semantic smoke only                                             |
| Localization                        | `PARTIALLY_IMPLEMENTED`    | Localization library tests pass; Luganda human review remains external |
| PWA/offline field readiness         | `IMPLEMENTED_NOT_VERIFIED` | Components exist; durability/installability not verified               |

Pages should not be described as static placeholders globally: many components call API clients. However, all executed browser evidence uses fixtures, so no web page qualifies as `VERIFIED_IMPLEMENTED` end to end under the audit definition.
