# ADR-028: Use Incremental Local Mutation Gate

**Status:** Implemented

**Date:** 2026-05-31

**Amends:** [ADR-022](./ADR-022-add-mutation-testing-gate.md)

**Amended by:** [ADR-030](./ADR-030-reserve-full-mutation-ci-for-github.md)

## Context

ADR-022 added Stryker mutation testing to the full quality gate and CI workflow. That improved assertion-strength checks, but full local mutation runs slow down regular development once the source and test surface grows.

Stryker supports incremental mode, which stores mutation results and reuses valid prior results on later runs. Incremental mode is well suited to repeated local quality-gate checks because most routine changes touch source and tests rather than package metadata, Stryker configuration, Vitest configuration, TypeScript configuration, or other execution environment inputs.

GitHub Actions remains the right place to run a full mutation pass because it starts from a clean checkout and protects the main branch from incremental-report drift or missed environment changes.

## Decision

The local baseline quality gate will use incremental mutation testing:

- `npm run mutation` remains the full Stryker run.
- `npm run mutation:incremental` runs `stryker run --incremental`.
- `npm run quality:gate` runs the fast gate, browser gate, and `npm run mutation:incremental`.
- The GitHub Actions `quality-mutation` job continues to run `npm run mutation`.
- Stryker incremental data stays under the ignored `reports/` write target.

## Trigger

The user wanted regular local development to avoid repeated full mutation runs while keeping full Stryker coverage in GitHub CI.

## Consequences

**Positive:**

- Repeated local quality-gate runs can be much faster after the first incremental mutation run.
- The full Stryker command remains available for local verification when configuration, dependency, or environment-sensitive changes warrant it.
- GitHub CI keeps a clean full mutation signal.

**Negative:**

- The local quality gate now depends on Stryker's incremental reuse logic.
- The first incremental run is still a full mutation run because there is no prior report to reuse.

**Neutral:**

- No new dependencies are required.
- The existing ignored `reports/` write target already covers the incremental report.

## Alternatives Considered

### Keep full mutation in the local quality gate

This preserved the strongest local signal but kept the slow path in the regular development loop.

### Add a changed-file mutation wrapper

This could scope Stryker to files from `git diff`, but it would add repo-specific script logic around renames, test-only changes, and configuration changes. Incremental mode provides the same core benefit through Stryker's built-in model.

### Use incremental mutation in GitHub Actions too

This would require artifact storage and drift handling for the incremental report. The current template stays simpler by keeping GitHub CI on a clean full mutation run.
