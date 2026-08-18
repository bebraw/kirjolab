# ADR-225: Use an Instrumented Dry Run for Required Mutation CI

**Status:** Implemented

**Date:** 2026-08-18

**Amends:** [ADR-022](./ADR-022-add-mutation-testing-gate.md),
[ADR-030](./ADR-030-reserve-full-mutation-ci-for-github.md),
[ADR-213](./ADR-213-protect-main-with-authoritative-ci.md), and
[ADR-216](./ADR-216-bound-pull-request-mutation-ci.md)

## Context

ADR-216 bounded the required GitHub mutation job to production sources selected
from a pull request's exact base-to-head diff. That keeps ordinary changes
proportionate, but a broad pull request that adds several production modules
still selects every mutant in each new file.

[GitHub run 32139011792](https://github.com/bebraw/kirjolab/actions/runs/32139011792/job/95716965319)
selected 24 source files, instrumented 4,930 mutants, and produced 4,825
eligible mutation plans. Its initial instrumented Vitest run completed 848 tests
in 27 seconds. After the remaining mutation phase ran until the 30-minute job
limit, only 964 plans had completed and Stryker estimated roughly another five
hours. The two-core hosted runner exposed one checker and one test runner under
the configured relative concurrency. Doubling that concurrency would not bring
the work within the existing bound.

The immediately preceding failure also demonstrated a distinct useful remote
signal: a boundary-sized fixture passed normal tests but timed out only inside a
Stryker worker during the initial instrumented run. That compatibility signal
is inexpensive and is not supplied by ordinary Vitest or typechecking.

Kirjolab already runs scored affected mutation before push and retains explicit
affected, incremental, and full local mutation commands. Requiring hours of
duplicate hosted work makes broad feature pull requests operationally
unmergeable without providing a bounded feedback loop.

## Decision

Keep the GitHub `quality-mutation` check required, pull-request-only, and clean,
but define it as a Stryker compatibility smoke rather than a mutation-score
gate.

Retain the exact base and head SHA validation, NUL-safe status diff, changed-line
projection, deletion fallback, test-to-source mapping, configuration canary,
and empty-scope success established by ADR-216. For a non-empty selected scope,
invoke the existing non-incremental `mutation:affected` command with an explicit
`--mutate` list, `--dryRunOnly`, and the progress reporter. Stryker must still
select and instrument the requested production code, create its sandbox, set
the worker environment, and complete the related initial Vitest run. Any
selection, instrumentation, sandbox, or test failure fails the required check.

Do not execute mutant plans or per-mutant TypeScript checks, finalize a
pull-request JSON mutation-result report, or evaluate a remote mutation score
threshold. Remove the dedicated pull-request Stryker configuration and report postprocessor.
Reduce the GitHub job timeout from 30 minutes to 10 minutes. Keep the
`quality-mutation` job name so the existing branch-protection context remains
stable, while naming the workflow step as a mutation compatibility smoke.

Keep the base Stryker break threshold of 68 blocking for full, affected,
incremental, and pre-push mutation runs. `npm run mutation` remains the explicit
full audit. The required GitHub check now proves clean Linux Stryker
compatibility; it does not prove assertion strength or a mutation score.

## Consequences

**Positive:**

- Required pull-request feedback remains bounded even when new production files
  contain thousands of mutants.
- GitHub still catches Stryker selection, instrumentation, sandbox, worker-only,
  and initial-test regressions such as the boundary-fixture timeout.
- The existing required check context and branch-protection configuration do
  not need an external migration.
- Scored mutation remains available at the affected pre-push boundary and
  through explicit local commands.

**Negative:**

- Branch protection no longer proves that changed mutants meet a coverage or
  detection floor.
- A pull request can pass remote CI with surviving or uncovered mutants,
  especially if a contributor bypasses the repository-managed pre-push hook.
- Hosted and local mutation checks now provide deliberately different evidence,
  so documentation and check names must describe that distinction clearly.

**Neutral:**

- Pull-request source selection remains more detailed than a plain full-suite
  dry run because it also verifies the diff-derived Stryker input contract.
- Pushes to `main` still do not repeat the GitHub mutation job.

## Alternatives Considered

### Split every broad pull request

ADR-216 documents splitting as the existing fallback. It preserves a remote
score, but makes mergeability depend on arranging product work around mutation
runner capacity and can require artificial cross-layer sequencing.

### Shard and aggregate affected mutation

Deterministic shards could preserve the scored contract, but this pull request
would need many parallel hosted jobs plus report aggregation and failure
recovery. That runner cost and orchestration are disproportionate for the
lightweight template baseline.

### Increase hosted concurrency or use a larger runner

Two mutation workers would improve throughput by at most roughly twofold for
the observed job, far short of the order-of-magnitude reduction needed. Larger
paid runners would make the baseline depend on repository-specific spending.

### Remove the required job entirely

This would also require changing branch protection and would discard the cheap
Stryker-worker compatibility signal that caught the preceding regression.

### Sample or cap mutant execution

A partial result would be faster but would not provide a stable or comparable
mutation score, and it could omit the behavior most in need of stronger tests.
