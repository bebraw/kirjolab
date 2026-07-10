# ADR-009: Split Fast And Browser Verification

**Status:** Accepted

**Amended by:** [ADR-022](./ADR-022-add-mutation-testing-gate.md)

**Amended by:** [ADR-023](./ADR-023-pin-github-actions-to-commit-shas.md)

**Date:** 2026-03-28

## Context

The template already enforces a full quality gate, but the verification path was still serialized. Formatting, type checking, dependency audit, unit coverage, and browser tests all ran as one chain, and the GitHub Actions workflow ran them in one job.

That structure kept the baseline simple, but it slowed feedback for common failures. A formatting or type error still waited behind the same overall job shape as the Playwright browser path, and superseded CI runs on the same branch continued to consume time even after a newer push existed.

The repo now has enough stable tooling to separate fast checks from browser checks without adding heavyweight infrastructure.

## Decision

We will split verification into:

- a fast gate for formatting, type checking, runtime dependency audit, and unit coverage
- a browser gate for Playwright end-to-end checks
- a full quality gate that runs the fast gate first and then the browser gate

The GitHub Actions workflow will:

- validate repository shape as part of the fast job
- run the fast and browser gates as separate jobs
- run the browser gate in the version-pinned Playwright container image instead of installing Chromium during the job
- cancel superseded runs for the same workflow and ref

The coverage gate will also treat colocated tests and test-support files as non-source inputs when deciding whether runtime source code lacks unit coverage.

## Trigger

The repo had reached the point where slow browser setup was the dominant verification cost, while quick failures still deserved earlier feedback. The earlier suggestion to split fast and browser verification became worth implementing once the Worker baseline and colocated tests stabilized.

## Consequences

**Positive:**

- Fast failures return earlier in remote CI.
- The browser job avoids repeated Chromium setup work by starting from the Playwright image.
- Superseded CI runs stop consuming time once a newer push exists.
- Local contributors gain a lighter `pnpm run quality:gate:fast` iteration path.
- The coverage gate's source detection better reflects actual runtime code.

**Negative:**

- The workflow is more complex than a single-job chain.
- Dependency installation now happens in more than one CI job.

**Neutral:**

- The full gate still remains the definition of done.
- Browser checks still dominate cold local Agent CI runs because fresh runner containers need browser dependencies.

## Alternatives Considered

### Keep one serialized job and rely only on caching

This was rejected because caching helps repeated browser downloads, but it does not change the fact that quick failures still wait behind a larger serialized verification path.

### Remove browser tests from the baseline gate

This was rejected because it would trade speed for weaker verification instead of restructuring the workflow to keep both speed and coverage.
