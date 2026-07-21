# Offline And Field Readiness

Browser network simulation is not treated as rural field validation.

| Item                              | Classification                                  | Evidence / gap                                                                                       |
| --------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| PWA manifest                      | Verified through automated test/build           | Manifest route built; install prompt not manually verified                                           |
| Service worker                    | Not tested                                      | [public/sw.js](../../apps/web/public/sw.js) exists; registration/cache update behavior not exercised |
| IndexedDB schema                  | Not tested                                      | Dexie schema exists in [collection-db.ts](../../apps/web/src/lib/collection-db.ts)                   |
| Queued operations/idempotency     | Verified through automated test                 | API stable replay and conflicts; browser queue persistence not tested                                |
| Snapshot and delta sync           | Not tested                                      | API/client structures exist; expiration/tombstone sequence not exercised                             |
| Conflict resolution               | Simulated only                                  | API partial outcomes tested; operator UI conflict workflow not exercised                             |
| Duplicate prevention              | Verified through automated test                 | Delivery/offline idempotency; browser restart case absent                                            |
| Organization cache isolation      | Not tested                                      | Client lock/clear functions exist; no two-org browser test                                           |
| Logout cleanup                    | Not tested                                      | Explicit cleanup code exists; no browser assertion                                                   |
| Revoked device                    | Verified through source, not automated scenario | Sync requires an `ACTIVE` device; existing cache cannot be remotely erased                           |
| Application update                | Not tested                                      | No service-worker upgrade/old-schema test                                                            |
| Browser restart/interrupted sync  | Not tested                                      | No persistence/retry browser test                                                                    |
| Low storage                       | Not implemented                                 | No quota warning or eviction recovery evidence                                                       |
| Client clock                      | Partially implemented                           | Server time returned; skew behavior not exercised                                                    |
| Diagnostic export                 | Implemented not verified                        | Documentation/code surfaces exist; field export not run                                              |
| Printer support                   | Not implemented                                 | Receipt page exists; printer/hardware validation absent                                              |
| Scale-provider boundary           | Documented only                                 | No selected hardware or adapter verification                                                         |
| Low-cost Android compatibility    | Not tested                                      | Pixel 7 emulation passed fixture pages; no target low-cost device                                    |
| Rural low-connectivity validation | Not tested                                      | No physical field protocol/results                                                                   |

## Conclusion

Offline API idempotency is one of the stronger implemented areas, but offline **field readiness is not established**. A controlled pilot is blocked until real browser persistence, service-worker upgrade, revoked-device, organization switching, logout, restart, interrupted sync, storage pressure and representative Android tests pass with synthetic data. Operational controls must assume a lost device can retain cached data even though the server rejects future sync.
