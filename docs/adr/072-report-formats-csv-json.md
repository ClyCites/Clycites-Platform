# ADR 072: CSV and JSON report formats only

**Decision:** Report exports support CSV and JSON only. PDF is deliberately deferred and fails
deterministically with `FORMAT_NOT_SUPPORTED` rather than degrading silently or blocking the worker on
heavyweight rendering. Adding PDF later is an additive change to the worker's format handling and does
not alter the request contract.
