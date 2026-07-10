# ADR-025: Skip Agent CI for Docs-Only Changes

**Status:** Implemented

**Date:** 2026-05-25

## Context

The repo treats local Agent CI as the default readiness check before proposing or landing work. That is appropriate for code, tooling, workflow, package, and test changes because local Agent CI validates the same split workflow shape used remotely.

For documentation-only changes, Agent CI is often disproportionate. It spends time rebuilding and retesting executable paths that the change cannot affect, which slows small documentation edits without improving confidence.

## Decision

Documentation-only changes may skip `npm run ci:local` when they do not alter executable config, generated artifacts, package metadata, source code, or tests.

Agents should still run the smallest relevant local checks for the touched files, such as `npm run format:check` for Markdown formatting. Non-documentation changes continue to require the readiness baseline of `npm run quality:gate` and `npm run ci:local`.

## Trigger

The current readiness wording made local Agent CI mandatory even when a change only updates documentation. The template should keep strong validation for executable changes while avoiding unnecessary local workflow runs for docs-only edits.

## Consequences

**Positive:**

- Documentation-only edits can move faster without reducing executable confidence.
- The local Agent CI loop remains focused on changes that can affect runtime, tooling, tests, or workflows.
- The exception is explicit enough for agents to apply consistently.

**Negative:**

- Contributors must classify docs-only changes carefully.
- Documentation that changes executable instructions still needs judgment about whether targeted checks are enough.

**Neutral:**

- Remote CI behavior is unchanged.
- Code and tooling changes still use the existing full readiness baseline.

## Alternatives Considered

### Keep Agent CI mandatory for every change

This was rejected because it wastes local CI time on edits that cannot affect executable behavior.

### Skip all checks for documentation-only changes

This was rejected because formatting and link-adjacent documentation issues are still worth catching with lightweight targeted checks.
