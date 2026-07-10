# ADR-006: Adopt Tailwind for the Starter UI

**Status:** Accepted

**Date:** 2026-03-28

## Context

The Worker starter now has a concrete UI surface, but its first implementation used large inline style blocks inside the rendered HTML. That kept the stub self-contained, but it is not a good default once the repo already carries frontend-oriented tooling and a reusable styling baseline would help future experiments.

The reference `thesis-journey-tracker` repo already uses a lightweight Tailwind v4 pipeline:

- `tailwindcss` and `@tailwindcss/cli`
- a single `src/tailwind-input.css` entry file
- generated output written to `.generated/styles.css`
- Wrangler running the CSS build automatically before local development

That shape fits this template as well because it stays small, explicit, and easy to remove if a project chooses a different styling approach later.

## Decision

We will adopt the same lightweight Tailwind v4 setup pattern for the starter Worker UI.

The template now uses:

- `tailwindcss` and `@tailwindcss/cli` pinned in `devDependencies`
- `pnpm run build:css` to generate `.generated/styles.css`
- `src/tailwind-input.css` as the single Tailwind entry file
- Wrangler build configuration to run the CSS build automatically
- `/styles.css` served by the Worker from the generated stylesheet

This replaces large inline CSS blocks in the starter view with Tailwind-authored markup and a reusable CSS pipeline.

## Trigger

The Worker starter exists and is now a real frontend surface. The inline-style version is no longer the most evolvable default, and the reference repo already demonstrates a lightweight Tailwind setup that suits this template.

## Consequences

**Positive:**

- The starter UI is easier to evolve than a large inline `<style>` block.
- Styling conventions now match the reference Tailwind baseline the user asked to copy.
- Generated CSS remains out of version control and rebuilds automatically through Wrangler.

**Negative:**

- The template now carries a CSS build step and two extra frontend dependencies.
- Projects that do not want Tailwind will need to remove the pipeline.

**Neutral:**

- The starter app remains intentionally small; Tailwind changes the styling workflow more than the app behavior.

## Alternatives Considered

### Keep inline CSS in the rendered HTML

This was rejected because it makes the starter harder to extend and does not match the reference repo’s reusable styling setup.

### Add a heavier frontend bundler or component framework

This was rejected because the template should stay lightweight and preserve the current Worker-first architecture.
