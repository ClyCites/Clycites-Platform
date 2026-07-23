# ADR 073: Dependency-light dashboard visualization

**Decision:** Dashboard charts are rendered with SVG and Tailwind primitives rather than a third-party
charting library, and theming uses the existing `.dark` class with design tokens. This keeps the client
bundle small, avoids a heavy transitive dependency surface, and guarantees the visuals stay aligned with
the platform design system across light and dark modes.
