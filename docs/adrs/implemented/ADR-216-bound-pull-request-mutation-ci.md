# ADR-216: Bound Required Mutation CI to Pull Request Changes

**Status:** Implemented

**Date:** 2026-08-03

**Amends:** [ADR-022](./ADR-022-add-mutation-testing-gate.md),
[ADR-028](./ADR-028-use-incremental-local-mutation-gate.md),
[ADR-030](./ADR-030-reserve-full-mutation-ci-for-github.md),
[ADR-092](./ADR-092-prewarm-agent-ci-dependencies-explicitly.md),
[ADR-098](./ADR-098-ignore-static-mutants-locally.md),
[ADR-134](./ADR-134-keep-mutation-explicit.md),
[ADR-148](./ADR-148-prefer-native-local-ci.md),
[ADR-162](./ADR-162-run-deep-quality-checks-before-push.md),
[ADR-166](./ADR-166-separate-browser-binders-from-mutation-contracts.md),
[ADR-176](./ADR-176-rebase-aggregate-mutation-threshold.md), and
[ADR-213](./ADR-213-protect-main-with-authoritative-ci.md)

## Context

The required GitHub `quality-mutation` job still ran clean Stryker against the
entire configured repository surface. A run over 272 production files generated
50,438 mutants and reached GitHub's six-hour job limit before completing.
Static mutants were a disproportionate part of that cost, and the detailed
report also exceeded GitHub's useful step-summary size.

The repository already has an affected-source selector for pre-push mutation
feedback. Pull requests also provide an exact base and head, so the required
remote check can remain clean and deterministic without retesting unrelated
production code. A required check must still report success for documentation
or other changes outside Stryker's configured surface.

