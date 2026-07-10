# ADR-016: Allow Lightweight Local README Screenshot Tooling

**Status:** Superseded by [ADR-020](./ADR-020-keep-readme-screenshot-refresh-manual.md)

**Date:** 2026-04-19

## Context

ADR-008 allowed a committed README screenshot while explicitly keeping screenshot tooling out of the template baseline. That kept the repo light, but it also left screenshot refresh as an undocumented manual capture step that was harder to repeat consistently after UI changes.

The repo already carries Playwright for browser verification, so a small local screenshot command can reuse pinned tooling without adding dependencies or CI work.

## Decision

We will allow a lightweight local screenshot script for the committed README image.

The repo now uses:

- a committed screenshot asset at `docs/screenshots/home.png`
- a repo-pinned local script at `scripts/run-home-screenshot.mjs`
- a package entry point at `npm run screenshot:home`
- local-only screenshot refresh when the starter UI changes materially

The repo will still not ship screenshot-sync workflows or CI screenshot automation.

## Trigger

The user explicitly asked to add a script for generating the screenshot after updating the starter UI and screenshot asset.

## Consequences

**Positive:**

- Screenshot refresh becomes repeatable and documented.
- The script reuses already-pinned browser tooling instead of adding new dependencies.
- The README image can stay closer to the real starter UI.

**Negative:**

- The template now carries one screenshot-specific script.
- Contributors still need to remember to run it when the UI changes materially.

**Neutral:**

- Screenshot generation remains a local documentation task, not part of runtime behavior or CI.

## Alternatives Considered

### Keep screenshot refresh fully manual

This was rejected because the repo already had the browser tooling needed for a repeatable local command, and the user explicitly asked for that command.

### Add screenshot automation to CI or remote workflows

This was rejected because it would add recurring workflow cost and screenshot churn to the template baseline.
