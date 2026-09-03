# Mutation Testing Capability Kit

Use this kit to add the template's Stryker mutation testing setup to another npm TypeScript project.

## Adds

- Stryker mutation testing with the Vitest runner.
- TypeScript checker integration so type-invalid mutants are rejected before tests run.
- A `mutation` script suitable for a full quality gate.
- Periodic progress plus a concise post-run score, status, static-mutant, and hotspot summary that preserves Stryker's exit status.
- Bounded clear-text output that omits the full test inventory while retaining
  survivor diffs and a short list of relevant tests.
- Runtime-source mutation globs that exclude declarations, colocated unit tests, end-to-end tests, and test support.
- HTML and JSON mutation reports under `reports/mutation/`, with a read-only `mutation:report` command for summarizing the latest result.

## Good Fit

- The target repo uses npm, TypeScript, and Vitest.
- Runtime code lives under `src/` or can be adapted to that convention.
- The repo already has meaningful unit tests and wants to measure assertion strength.
- Mutation testing can run as a full/readiness gate instead of a fast iteration check.

## Poor Fit

- The target repo does not have stable unit tests yet.
- The target repo uses a different test runner and the user does not want a translated Stryker setup.
- Runtime source does not live under `src/` and the target source boundaries are unclear.
- The repo needs a very fast pre-push-only check; mutation testing is intentionally heavier.

## Apply

1. Read `manifest.json`.
2. Confirm the target repo has TypeScript and Vitest, or apply equivalent setup first.
3. Follow `recipes/npm.md`.
4. Copy or merge `files/stryker.config.mjs` into `stryker.config.mjs` and copy the two reporting scripts under `files/scripts/` into `scripts/`.
5. Adapt `mutate`, `tsconfigFile`, and `vitest.configFile` if the target repo uses different source or config paths.
6. Document `reports/mutation/` and `.stryker-tmp/` as workflow write targets in the target repo.
7. Run the checks in `checks.md`.