The first pull-request selector bounded mutation by affected production file,
but that remained too coarse. A
[follow-up GitHub run](https://github.com/bebraw/kirjolab/actions/runs/30814770567/job/91689692940)
timed out after 30 minutes 16 seconds with 5,015 of 6,930 selected mutants
tested and one checker and one test runner active. Directly changed lines
provide the next deterministic boundary without making a required check depend
on incremental cache state.

The measured changed-line report contained 3,154 valid mutants. Of those,
2,852 were covered (90.42%) and 1,922 were detected (67.39% of covered
mutants). Coverage is already above the intended pull-request floor, while
detection strength is below it. With the covered denominator held constant,
reaching 68% requires 1,940 detected mutants, 18 more than the measured report.
Tests must harden that detection result; the floor must not be lowered to fit
the current snapshot.

## Decision

Run `quality-mutation` only for GitHub pull requests. Do not run a duplicate
mutation job after the pull request merges to `main`. Keep the existing check
name required by branch protection and bound the job to 30 minutes.

Add `npm run mutation:ci` as the GitHub-owned selector. From the pull request's
explicit base and head SHAs, first read a NUL-delimited
`git diff --name-status --diff-filter=ACMRD -z base...head` so deleted paths and
both old and new rename paths remain available. Omit a deleted production source
because no head-side file remains to mutate. For every surviving directly
changed production source, derive positive new/head-side hunk spans from a
zero-context diff. Pass both old and new paths with explicit rename detection
when the source moved so Git preserves rename ancestry instead of reporting a
full addition; otherwise pass the head-side path. Coalesce overlapping or
adjacent spans and emit explicit Stryker patterns in `file.ts:start-end` form. Stryker
mutates only AST nodes fully contained by a range, so promote a surviving source
to a full-file pattern if it has any deletion-only hunk or no positive new-side
span. A full-file reason always dominates ranges for the same source.

Map a changed, deleted, or renamed colocated Node unit test to its surviving
production counterpart as a full-file pattern only when that source was not
directly changed. If the source itself also changed, keep its direct range or
safety-fallback selection instead of widening it for the test. Changes,
deletions, or renames involving `package.json`, `package-lock.json`,
`stryker.config.mjs`, `tsconfig.json`, or `vitest.config.mts` add
`src/views/app-navigation.ts` as an always-full-file stable canary so a
configuration-only pull request still exercises Stryker. Changes, deletions, or
renames involving the CI workflow or affected-mutation routing scripts add the
same full-file canary so the selector verifies its own contract. The canary's
full-file selection dominates any direct ranges for that source. Require full
commit SHAs and verify that both commits exist locally; fail with a clear error
instead of silently expanding a missing diff to the full mutation surface.

Invoke the selected scope through the non-incremental `mutation:affected`
command with the TypeScript checker, `--ignoreStatic`, an explicit `--mutate`
list of line-range and full-file patterns, and the dedicated
`stryker.pr.config.mjs` configuration. That configuration inherits the base
mutation settings but disables Stryker's built-in raw break threshold only for
the pull-request run and requests console progress plus a JSON report under the
existing disposable `reports/mutation/` target. If no production range,
full-file safety fallback, test-mapped source, or canary is selected, complete
the required check successfully without starting Stryker.

After Stryker finishes successfully, postprocess its JSON report. Treat
`Killed`, `Timeout`, `Survived`, and `NoCoverage` mutants as valid; treat
`Killed`, `Timeout`, and `Survived` mutants as covered; and treat `Killed` and
`Timeout` mutants as detected. `Timeout` therefore counts as detection.
`CompileError` and `Ignored` mutants are excluded from the metrics. A report
containing `Pending` or `RuntimeError`, or a missing or malformed report, fails
closed instead of producing a score. A report with zero valid mutants passes.
Otherwise require both of these results:

- changed-mutant coverage, `covered / valid`, is at least 90%; and
- covered mutation score, `detected / covered`, is at least 68%.

Separating coverage from detection prevents an uncovered changed mutant from
being hidden inside one raw aggregate score while preserving an assertion-
strength floor for mutants that the selected tests actually execute.

Keep `npm run mutation` as the explicit full repository command for intentional
local or manual audits. It continues to include static mutants and the full
configured reporters. The base `stryker.config.mjs` break threshold remains 68
for full, affected, incremental, and pre-push mutation runs. Only the dedicated
pull-request configuration disables the built-in raw break because Stryker's
raw `detected / valid` score conflates no-coverage and detection strength for a
changed-line denominator. The pull-request result describes only its selected
source scope and is not a replacement repository-wide score.

Align pre-push configuration routing with the same bounded rule: mutate affected
configured sources plus the stable canary instead of automatically rebuilding
the full incremental report. Keep `npm run mutation:incremental:refresh`
available as an explicit manual full-surface cache refresh.

This decision replaces only the earlier ADR statements that GitHub's required
job is a full repository run, that the required job includes static mutants or
repeats on pushes to `main`, and that mutation-configuration pushes force a full
incremental pre-push run. It retains ADR-030's GitHub-only workflow boundary,
ADR-134's explicit local full command, ADR-162's affected pre-push routing,
ADR-176's configured threshold, and ADR-213's required `quality-mutation` check.

## Consequences

**Positive:**

- Pull-request mutation cost follows directly changed production lines instead
  of total repository size or every mutant in a large affected file.
- Static-mutant startup cost and oversized detailed CI output leave the
  required path without removing either from explicit full audits.
- Documentation-only and unrelated runtime changes still receive a successful
  required check without launching Stryker.
- Configuration-only changes cannot turn into a vacuous pass because the
  stable canary exercises the effective mutation configuration.
- The pull-request gate exposes changed-mutant coverage separately from the
  detection strength of covered mutants and fails closed on incomplete or
  malformed reports.
- Missing or malformed pull-request commits fail explicitly instead of causing
  an accidental full run.
- Configuration changes no longer force an unrelated full incremental rebuild
  before push.
- Merging a checked pull request does not immediately repeat its mutation work.

**Negative:**

- The required pull-request check no longer detects inherited survivors in
  untouched files or defects exposed only by static mutants.
- Line-scoped direct changes can miss mutants outside the changed hunks whose
  behavior is affected indirectly, including AST nodes that cross a range edge.
  Deletion-only hunk fallback, test-only full-file mapping, and intentional full
  audits provide broader evidence at their explicit boundaries.
- A deleted production source contributes no mutation pattern because it no
  longer exists at the pull-request head; the fast and browser gates remain
  responsible for deletion regressions.
- Test-to-source mapping and the stable canary must stay aligned with the
  configured mutation surface.
- Shared test-support and non-colocated test changes do not select every
  production consumer transitively. The fast test gates still execute those
  tests, and an intentional full mutation audit remains available when their
  assertion-strength impact needs broader measurement.
- A broad pull request can still reach the 30-minute bound and must then be
  split, hardened locally, or investigated explicitly.
- The measured changed-line baseline initially misses the 68% covered mutation
  floor, so tests must kill more covered mutants before the required check can
  pass.
- A score for an affected subset is not directly comparable with the aggregate
  score from `npm run mutation`.

**Neutral:**

- GitHub still starts the check from a clean checkout and does not consume
  Stryker's incremental cache.
- Fast and browser jobs may still run after merge according to the workflow's
  push policy; only the redundant mutation job is removed.

## Alternatives Considered

### Keep the clean full GitHub run

This preserves one repository-wide score on every pull request, but the current
surface already exceeds GitHub's six-hour job limit and will grow with the
product.

### Mutate every affected production file

This was the first bounded implementation, but a 6,930-mutant affected-file run
timed out after 30 minutes 16 seconds with only 5,015 mutants tested.
Changed-line ranges preserve clean diff-derived selection at a materially
smaller scope.

### Apply the base raw 68% break to pull requests

The measured changed-line report's raw score is 1,922 detected mutants divided
by 3,154 valid mutants, or 60.94%. That value combines 302 uncovered mutants
with survivors, so it does not distinguish missing test reach from weak
assertions. The dedicated pull-request gate measures both dimensions directly.

### Lower the covered mutation floor to the measured result

Rounding the current 67.39% covered score down would make the first snapshot
pass, but it would encode current assertion weakness as policy. Keep the 68%
floor and harden the tests instead.

### Shard the complete mutation surface

Sharding could keep individual jobs under the limit, but it would multiply
runner use, reporting, and orchestration while still retesting unrelated code
and paying static-mutant startup costs.

### Remove mutation from required CI

This gives the shortest workflow but drops the assertion-strength boundary from
branch protection. A clean affected run preserves that signal for changed code.

### Reuse incremental mutation data in GitHub

An incremental cache could avoid some work, but cache ancestry and invalidation
would make a required result depend on mutable state outside the pull request.
The affected selector is deterministic from the checked-out base and head.
