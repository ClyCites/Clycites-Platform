# Contributing

## Workflow

- `staging` is currently an unprotected integration branch. Direct integration is permitted; do not
  describe a pull request or review as a required gate when neither is enforced.
- Keep one work package per focused commit and complete its documented verification gates before
  starting the next package. Feature branches remain available when isolation is useful.
- Use Conventional Commits, for example `feat(api): add delivery intake contract`.
- Record behavior, architecture impact, migrations, security impact, and manual verification in the
  commit or associated documentation. Resolve all CI checks before integration.

## Quality

Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. Add tests for
new behavior and regression tests for fixes. Integration tests must use isolated local resources and
must never require real Hedera credentials.

## Database migrations

Change `packages/database/prisma/schema.prisma`, generate a named migration with
`pnpm db:migrate -- --name concise_change_name`, and review its SQL. Migrations are append-only after
merge: never edit or delete an applied migration. Include data migration and rollback considerations
in the associated change documentation.

## Secrets and data

Never commit secrets, production credentials, `.env` files, exported customer records, private
keys, or personal data. Use sanitized fixtures. Treat phone numbers, farmer identifiers, precise
locations, payment accounts, and identity documents as sensitive. Report suspected exposure
privately to repository maintainers rather than opening a public issue.
