# ADR 064: Human pilot decisions

**Decision:** Evaluation never creates a final decision. Decisions are append-only and evidence-hashed.
Approval creates a new version and requires a different authorized user before lifecycle state changes.
