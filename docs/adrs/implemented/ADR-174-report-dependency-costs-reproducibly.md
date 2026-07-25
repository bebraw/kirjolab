# ADR-174: Report Dependency Costs Reproducibly

**Status:** Implemented

**Date:** 2026-07-25

## Context

Dependency-reduction pilots repeatedly measured direct production packages,
the installed production closure, and raw/gzip browser artifact sizes. Manual
shell pipelines made those comparisons difficult to reproduce and easy to
calculate with different compression or package-counting rules.

The measurements are advisory. Making them a quality-gate threshold would turn
normal dependency updates and build changes into unexplained failures.

## Decision

Provide `npm run diagnostics:dependencies` as a read-only report over
`package.json`, `package-lock.json`, and existing `.generated` browser
artifacts. Count unique production package/version pairs from lockfile package
entries and measure deterministic level-9 gzip output in Node.

Support human-readable Markdown by default and stable structured output through
`-- --json`. Fail with build guidance when a fingerprinted runtime is missing
or ambiguous. Do not write a report, add persistent state, or include the
diagnostic in CI.

## Consequences

**Positive:**

- Dependency proposals share one repeatable cost baseline.
- Package counts do not depend on npm tree rendering.
- Tooling tests protect lockfile counting, fingerprint selection, compression,
  and report formatting.

**Negative:**

- Artifact measurements require a prior successful browser build.
- The script knows the four browser artifacts that form the current baseline.

**Neutral:**

- The diagnostic remains advisory and introduces no dependency.
- Esbuild module attribution remains an explicit deeper investigation because
  per-package gzip attribution is not reliable.

## Alternatives Considered

### Keep manual commands in notes

This adds no tooling but preserves inconsistent counting and compression.

### Store generated reports

Committed or cached reports would create another synchronization and cleanup
responsibility without improving on-demand comparisons.

### Enforce size budgets in CI

Hard budgets can be useful for mature delivery targets, but these measurements
currently inform dependency decisions rather than define product correctness.
