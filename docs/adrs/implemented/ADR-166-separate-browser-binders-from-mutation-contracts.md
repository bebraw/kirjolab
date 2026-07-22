# ADR-166: Separate Browser Binders from Mutation Contracts

**Status:** Implemented

**Date:** 2026-07-22

**Amends:** [ADR-022](./ADR-022-add-mutation-testing-gate.md),
[ADR-134](./ADR-134-keep-mutation-explicit.md),
[ADR-162](./ADR-162-run-deep-quality-checks-before-push.md)

## Context

The review-study browser module combines DOM event wiring with deterministic
publication and research-question transformations. Playwright exercises the DOM
binder, but the Node mutation runner cannot execute that browser orchestration.
Mutating the combined module therefore produced thousands of uncovered mutants
that measured runtime-boundary incompatibility rather than assertion strength.

Excluding the whole feature would hide deterministic logic that is inexpensive
to test precisely. Keeping the combined module in Stryker would make the
repository score depend mostly on code outside the selected test runtime.

## Decision

Separate deterministic review-study contracts into a Node-testable module and
keep that module in Stryker's mutation surface. Exclude only the browser DOM
binder, which remains covered by the browser gate.

Apply the same boundary rule to future browser orchestration exclusions:

- extract pure validation, identity, request, and mapping contracts first;
- retain those contracts in Node unit and mutation testing;
- exclude only the browser-runtime binder exercised by Playwright;
- keep the pre-push mutation selector aligned with Stryker's exclusions; and
- preserve the existing mutation threshold.

## Consequences

**Positive:**

- Mutation results measure assertion strength for code the selected runner can
  execute.
- Deterministic review publication contracts receive focused unit and mutation
  coverage.
- Browser orchestration retains end-to-end coverage without requiring a DOM
  emulation dependency.

**Negative:**

- The feature has one additional module boundary.
- Stryker and the pre-push selector maintain matching exclusion lists.

**Neutral:**

- The repository-wide mutation threshold remains unchanged.
- Exclusion is based on runtime responsibility, not module size or a low score.

## Alternatives Considered

### Exclude the combined review-study module

This removes irrelevant uncovered mutants but also removes deterministic
contracts from mutation testing.

### Run the browser suite through Stryker

This would test the binder in its native runtime, but it would make the local
mutation loop substantially slower and duplicate the separate browser gate.

### Add a DOM emulation dependency

This could execute more of the binder in Node, but adds setup and behavior that
does not match the real browser as closely as the existing Playwright coverage.
