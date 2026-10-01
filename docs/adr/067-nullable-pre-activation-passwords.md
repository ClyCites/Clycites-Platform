# ADR 067: Nullable pre-activation passwords

## Status

Accepted

## Decision

Allow `User.passwordHash` to be null while an account is `INVITED`. Enforce the active-account
invariant in PostgreSQL with the named constraint `User_active_requires_password`:

```sql
CHECK (status <> 'ACTIVE' OR "passwordHash" IS NOT NULL)
```

Invitation acceptance writes the Argon2id hash and changes the user to `ACTIVE` in one transaction.
Login always performs one Argon2 verification, using the fixed dummy hash when the stored hash is
null, so pre-activation accounts do not reopen the account-enumeration timing oracle.

## Consequences

Accounts can be provisioned before their owners choose credentials. Any flow activating a user must
set a password in the same statement or transaction, and the database rejects violations even when
application validation is bypassed.
