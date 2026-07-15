# ADR-129: Codify a Thin Internal Design System

**Status:** Implemented

**Date:** 2026-07-15

## Context

Kirjolab's stylesheet and server-rendered workspace have grown across the
editor, Library, PDF review, settings, assistant, dialogs, and toolbars. They
already share semantic colors and interaction patterns, but the reusable
visual contract remains implicit among hundreds of selectors and repeated
class-bearing templates.

A standalone package or component framework would duplicate the Worker-first
application architecture and weaken the lightweight Tailwind decision in
ADR-006. Continuing with page-local recipes would make accessibility states,
touch targets, and both themes increasingly inconsistent.

## Decision

Kirjolab will maintain a thin internal design system under `src/ui/` with four
layers: CSS foundation tokens, CSS visual primitives, shared state and
accessibility contracts, and a typed trusted SVG icon registry. Small markup
helpers may compose those layers in Worker-rendered views.

The existing Tailwind entry point imports the foundation and primitive CSS.
Domain components retain their behavior and layout authority and compose the
system rather than moving into it. The system remains source-local: no React,
Storybook, npm package, runtime dependency, or second application architecture.
A local-only visual inventory and browser assertions cover representative
primitive states.

## Trigger

Repeated controls and inline SVG geometry now span enough independent surfaces
that consolidation is smaller and safer than continued duplication.

## Consequences

**Positive:**

- Theme, type, spacing, control sizing, focus, disabled, loading, selected,
  destructive, compact, and coarse-pointer behavior have named authorities.
- Shared SVGs and icon-only accessibility wiring become typed and reusable.
- Domain surfaces can converge incrementally without a framework migration.

**Negative:**

- Contributors must decide whether a rule is a primitive or domain-specific.
- CSS imports and the visual inventory add a small maintenance surface.

**Neutral:**

- Existing HTML IDs, client event ownership, and domain state remain unchanged.
- Tailwind utilities remain valid for one-off layout composition.

## Alternatives Considered

### Adopt a component framework and Storybook

This offers a mature catalog but adds runtime and tooling weight that is
disproportionate for Worker-rendered HTML.

### Keep all styles and SVGs local to each feature

This avoids an extraction step but keeps duplicating interaction contracts and
makes visual regressions across themes and input modes harder to detect.

### Publish a reusable design-system package

Kirjolab has one product surface and no independent consumers. A package would
add versioning and release boundaries without current value.
