# ADR-202: Colocate Bounded Feature Styles

**Status:** Implemented

**Date:** 2026-07-30

## Context

Kirjolab's Tailwind entry point assembles shared foundations and several large
feature stylesheets from `src/ui/`. That central directory makes the generated
bundle easy to find, but it obscures ownership: editor, Library, research
context, PDF reader, preview, templates, review-study, and shared-editor styles
live away from the client modules that render or control those surfaces.

The internal design-system contract already keeps feature components outside
`src/ui/`. Keeping their CSS inside the design-system directory makes selector
discovery, dead-style review, and feature maintenance less reliable without
changing the runtime bundle.

## Decision

Keep reusable foundations, visual primitives, the application shell, and
cross-feature workspace structure under `src/ui/`. Colocate each bounded
feature stylesheet with its owning area under `src/client/`. Keep
`src/tailwind-input.css` as the single ordered import manifest so the build
continues to emit one stylesheet with unchanged cascade order.

Prefer one stylesheet per coherent feature surface rather than one stylesheet
per component. A rule belongs in `src/ui/` only when its contract is shared
across feature ownership boundaries.

This decision partially supersedes only ADR-006's requirement that feature
stylesheet modules live under `src/ui/`. It preserves that ADR's Tailwind
pipeline, single entry point, generated output, and utility-versus-semantic CSS
guidance. It also preserves ADR-129's thin shared design system.

## Consequences

**Positive:**

- Feature markup, behavior, and styling are easier to discover and review
  together.
- Selector cleanup has a clearer ownership boundary.
- Shared design-system files no longer double as a catch-all stylesheet
  directory.

**Negative:**

- The import manifest spans both `src/ui/` and `src/client/` paths.
- Contributors must still distinguish genuinely shared rules from feature-local
  rules.

**Neutral:**

- The browser receives the same single generated stylesheet.
- Import order and cascade behavior remain explicit in
  `src/tailwind-input.css`.

## Alternatives Considered

### Keep every stylesheet under `src/ui/`

This preserves one source directory but continues to hide feature ownership and
conflicts with the existing boundary that keeps feature components outside the
design system.

### Create one stylesheet per component

This maximizes proximity but fragments responsive and stateful surface rules
across too many files. Coherent feature-level stylesheets provide a more useful
maintenance boundary.

### Import CSS from each TypeScript module

The project does not bundle client TypeScript and CSS together. Adding that
behavior would expand the build architecture without improving the single CSS
artifact delivered to the browser.
