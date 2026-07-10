# Reserve Full Mutation CI For GitHub

Use this when local Agent CI should skip the expensive full mutation job while
GitHub Actions still protects the main branch with a clean mutation run.

## Apply

1. Add a GitHub-only guard to the mutation workflow job.
2. Keep `npm run mutation` in GitHub Actions.
3. Keep local readiness on `npm run quality:gate`, which may use incremental
   mutation locally.

## Fallback

If the target project does not use Agent CI, this pack is optional. Keep the
mutation job unguarded when every CI runner is expected to run the full mutation
gate.

## Verify

- `npm run quality:gate`
- `npm run ci:local`
