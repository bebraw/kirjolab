# Use Incremental Mutation In The Local Gate

Use this when full local mutation runs are too slow but GitHub Actions should
keep running a clean full mutation pass.

## Apply

1. Add a `mutation:incremental` script.
2. Change the local `quality:gate` script to run incremental mutation.
3. Keep GitHub Actions on `npm run mutation`.
4. Document ignored Stryker report and sandbox directories.

## Fallback

If the target project does not use GitHub Actions, keep a separate clean full
mutation command in whatever CI system protects the main branch.

## Verify

- `npm run mutation:incremental`
- `npm run quality:gate`
- `npm run ci:local`
