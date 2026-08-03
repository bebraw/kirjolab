# Bound Pull-Request Mutation CI

Use this update when a clean, repository-wide Stryker run cannot finish within
GitHub Actions' practical time limit. It keeps mutation testing as a required
pull-request check while bounding the automatic work to production sources
affected by the pull-request diff.

This pack supersedes the earlier GitHub-only full-run, local-only static-mutant,
and explicit-mutation packs. The full `npm run mutation` command remains an
explicit manually invoked local audit; the automatic GitHub check is now
pull-request-scoped and ignores static mutants.

## Apply

1. Run the GitHub `quality-mutation` job only for `pull_request` events and cap
   it at 30 minutes.
2. Check out full history so the job can resolve both pull-request commits.
   Pass the event's base and head SHAs to the mutation runner explicitly.
3. Add a `mutation:ci` runner that diffs `base...head`, maps the changed paths
   through the repository's shared affected-file rules, and selects only
   affected production sources for Stryker.
4. If the pull request changes mutation configuration, include
   `src/views/app-navigation.ts` as a stable canary so configuration-only
   changes still exercise Stryker.
5. Exit successfully without starting Stryker when the diff affects no
   mutation source or configuration input.
6. Keep the human-facing affected command readable, but have bounded CI and
   pre-push automation append `--reporters progress`; its final reporter option
   overrides the base command. Run affected mutation with `--ignoreStatic`.
   Keep the unrestricted `npm run mutation` command unchanged for explicit
   local or manual full audits.
7. Cover SHA validation, diff parsing, source selection, configuration canary,
   no-op behavior, and command execution in tooling tests.

## Fallback

If the target repository cannot fetch or retain the pull-request base and head
commits, do not silently fall back to a full mutation run. Fail the job with a
clear missing-commit error, then correct checkout history or supply the exact
commit SHAs.

If the target repository has no stable affected-file mapping, add and test one
before applying this pack. A filename-only heuristic can miss production
sources reached through changed tests or mutation configuration.

## Verify

- `npm run test:tooling`
- `npm run quality:gate`
- `npm run ci:local`
- On a pull request with a production change, confirm `quality-mutation` runs
  only the selected source files and completes within the 30-minute cap.
- On a documentation-only pull request, confirm the job reports an empty scope
  and succeeds without launching Stryker.
- On a mutation-configuration pull request, confirm the navigation canary is
  included.
- Confirm a push to the protected branch does not start a duplicate mutation
  job, while `npm run mutation` remains available as the explicit full audit.
