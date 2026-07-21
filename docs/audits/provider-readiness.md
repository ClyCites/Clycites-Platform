# Provider Readiness

| Provider       | Readiness         | Evidence                                                                                                                                   | Proven mode                         | Blockers                                                                                                                                 |
| -------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Hedera         | `SANDBOX_CAPABLE` | Provider interface, mock ledger, SDK and Mirror implementations, configuration/mainnet gates, privacy-safe messages, worker reconciliation | Mock/local verified; SDK not called | Approved testnet credentials/topic, key custody, cost/timeout/reconciliation drill, independent privacy review; mainnet remains separate |
| Payments       | `MOCK_ONLY`       | Manual and mock payment worker, attempts, idempotency, reconciliation models, masked/encrypted destinations                                | Mock/manual local                   | No sandbox/production adapter, callback authentication, provider certification, reversal/unknown-outcome exercise                        |
| SMS            | `MOCK_ONLY`       | Notification abstraction/worker and mock/console pilot modes                                                                               | Mock worker                         | No carrier adapter, consent/opt-out localization, delivery receipt integration or duplicate-provider test                                |
| Object storage | `LOCAL_READY`     | MinIO Compose health, bucket initialization, S3-compatible client and signed-object/import paths                                           | Local MinIO healthy                 | Upload/download authorization test, file-type/malware policy, production endpoint/KMS, backup/restore                                    |

## Hedera Detail

Canonical JSON, SHA-256, HMAC privacy references, anchor persistence, mismatch handling, bounded retry, unknown-outcome review and public qualified verification are implemented and tested with mocks. Ordinary CI does not make real calls. Testnet is **capable but unverified**; mainnet is neither ready nor enabled. No real key was used in this audit.

## Payment Detail

The platform is not a funds custodian. Manual/mock providers do not mark a farmer paid merely on submission; attempts and reconciliation remain authoritative. Production capability requires a selected provider, sandbox certification, signed callbacks, idempotency acceptance tests, reversal and unknown-outcome runbooks, and finance approval.

## SMS Detail

Notification jobs avoid recipient data in queue/audit metadata and duplicate claims are tested. Consent, opt-out, sender identity, language templates and delivery callbacks need a selected provider and jurisdiction review.

## Object Storage Detail

Compose binds MinIO to loopback and uses named volumes/development-only defaults. S3 compatibility alone is not production verification. Signed URL lifetime, tenant object-key authorization, CSV quarantine, malware scanning and recovery must be exercised.
