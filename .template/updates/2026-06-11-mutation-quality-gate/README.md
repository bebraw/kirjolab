# Add Stryker Mutation Testing To The Quality Gate

Use this when a TypeScript/Vitest project wants assertion-strength checks in
the full readiness path.

## Apply

1. Install Stryker core, TypeScript checker, and Vitest runner.
2. Add `stryker.config.mjs`.
3. Add a `mutation` script.
4. Include mutation in the full quality gate.
5. Add a separate CI mutation job when the project uses GitHub Actions.
6. Ignore `reports/` and `.stryker-tmp/` if they are not already ignored.

## Fallback

If tests are not colocated, adapt the mutate/test globs before enabling the
gate. Do not add mutation testing to a project with weak or unstable tests until
the baseline test suite is reliable.

## Verify

- `npm run mutation`
- `npm run quality:gate`
- `npm run ci:local`
