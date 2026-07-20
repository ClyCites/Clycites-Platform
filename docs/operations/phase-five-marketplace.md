# Phase 5 marketplace operations

## Local verification

Start infrastructure, apply all migrations, and run the idempotent seed twice:

```bash
pnpm infra:up
pnpm db:generate
pnpm --filter @clycites/database exec prisma migrate deploy
pnpm db:seed
pnpm db:seed
pnpm dev
```

Use `cooperative.admin@clycites.local` as the seller and `buyer@clycites.local` as
the buyer. The default disposable password is `ClyCites-local-2026!` unless overridden by
`SEED_STAFF_PASSWORD`. The seed includes a partially reserved marketplace listing, submitted and
accepted offers, a contracted reservation, active contract, pending order, and private traceability
share.

## Manual workflow

1. As the cooperative, open `/organizations/{cooperativeId}/marketplace`, create a listing from an
   approved lot with a passed inspection, and publish it.
2. As the buyer, discover the listing and submit an offer using a decimal quantity string and an
   integer minor-unit price string.
3. Counter, withdraw, or reject as the current party requires. As the seller, accept the current
   offer and verify that listing availability decreases and a reservation and contract appear.
4. Approve the contract as seller, then buyer. Propose an amendment from either party and approve,
   reject, or withdraw it from the appropriate organization.
5. As the seller, create the order and attach a matching draft custody transfer. Dispatch the
   transfer, receive it as the buyer, and synchronize the order after each custody transition.
6. As the buyer, record a completed inspection and acceptance quantities that exactly equal the
   order quantity. As the seller, complete a fully accepted order.
7. Create a scoped traceability share for the buyer, confirm only requested fields are returned,
   revoke it, and confirm subsequent access is denied.

Pause and republish to temporarily hide inventory. Close a listing to stop new offers while retaining
existing commitments. Cancel contracts or pre-dispatch orders only when the UI/API offers the action;
the service restores inventory in the same transaction.

## Recovery and monitoring

The commercial expiration worker runs every 60 seconds. It is safe to rerun: stale rows transition
once, reservation release uses row locking, and a second pass reports zero work. Monitor worker
errors, old active reservations, negative or over-listed availability, pending outbox age, and audit
events without corresponding domain rows. Never repair quantity by directly editing
`availableQuantity`; use a supported cancellation or an audited database repair procedure.

Keep `HEDERA_PROVIDER=mock`, `HEDERA_NETWORK=local`, and submission/confirmation disabled for normal
Phase 5 development and CI. No Phase 5 runbook action should initiate a payment, settlement, escrow,
mobile-money, token, lending, or insurance operation.
