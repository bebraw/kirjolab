# ADR-022: Add Mutation Testing Gate

**Status:** Accepted

**Date:** 2026-05-15

**Amends:** [ADR-009](./ADR-009-split-fast-and-browser-verification.md), [ADR-017](./ADR-017-prune-redundant-package-scripts.md)

**Amended by:** [ADR-028](./ADR-028-use-incremental-local-mutation-gate.md), [ADR-030](./ADR-030-reserve-full-mutation-ci-for-github.md)

## Context

The repo already requires high unit coverage for runtime `src/` code, but coverage only proves that tests execute code. It does not prove that the tests contain assertions strong enough to detect meaningful behavior changes.

StrykerJS provides mutation testing for JavaScript and TypeScript projects. Its current documentation recommends a checked-in config file, `stryker run`, the Vitest runner for Vitest projects, and the TypeScript checker when TypeScript mutants should be rejected before running tests.

The template now has a small enough runtime surface that mutation testing is practical as a full-gate check. The fast gate should remain focused on quick iteration, but the baseline readiness path should also verify assertion strength.

## Decision

We will add Stryker mutation testing as a separate mutation gate:

- `npm run mutation` runs `stryker run`.
- `stryker.config.mjs` configures Stryker with the Vitest runner and TypeScript checker.
- Mutation testing targets runtime `src/**/*.ts` files and excludes declarations, unit tests, end-to-end tests, and `src/test-support.ts`.
- Mutation reports are written under `reports/mutation/`.
- Stryker's temporary sandbox stays under ignored `.stryker-tmp/`.
- `npm run quality:gate` runs the fast gate, browser gate, and mutation gate in that order.
- The GitHub Actions workflow runs mutation testing as a separate `quality-mutation` job.

The mutation score break threshold is part of the quality gate, so mutation testing must fail the build when the score falls below the configured threshold.

## Trigger

The user asked to add mutation testing support based on the Stryker documentation and include it in the project quality gate.

## Consequences

**Positive:**

- The full quality gate now checks whether tests kill behavior-changing mutants instead of relying on coverage alone.
- Mutation testing is available as a focused standalone command during test hardening.
- CI preserves the existing split-gate model by isolating mutation testing in its own job.

**Negative:**

- Full local and CI readiness checks take longer because mutation testing reruns targeted tests against generated mutants.
- The template carries additional dev dependencies for Stryker, the Vitest runner, and the TypeScript checker.

**Neutral:**

- The fast quality gate and pre-push hook remain unchanged for quick iteration.
- The repo gains explicit Stryker output paths under existing ignored report and temp-directory conventions.

## Alternatives Considered

### Put mutation testing in the fast gate

This was rejected because mutation testing is intentionally heavier than formatting, type checking, audit, and unit coverage. Keeping it out of the fast gate preserves a quick iteration path.

### Use Stryker's command runner instead of the Vitest runner

This was rejected because the official Vitest runner supports Vitest projects directly and can use Stryker's coverage analysis instead of treating tests as an opaque command.

### Skip the TypeScript checker

This was rejected because type-invalid mutants waste test runner time and make reports less useful for TypeScript code.
