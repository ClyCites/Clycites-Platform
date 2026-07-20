# ADR 065: Pilot preflight and bootstrap

**Decision:** Preflight is read-only, machine-readable, and fails on blocking controls. Bootstrap defaults
to dry-run and requires both `--apply` and an exact confirmation token for draft creation. Neither tool
deploys infrastructure or activates providers.
