# ADR-070: Remove the README Screenshot

**Status:** Implemented

**Date:** 2026-07-12

## Context

ADR-020 kept a committed README screenshot while making its refresh a manual
documentation task. The application has since changed materially, and the
committed image now describes an obsolete interface. Keeping it until a future
manual refresh makes the README less accurate than omitting the image.

## Decision

We will remove the README application screenshot and its committed asset from
the template baseline. The README will describe the current product and runtime
in text without promising a visual representation that can drift independently.

Screenshot tooling and automation remain outside the baseline. A future change
may add a screenshot only when it also provides a current asset and updates the
README documentation contract explicitly.

## Trigger

The user asked to remove the stale screenshot rather than block the UI cleanup
on capturing a replacement.

## Consequences

**Positive:**

- The README no longer presents an obsolete interface as current.
- UI changes do not create an implicit screenshot-maintenance obligation.
- The template carries one fewer documentation artifact that can drift.

**Negative:**

- Readers cannot preview the application visually from the README alone.

**Neutral:**

- The optional README screenshot capability kit remains available to projects
  that choose to own screenshot tooling.

## Alternatives Considered

### Keep the stale screenshot until a replacement is available

This was rejected because a misleading screenshot is worse than no screenshot.

### Capture a replacement before removing the old image

This was rejected for this change because the requested outcome is to remove
the screenshot entirely for now.
