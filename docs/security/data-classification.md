# Data classification

| Class        | Examples                                                               | Handling                                                                  |
| ------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Public       | Opaque QR public IDs, approved published claims                        | Payload contains no PII; lookup remains authorized in Phase 1             |
| Internal     | Operational metrics, non-sensitive configuration                       | Authenticated staff; redact from public logs                              |
| Confidential | Farmer contact details, farm locations, quality and settlement records | Organization-scoped authorization, encryption, audited access             |
| Restricted   | Identity documents, credentials, payment accounts, private keys        | Minimal collection, dedicated secret/object controls, never log or anchor |

Retention must follow legal and cooperative requirements. Production backups and exports inherit the
highest classification present. Logs should use opaque IDs and the observability redaction list.

Farmer QR payloads contain only a versioned opaque `fq1_` identifier in an application URL. Names,
phone numbers, membership numbers, farm locations, and database IDs are forbidden in the payload.
