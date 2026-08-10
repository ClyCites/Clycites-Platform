# WP8 blocker closeout

## Template and secret audit

The typed registry covers `INVITATION`, `PASSWORD_RESET`, `EMAIL_VERIFICATION`, and
`FARMER_ACCOUNT_RESET`, all at version 1 and all marked `containsSecret`. The existing operational
`PAYMENT_RECONCILED` template is registered as non-secret. MFA recovery codes are
returned once by the enrollment endpoint and do not use `NotificationDelivery`.

The pre-WP8 farmer reset notification did not store the reset code. It stored a personal message
and reset identifier. Credential records store token hashes, so invitation/reset/verification
plaintext cannot be reconstructed later. Producers now create pending secret-bearing delivery rows
while plaintext exists; terminal transitions and the scheduled historical sweep null parameters.

## Worker assessment

Conditional claim updates prevent concurrent workers from submitting the same attempt. Failures now
schedule capped exponential retries and become terminal after five attempts. SMS is suppressed.
The worker and audit path do not log parameters, recipients, or rendered bodies.

SMTP cannot guarantee exactly-once delivery. A crash after SMTP acceptance and before the delivered
transaction commits can produce an ambiguous result. The database deduplication key prevents
duplicate delivery rows, not duplicate remote sends. Bounce and complaint handling is not present.

## Composition evidence

Both real-route tests pass with guards intact. With the device subject guard temporarily removed,
the device test failed because `GET /api/v1/me/deliveries` returned 200 instead of 403. With the MFA
session gate temporarily removed, the MFA test failed because the unsatisfied session returned 200
instead of 401. Both guards were restored and the full farmer authentication file passed.

## Retention report

The current local database contained 1 `NotificationDelivery` row at the WP8 audit. No production
notification purge exists; generic retention support performs non-destructive dry runs, and test
cleanup deletes fixtures only.

Recommendation: treat message content and delivery receipts separately. Secret-bearing parameters
must be removed immediately at terminal state. Minimal receipt metadata may be retained for a
counsel-approved operational/audit period, then purged or anonymized under a separately approved
policy. WP8 does not implement that policy or any purge.

## Owner decisions

1. Choose the production SMTP service: managed mailbox relay or transactional email provider,
   including Uganda deliverability, cost, data processing, bounce, and complaint requirements.
2. Protect `staging` as an integration branch or remove pull-request language that assumes a
   separate protected integration target.
