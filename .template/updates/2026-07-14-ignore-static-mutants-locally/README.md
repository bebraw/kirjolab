# Ignore Static Mutants In Local Mutation Runs

Use this update when Stryker reports that a small number of static mutants dominate the runtime of a repeated local incremental gate while a separate clean mutation job remains available in CI.

## Apply

1. Add `--ignoreStatic` to the local incremental mutation script.
2. Keep the full `mutation` script unchanged so the clean CI job still tests static mutants.
3. Document that local and clean mutation scores can differ because ignored mutants do not count toward the local score.

## Fallback

If the target project has no separate clean mutation job, keep static mutants enabled or explicitly accept the reduced mutation coverage before applying this update.

## Verify

- `npm run mutation:incremental`
- `npm run quality:gate`
- `npm run ci:local`
