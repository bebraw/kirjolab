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

## Decision

Run `quality-mutation` only for GitHub pull requests. Do not run a duplicate
mutation job after the pull request merges to `main`. Keep the existing check
name required by branch protection and bound the job to 30 minutes.

Add `npm run mutation:ci` as the GitHub-owned selector. From the pull request's
explicit base and head SHAs, it will inspect added, copied, modified, and renamed
paths and select only affected files inside Stryker's configured production
surface. A changed colocated Node unit test maps back to its production source
when that source exists. Changes to `package.json`, `package-lock.json`,
`stryker.config.mjs`, `tsconfig.json`, or `vitest.config.mts` add
`src/views/app-navigation.ts` as a stable canary so a configuration-only pull
request still exercises Stryker. Changes to the CI workflow or affected-mutation
routing scripts add the same canary so the selector verifies its own contract.
Require full commit SHAs and verify that both commits exist locally; fail with a
clear error instead of silently expanding a missing diff to the full mutation
surface.

Invoke the selected scope through the non-incremental `mutation:affected`
command with the TypeScript checker, `--ignoreStatic`, an explicit `--mutate`
list, and the progress reporter only. If no production source or canary is
selected, complete the required check successfully without starting Stryker.

Keep `npm run mutation` as the explicit full repository command for intentional
local or manual audits. It continues to include static mutants and the full
configured reporters. The configured mutation threshold remains blocking for
both full audits and affected runs, but the pull-request result describes only
its selected source scope and is not a replacement repository-wide score.

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

- Pull-request mutation cost follows the changed production surface instead of
  total repository size.
- Static-mutant startup cost and oversized detailed CI output leave the
  required path without removing either from explicit full audits.
- Documentation-only and unrelated runtime changes still receive a successful
  required check without launching Stryker.
- Configuration-only changes cannot turn into a vacuous pass because the
  stable canary exercises the effective mutation configuration.
- Missing or malformed pull-request commits fail explicitly instead of causing
  an accidental full run.
- Configuration changes no longer force an unrelated full incremental rebuild
  before push.
- Merging a checked pull request does not immediately repeat its mutation work.

**Negative:**

- The required pull-request check no longer detects inherited survivors in
  untouched files or defects exposed only by static mutants.
- Test-to-source mapping and the stable canary must stay aligned with the
  configured mutation surface.
- Shared test-support and non-colocated test changes do not select every
  production consumer transitively. The fast test gates still execute those
  tests, and an intentional full mutation audit remains available when their
  assertion-strength impact needs broader measurement.
- A broad pull request can still reach the 30-minute bound and must then be
  split, hardened locally, or investigated explicitly.
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
