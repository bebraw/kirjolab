# Bound Pull-Request Mutation CI to Changed Lines

Use this update when a clean, repository-wide Stryker run cannot finish within
GitHub Actions' practical time limit. It keeps mutation testing as a required
pull-request check while bounding the automatic work to production sources
affected by the pull-request diff. A file-scoped run can still be too broad, so
direct production changes use new/head-side changed-line ranges.

This refinement follows a file-scoped run that timed out after 30 minutes 16
seconds with 5,015 of 6,930 mutants tested and only one checker and one test
runner active. The job retains its 30-minute cap.

This pack supersedes the earlier GitHub-only full-run, local-only static-mutant,
and explicit-mutation packs. The full `npm run mutation` command remains an
explicit manually invoked local audit; the automatic GitHub check is now
pull-request-scoped and ignores static mutants.

## Apply

1. Run the GitHub `quality-mutation` job only for `pull_request` events and cap
   it at 30 minutes.
2. Check out full history so the job can resolve both pull-request commits.
   Pass the event's base and head SHAs to the mutation runner explicitly.
3. Add a `mutation:ci` runner that first reads a NUL-delimited
   `git diff --name-status --diff-filter=ACMRD -z base...head` and preserves
   deletion status plus old and new rename paths. Omit deleted production
   sources. For each surviving directly changed source, read a zero-context
   diff; when the source moved, pass both paths with `--find-renames` so Git
   preserves rename ancestry instead of reporting a full addition. Coalesce
   overlapping or adjacent positive new/head-side hunk spans and emit explicit
   Stryker `file.ts:start-end` patterns.
4. Because Stryker mutates only AST nodes fully contained by a range, promote a
   surviving directly changed source to full-file if any hunk is deletion-only
   or no positive new-side span exists. Map a changed, deleted, or renamed Node
   unit test to a surviving full-file production counterpart only when that
   source was not directly changed.
5. If the pull request changes, deletes, or renames mutation configuration or
   routing, include `src/views/app-navigation.ts` as an always-full-file stable
   canary so configuration-only changes still exercise Stryker. Full-file canary
   selection dominates ranges for the same source; direct source selection
   takes precedence over test mapping.
6. Exit successfully without starting Stryker when the diff produces no line
   range, full-file safety fallback, test-mapped source, or configuration
   canary.
7. Add `stryker.pr.config.mjs` for the pull-request path. Inherit the base
   settings, disable only its raw break threshold, and write console progress
   plus JSON under the existing disposable `reports/mutation/` target. Keep the
   base break threshold unchanged for full, affected, incremental, and pre-push
   mutation.
8. Postprocess the pull-request JSON report. Require at least 90% changed-mutant
   coverage (`covered / valid`) and at least 68% covered mutation score
   (`detected / covered`). Count `Timeout` as detected; exclude `CompileError`
   and `Ignored`; fail on incomplete, unknown, missing, or malformed results;
   and pass a report with zero valid mutants.
9. Keep the human-facing affected command readable and have pre-push automation
   append `--reporters progress`; its final reporter option overrides the base
   command. Run affected mutation with `--ignoreStatic`. Keep the unrestricted
   `npm run mutation` command unchanged for explicit local or manual full
   audits.
10. Cover SHA validation, status and rename parsing, zero-context hunk parsing,
    span coalescing, deletion-only fallback, deleted-source omission,
    changed/deleted/renamed test-to-source selection, full-file precedence, the
    full-file configuration canary, no-op behavior, isolated pull-request
    command, report parsing, result thresholds, and command execution in tooling
    tests.

## Fallback

If the target repository cannot fetch or retain the pull-request base and head
commits, do not silently fall back to a full mutation run. Fail the job with a
clear missing-commit error, then correct checkout history or supply the exact
commit SHAs.

If the target repository has no stable affected-file mapping, add and test one
before applying this pack. A filename-only heuristic can miss production
sources reached through changed tests or mutation configuration.

Do not attempt to mutate a deleted production source. For a surviving source,
use full-file fallback when a deletion-only hunk or lack of a positive new-side
span makes a line range unsafe. Do not silently widen any other empty selection
to the repository-wide surface.

## Verify

- `npm run test:tooling`
- `npm run quality:gate`
- `npm run ci:local`
- On a pull request with a production change, confirm `quality-mutation` runs
  only the coalesced changed-line patterns or documented full-file safety
  fallback and completes within the 30-minute cap.
- On a test-only pull request, confirm the mapped production source remains a
  full-file pattern.
- On deletion-only and pure-rename fixtures, confirm surviving sources use the
  full-file safety fallback while deleted sources are omitted.
- On a documentation-only pull request, confirm the job reports an empty scope
  and succeeds without launching Stryker.
- On a changed or deleted mutation-configuration pull request, confirm the
  navigation canary is included as a full-file pattern.
- Confirm the pull-request report reaches both result floors and that missing,
  malformed, or incomplete JSON fails closed.
- Confirm a push to the protected branch does not start a duplicate mutation
  job, while `npm run mutation` remains available as the explicit full audit.
