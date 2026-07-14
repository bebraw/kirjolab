# ADR-098: Ignore Static Mutants Locally

**Status:** Implemented

**Date:** 2026-07-14

**Amends:** [ADR-028](./ADR-028-use-incremental-local-mutation-gate.md)

## Context

The local incremental mutation gate detected eight static mutants, only three percent of the mutant set, that Stryker estimated would consume 62 percent of the test runtime. Static mutants execute while modules load, so Stryker cannot switch them inside an already-running test environment and must use a fresh environment for each run.

The local gate exists to provide a strong, repeatable development signal without duplicating the clean full mutation run reserved for GitHub. Ignoring static mutants everywhere would improve runtime but remove them from the authoritative mutation score.

## Decision

The local `npm run mutation:incremental` command will run `stryker run --incremental --ignoreStatic`.

The full `npm run mutation` command and the GitHub `quality-mutation` job will remain unchanged. They will continue to execute static mutants and enforce the configured mutation threshold against the full mutant set.

## Trigger

Stryker reported that a small static-mutant subset dominated the runtime of the repeated local mutation gate.

## Consequences

**Positive:**

- Repeated local mutation runs avoid the most disproportionate test cost.
- GitHub retains a clean mutation result that includes static mutants.
- The optimization uses Stryker's supported command-line option and requires no wrapper or dependency.

**Negative:**

- Local and GitHub mutation scores can differ because ignored static mutants do not count toward the local score.
- A defect detectable only through a static mutant may not be reported until GitHub runs the full mutation job or a contributor invokes `npm run mutation` locally.

**Neutral:**

- Incremental result data and mutation reports remain under the existing ignored `reports/` target.

## Alternatives Considered

### Ignore Static Mutants In Every Mutation Run

This would maximize the performance improvement, but it would permanently remove static mutants from the authoritative score and weaken the clean GitHub signal.

### Keep Testing Static Mutants Locally

This preserves exact local and GitHub mutation coverage, but eight mutants were estimated to consume most of the local mutation runtime and undermine the purpose of the incremental development path.

### Hide The Slow-Mutant Warning

Disabling Stryker's slow warning would reduce log noise without reducing the underlying runtime cost.
