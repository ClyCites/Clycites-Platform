-- Reversal entry types are added separately because PostgreSQL forbids using a new
-- enum value in the same transaction that introduces it, and the next migration
-- references these values in a CHECK constraint.
ALTER TYPE "InventoryLedgerEntryType" ADD VALUE 'TRANSFORMATION_INPUT_REVERSAL';
ALTER TYPE "InventoryLedgerEntryType" ADD VALUE 'TRANSFORMATION_OUTPUT_REVERSAL';
