# Dependency Security Policy

## Status

Accepted on 2026-08-09.

## Decision

Production dependencies gate on high and critical advisories. CI and release checks run
`pnpm test:security`, which executes `pnpm audit --prod --audit-level high`. A high or critical
production finding fails the gate.

Development dependencies are report-only and remain visible through `pnpm test:security:dev`,
which executes an unfiltered `pnpm audit`. Development findings must be reviewed during dependency
updates, but they do not block a production release unless their vulnerable code is reachable in a
production artifact or workflow.

An accepted advisory must be allowlisted by GHSA ID in pnpm audit configuration with a one-line,
owner-approved justification and review date. Severity thresholds, omitted dependency classes, and
silent suppression are not substitutes for an explicit exception. No production advisory is
currently allowlisted.

## Rationale

The production gate covers code shipped by the API, worker, web application, and shared runtime
packages. Following the Hiero SDK migration, `pnpm audit --prod` reports zero vulnerabilities. The
gate can therefore pass now and will fail on a future high or critical production regression.

The development report currently contains findings reached only through test and build tooling:

- `GHSA-5xrq-8626-4rwp` affects the Vitest UI server. ClyCites CI invokes `vitest run` and does not
  expose `vitest --ui` as a listening service.
- `GHSA-4cwx-7wf7-3272`, `GHSA-8xcm-r25x-g524`, `GHSA-m8rv-5g2x-5cg5`,
  `GHSA-jr45-8vmc-qm54`, and `GHSA-v3r7-h72x-cjcm` reach `undici` through `jsdom` and Vitest.
- `GHSA-fxqj-rqcc-2cmp` reaches PostCSS through Vite, Vitest, and Tailwind build tooling.

These findings are not silently omitted: `pnpm test:security:dev` reports them and exits nonzero.
They must be reassessed when Vitest, jsdom, Vite, Tailwind, or PostCSS changes, or if any affected
tooling becomes part of a production runtime.
