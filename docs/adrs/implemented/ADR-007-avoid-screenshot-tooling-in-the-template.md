# ADR-007: Avoid Screenshot Tooling in the Template

**Status:** Superseded by [ADR-008](./ADR-008-allow-static-readme-screenshots-without-tooling.md)

**Date:** 2026-03-28

## Context

The template already carries a meaningful local runtime, unit coverage, end-to-end tests, and local CI. Screenshot capture and screenshot-sync automation add maintenance cost, longer workflow runtimes, extra documentation churn, and another moving part that does not improve the core developer loop for most small experiments.

The user explicitly chose to drop screenshot functionality because the time cost is not worth it for this template.

## Decision

We will keep screenshot capture and screenshot automation out of the template baseline.

The repo will not ship:

- screenshot-specific npm scripts
- screenshot capture helpers under `scripts/`
- screenshot-sync GitHub Actions workflows
- screenshot automation or screenshot-specific helper tooling for committed assets

Projects cloned from this template can still add screenshot tooling later if they have a concrete need for it, but it is not part of the starter baseline.

## Trigger

Screenshot tooling had become a sidecar workflow with little value relative to its setup, runtime, and maintenance cost for a lightweight starter repository.

## Consequences

**Positive:**

- The template stays leaner and easier to understand.
- Local CI and GitHub Actions avoid extra browser-driven screenshot work.
- Contributors can focus on runnable behavior, tests, and docs without screenshot churn.

**Negative:**

- The repo no longer provides built-in visual asset generation for README or docs.
- Projects that want screenshot automation will need to add it themselves.

**Neutral:**

- The starter app remains fully testable through the existing unit, browser, and local CI flows.

## Alternatives Considered

### Keep manual screenshot capture only

This was rejected because even the manual utility adds surface area and maintenance cost to a template that is intentionally meant to stay small.

### Keep push-based screenshot automation

This was rejected because it increases workflow time and complexity for limited baseline value.
