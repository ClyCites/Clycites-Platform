# Data classification

| Class        | Examples                                                            | Handling                                                                  |
| ------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Public       | Opaque QR public IDs, approved published claims                     | Payload contains no PII; lookup remains authorized in Phase 1             |
| Internal     | Operational metrics, Coffee forms, non-sensitive configuration      | Authenticated staff; redact from public logs                              |
| Confidential | Farmer data, farm locations, deliveries, weights, quality, receipts | Organization scope, device/session checks, audit, encrypted transport     |
| Restricted   | Identity documents, credentials, payment accounts, private keys     | Minimal collection, dedicated secret/object controls, never log or anchor |

Retention must follow legal and cooperative requirements. Production backups and exports inherit the
highest classification present. Logs should use opaque IDs and the observability redaction list.

Farmer QR payloads contain only a versioned opaque `fq1_` identifier in an application URL. Names,
phone numbers, membership numbers, farm locations, and database IDs are forbidden in the payload.

Collection snapshots and queued operations are confidential local data. They are partitioned by
organization, contain no credentials, are deleted at logout, and must be cleared after device loss,
revocation, reassignment, or browser-profile transfer. Receipts expose collection facts and a short
verification code but explicitly do not prove final payment.
