# Use Relative Stryker Worker Concurrency

Use this when a project has Stryker mutation testing and still hard-codes a
fixed worker count.

## Apply

1. Change Stryker `concurrency` to a percentage such as `"50%"`.
2. Update mutation-testing kit docs if the project carries copied kits.
3. Keep local and CI mutation commands unchanged.

## Fallback

If the target project has very small CI runners, choose a lower percentage and
record the reason in its docs.

## Verify

- `npm run mutation:incremental`
- `npm run quality:gate`
