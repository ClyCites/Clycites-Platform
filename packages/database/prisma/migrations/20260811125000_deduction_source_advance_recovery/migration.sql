-- PostgreSQL forbids using a new enum value in the transaction that adds it, so this
-- addition ships as its own migration ahead of the commerce hardening changes.
ALTER TYPE "SettlementDeductionSource" ADD VALUE 'ADVANCE_RECOVERY';
