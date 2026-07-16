# ADR-134: Keep Mutation Testing Explicit

**Status:** Implemented

**Date:** 2026-07-16

**Supersedes:** [ADR-028](./ADR-028-use-incremental-local-mutation-gate.md)

**Amends:** [ADR-022](./ADR-022-add-mutation-testing-gate.md), [ADR-030](./ADR-030-reserve-full-mutation-ci-for-github.md), [ADR-130](./ADR-130-emit-quality-gate-progress.md)

## Context

The default local `quality:gate` included incremental Stryker after fast and
browser verification. A cold incremental cache or a broad change still makes
that phase effectively a full-repository mutation run. As the runtime grew,
the phase consumed several minutes and multiple gigabytes while withholding
the concise readiness result contributors need from the routine gate.

Mutation testing remains valuable for measuring assertion strength. GitHub
Actions already runs the authoritative full mutation job from a clean checkout,
and both full and incremental commands are independently available locally.

## Decision

The default local `npm run quality:gate` will run, in order:

1. `npm run quality:gate:fast`
2. `npm run e2e`

`npm run mutation:incremental` remains an explicit local test-hardening command.
`npm run mutation` remains the explicit full local command and the authoritative
clean GitHub Actions mutation job. Local Agent CI continues to omit the
GitHub-only mutation job.

## Consequences

**Positive:**

- Routine local readiness has bounded, understandable phases.
- A cold mutation cache no longer turns the default gate into an unexpectedly
  long and memory-intensive command.
- Mutation testing remains available where its signal is intentional and in
  clean remote CI.

**Negative:**

- The default local readiness command no longer reports mutation strength.
- Contributors hardening domain tests must invoke incremental mutation
  explicitly rather than receiving it automatically.

**Neutral:**

- Mutation thresholds, configuration, reports, and GitHub workflow remain
  unchanged.
- The quality-gate progress runner still reports phase transitions and
  heartbeats for long browser runs.

## Alternatives Considered

### Keep incremental mutation in the default gate

This preserves one maximal local command, but its first or broadly invalidated
run remains close to a full mutation pass and makes routine readiness
disproportionately expensive.

### Remove local mutation commands

This would make GitHub the only mutation environment and slow test-hardening
work. Keeping both explicit commands preserves focused local use.

### Move mutation into the fast gate

This would make the feedback boundary less clear and contradict the purpose of
the fast iteration command.
