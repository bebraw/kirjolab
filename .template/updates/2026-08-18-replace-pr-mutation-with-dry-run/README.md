# Replace Pull-Request Mutation with an Instrumented Dry Run

Use this update when a clean affected Stryker run still cannot finish within a
practical pull-request bound because broad changes select thousands of mutants.
It preserves the diff-derived Stryker scope and required check while moving
scored mutation evidence to affected pre-push and explicit local commands.

Apply this after the bounded pull-request mutation selector update. The smoke is
not mutation scoring: it proves that selected production code can be
instrumented and that its related tests pass inside a Stryker worker.

The focused patch switches runtime behavior and its existing tests first. After
it applies, finish the obsolete report-helper and pull-request-config cleanup
described below; those removals are intentionally left to manual adaptation
because downstream selector modules may have diverged.

## Apply

1. Keep the required `quality-mutation` job name, full-history checkout,
   pull-request-only trigger, and explicit base and head SHAs.
2. Keep exact SHA validation, NUL-safe status parsing, changed-line ranges,
   deletion fallback, test-to-source mapping, the configuration canary, and
   empty-scope success in `scripts/run-ci-mutation.mjs`.
3. Invoke the selected affected scope with `--dryRunOnly`, `--ignoreStatic`, a
   progress-only reporter, and an explicit `--mutate` list. Do not replace this
   with plain `npm test`; Stryker must still instrument code, create its sandbox,
   and set its worker environment.
4. Remove pull-request JSON reporting, score postprocessing, and any dedicated
   pull-request Stryker configuration that exists only to disable thresholds or
   write that report. Dry-run-only does not finalize a mutation-result report
   or evaluate a score threshold.
5. Reduce the GitHub job timeout to 10 minutes and describe the workflow step as
   a mutation compatibility smoke.
6. Keep the base Stryker break threshold unchanged and blocking for full,
   affected, incremental, and pre-push mutation. Keep `npm run mutation` as the
   explicit full audit.
7. Test the exact dry-run command, selector behavior, empty-scope behavior,
   workflow name and timeout, and the unchanged local mutation threshold.

## Fallback

If a remote mutation score remains a product requirement, do not sample or
silently cap mutant execution. Deterministically shard the selected scope,
aggregate every report, and apply the score only after all shards complete.
That is a larger orchestration decision with materially higher runner cost.

Removing the job entirely is cheaper but also loses Stryker-worker compatibility
coverage and requires a branch-protection migration.

## Verify

- `npm run test:tooling`
- `npm run mutation:affected -- --dryRunOnly --reporters progress --mutate <canary-source>`
- `npm run ci:local`
- On a pull request with a production change, confirm `quality-mutation`
  instruments the selected scope, reports a successful dry run without testing
  mutants, and completes inside the 10-minute bound.
- Confirm the affected pre-push path still executes mutants and enforces the
  base break threshold.
