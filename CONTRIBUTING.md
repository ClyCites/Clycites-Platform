# Contributing

## Workflow

- Branch from the active development branch using `feature/short-description`,
  `fix/short-description`, `docs/short-description`, or `chore/short-description`.
- Use Conventional Commits, for example `feat(api): add delivery intake contract`.
- Keep pull requests focused. Explain behavior, architecture impact, migrations, security impact, and
  manual verification. Link the relevant issue and include UI evidence when applicable.
- Obtain review before merge and resolve all CI checks.

## Quality

Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. Add tests for
new behavior and regression tests for fixes. Integration tests must use isolated local resources and
must never require real Hedera credentials.

## Database migrations

Change `packages/database/prisma/schema.prisma`, generate a named migration with
`pnpm db:migrate -- --name concise_change_name`, and review its SQL. Migrations are append-only after
merge: never edit or delete an applied migration. Include data migration and rollback considerations
in the pull request.

## Secrets and data

Never commit secrets, production credentials, `.env` files, exported customer records, private
keys, or personal data. Use sanitized fixtures. Treat phone numbers, farmer identifiers, precise
locations, payment accounts, and identity documents as sensitive. Report suspected exposure
privately to repository maintainers rather than opening a public issue.
