# Phase 4 Hedera operations

## Local mode

The default `.env.example` uses `HEDERA_PROVIDER=mock`, `HEDERA_NETWORK=local`, and disables automatic
submission/confirmation. This mode creates no Hedera transaction and requires no credentials. The
idempotent seed provides pending, submitted, confirmed, retryable failure, permanent failure,
mismatch, superseded, and replacement-confirmed examples on topic `0.0.424242`.

To exercise workers locally, start PostgreSQL and Redis, seed, then enable both worker switches:

```bash
pnpm infra:up
pnpm db:migrate
pnpm db:seed
HEDERA_SUBMISSION_ENABLED=true HEDERA_CONFIRMATION_ENABLED=true pnpm dev
```

## Diagnostics

```bash
pnpm --filter @clycites/api cli:topic-status
pnpm --filter @clycites/api cli:anchor <anchor-uuid>
pnpm --filter @clycites/api cli:anchor <anchor-uuid> --include-canonical-payload
pnpm --filter @clycites/api cli:reconcile 100
```

Inspection redacts canonical payloads by default. Reconciliation enqueues a bounded job; it does not
scan or mutate the topic from the CLI process. The worker must be running. Never paste CLI output that
contains private canonical payloads into tickets or chat.

## Failure response

| State                      | Meaning                                                        | Operator action                           |
| -------------------------- | -------------------------------------------------------------- | ----------------------------------------- |
| `RETRYABLE_FAILURE`        | Temporary provider, network, or Mirror failure                 | Retry after dependency recovery           |
| `PERMANENT_FAILURE`        | Invalid configuration, topic, message, or fee policy           | Correct configuration; do not blind retry |
| `SUBMITTED` / `CONFIRMING` | Transaction exists but consensus evidence is not yet validated | Reconcile by transaction/topic            |
| `MISMATCH`                 | Stored, recomputed, and/or Mirror hashes disagree              | Stop; preserve evidence and investigate   |
| `SUPERSEDED`               | A later confirmed correction replaced this evidence            | Follow the replacement link               |

Unknown submission outcomes must be reconciled before any retry. Repeated submission can create two
valid HCS messages for one logical event and is therefore prohibited.

## Testnet topic lifecycle

Topic creation is a cost-bearing network operation and is never run by tests or startup. The command
supports only testnet and previewnet; mainnet is structurally rejected.

```bash
export HEDERA_NETWORK=testnet
export HEDERA_OPERATOR_ID=0.0.x
export HEDERA_OPERATOR_KEY='...'
export HEDERA_TOPIC_CREATE_MAX_FEE_HBAR=2
pnpm --filter @clycites/api cli:topic-create --acknowledge-network-cost
```

Store the returned topic ID in the deployment secret/configuration system. Do not commit operator
keys or `.env`. Use a dedicated least-privilege operator account, managed secret storage, documented
rotation, and balance/fee alerts. Topic rotation requires retaining the old topic/checkpoint for
historical verification and deploying the new topic ID before enabling new submissions.

## Readiness and monitoring

The public `/ready` endpoint covers required PostgreSQL and Redis dependencies. Authenticated
`/api/v1/admin/hedera/status` reports non-secret provider/network configuration and last successful
submission/confirmation. Alert on growing pending age, retryable/permanent failures, mismatches,
confirmation timeout, stale checkpoints, unknown topic messages, and fee-limit errors.

## Backup and recovery

Back up anchors, attempts, verifications, traceability events, and topic checkpoints with the rest of
PostgreSQL. After restoration, keep submission disabled, compare the checkpoint to Mirror Node, run a
bounded reconciliation, investigate discrepancies, then re-enable workers. HCS evidence cannot
reconstruct private business rows; both database backups and ledger evidence are required.
