# ADR-030: Reserve Full Mutation CI For GitHub

**Status:** Implemented

**Date:** 2026-06-01

**Amends:** [ADR-022](./ADR-022-add-mutation-testing-gate.md), [ADR-028](./ADR-028-use-incremental-local-mutation-gate.md)

**Amended by:** [ADR-134](./ADR-134-keep-mutation-explicit.md)

## Context

ADR-022 added a full Stryker mutation job to the GitHub Actions workflow, and ADR-028 moved the local quality gate to incremental mutation testing while keeping GitHub CI on a clean full mutation run.

Local Agent CI still reads `.github/workflows/ci.yml` directly. Without an explicit workflow guard, `npm run ci:local` can schedule the same `quality-mutation` job that is intended to be the GitHub-only clean-room signal. That makes the local CI loop duplicate expensive mutation work already covered by `npm run quality:gate` through incremental Stryker.

## Decision

The `quality-mutation` GitHub Actions job will run only when `github.server_url` is `https://github.com`.

This keeps `npm run ci:local` focused on the fast and browser workflow jobs, while GitHub Actions remains responsible for the full non-incremental mutation job.

## Trigger

The user asked to ensure the full mutation workflow job never runs locally and stays reserved for GitHub.

## Consequences

**Positive:**

- Local Agent CI no longer schedules the expensive full mutation workflow job.
- GitHub Actions still performs a clean full mutation run on pull requests and pushes to `main`.
- Contributors can still run incremental mutation testing explicitly with `npm run mutation:incremental`.

**Negative:**

- `npm run ci:local` no longer mirrors every GitHub Actions job exactly.
- Contributors who specifically want a local full mutation run must invoke `npm run mutation` directly.

**Neutral:**

- No new dependency or workflow file is required.
- GitHub retains the authoritative clean full-mutation signal.

## Alternatives Considered

### Split The Mutation Job Into A Separate Workflow

This would keep the local CI workflow file free of a GitHub-only job, but it would add another workflow file and more structure to a lightweight template.

### Remove Mutation From GitHub Actions

This would make local and remote workflow execution match again, but it would discard the clean full mutation signal that protects pull requests and `main`.

### Keep Running Full Mutation In Agent CI

This preserved exact local workflow parity but contradicted the local-development goal from ADR-028 and made `npm run ci:local` slower than necessary.
