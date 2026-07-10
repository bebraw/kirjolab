# ADR-020: Keep README Screenshot Refresh Manual

**Status:** Accepted

**Date:** 2026-05-08

## Context

ADR-016 allowed a lightweight local screenshot script for refreshing the committed README image. That made screenshot refresh repeatable, but it also kept screenshot work visible as a normal development command.

Screenshot capture is time intensive enough that it should not be part of the expected development loop for this template. The README can still include a committed screenshot, but updating it should be an explicit manual documentation task handled by the developer when the UI changes materially.

## Decision

We will keep README screenshot refresh manual and outside the automated development loop.

The repo keeps:

- a committed screenshot asset at `docs/screenshots/home.png`
- a README image reference to that asset
- manual developer ownership for refreshing the asset when the starter UI changes materially

The repo will not ship:

- a `screenshot:home` package script
- a baseline `scripts/run-home-screenshot.mjs` helper
- screenshot capture in the quality gate, local CI, remote CI, or routine development command list

The optional README screenshot capability kit can still provide screenshot tooling for other repos that explicitly choose that capability.

## Trigger

The user asked to drop README screenshot updates from the development loop because the work is time intensive and better handled manually by the developer.

## Consequences

**Positive:**

- Routine development guidance stays focused on checks that protect runnable behavior.
- The template no longer carries a screenshot-specific baseline script.
- Screenshot updates become an intentional documentation task instead of an expected automated step.

**Negative:**

- README screenshots may drift for longer after UI changes.
- Contributors who want repeatable screenshot capture need to add or apply tooling explicitly.

**Neutral:**

- The committed screenshot remains documentation, not a source of visual truth.

## Alternatives Considered

### Keep the local screenshot script but remove it from docs

This was rejected because an undocumented baseline script still leaves screenshot tooling in the template surface.

### Keep screenshot capture in CI

This was rejected because screenshot capture would add recurring workflow cost and churn to the template baseline.
