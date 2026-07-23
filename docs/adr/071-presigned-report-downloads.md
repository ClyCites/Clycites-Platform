# ADR 071: Presigned, expiring report downloads

**Decision:** Completed report exports are never served through the API process. Downloads are issued as
short-lived presigned object-storage URLs requested on demand, and exports carry a seven-day expiry
after which access returns `REPORT_EXPORT_EXPIRED`. This keeps large payloads off the application tier
and bounds the lifetime of any leaked link.
