# ADR-008: Allow Static README Screenshots Without Tooling

**Status:** Superseded by [ADR-016](./ADR-016-allow-lightweight-local-readme-screenshot-tooling.md)

**Date:** 2026-03-28

## Context

ADR-007 removed screenshot tooling and screenshot automation from the template because the workflow cost was not worth carrying in the baseline. That decision removed too much for the current repo goal: the user still wants the README to show the application visually.

The repo now has a concrete starter UI that benefits from a single committed screenshot in the README, but that does not require restoring automation, npm scripts, or CI work.

## Decision

We will allow committed static application screenshots in the README while still keeping screenshot tooling and screenshot automation out of the template baseline.

The repo now uses:

- a committed screenshot asset at `docs/screenshots/home.png`
- a README image reference to that file
- manual refresh when the starter UI changes materially

The repo will still not ship screenshot-specific scripts or screenshot-sync workflows.

## Trigger

The user explicitly asked to include application screenshots in the README, but did not ask to restore the earlier screenshot tooling surface.

## Consequences

**Positive:**

- The README can show the starter app visually.
- The template stays lightweight because no screenshot automation returns.
- The decision stays explicit instead of quietly contradicting ADR-007.

**Negative:**

- Screenshot refresh becomes a manual maintenance step.
- The committed image can drift if contributors change the UI and forget to refresh it.

**Neutral:**

- This changes documentation assets, not the runtime or test architecture.

## Alternatives Considered

### Keep the README text-only

This was rejected because the user explicitly wants the README to include an application screenshot.

### Restore screenshot tooling or push-based screenshot automation

This was rejected because it would reintroduce the exact maintenance and runtime cost that ADR-007 removed.
