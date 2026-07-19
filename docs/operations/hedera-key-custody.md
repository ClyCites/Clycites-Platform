# Hedera key custody and rotation

Use a dedicated least-privilege Hedera operator account for each environment. Store its key and the
HMAC reference secrets in managed secret infrastructure; do not commit them, place them in images,
return them from APIs, or paste them into incident systems. Restrict read access to the deployment
identity and record secret access through the platform audit facility.

Rotate an operator key by disabling submission, reconciling unknown outcomes, changing the account
key through an approved Hedera operation, updating the managed secret, validating configuration, and
submitting one explicitly approved testnet event before restoring normal processing. A lost or exposed
key requires immediate submission shutdown, account-key replacement, balance and transaction review,
checkpoint reconciliation, and an incident record.

Rotate privacy-reference secrets by adding a new version rather than rewriting old references. Keep
historical versions available only to verification workers for the required retention period. Never
reuse authentication, encryption, or signing secrets as a privacy-reference key.
