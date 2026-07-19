# Phase 4 deployment checklist

1. Back up PostgreSQL and verify restoration procedures.
2. Apply the immutable Phase 4 migration and generate the Prisma client.
3. Run `pnpm hedera:config` with submission and confirmation disabled.
4. Configure the environment-specific topic, managed operator key, Mirror URL, fee ceiling, and
   versioned reference secret.
5. Run all checks in local mock mode and confirm browser bundles contain no server secrets.
6. Enable confirmation first and run bounded reconciliation from the stored checkpoint.
7. Enable submission only after pending age, queue depth, failures, mismatches, and account balance
   alerts are active.
8. For testnet, submit a single approved synthetic event and verify every Mirror field before widening
   rollout.

Rollback disables submission and confirmation without deleting anchors, attempts, verifications, or
checkpoints. Investigate unknown outcomes through transaction lookup and bounded topic reconciliation;
never blindly retry them. Mainnet requires a separate architecture, security, legal, cost, and
operations review and is not part of Phase 4.
