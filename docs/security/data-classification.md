# Data classification

| Class        | Examples                                                               | Handling                                                                  |
| ------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Public       | Published verification IDs, approved lot claims                        | May appear in public verification views                                   |
| Internal     | Operational metrics, non-sensitive configuration                       | Authenticated staff; redact from public logs                              |
| Confidential | Farmer contact details, farm locations, quality and settlement records | Organization-scoped authorization, encryption, audited access             |
| Restricted   | Identity documents, credentials, payment accounts, private keys        | Minimal collection, dedicated secret/object controls, never log or anchor |

Retention must follow legal and cooperative requirements. Production backups and exports inherit the
highest classification present. Logs should use opaque IDs and the observability redaction list.
