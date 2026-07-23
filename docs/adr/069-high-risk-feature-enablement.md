# ADR 069: Justified high-risk feature enablement

**Decision:** Organization feature enablement is evaluated against platform-defined feature definitions.
Enabling a feature marked `HIGH` or `CRITICAL` risk requires an explicit human justification, which is
recorded on the audit trail alongside the actor. Automated or unjustified enablement of high-risk
features is rejected so risk acceptance is always attributable to a person.
