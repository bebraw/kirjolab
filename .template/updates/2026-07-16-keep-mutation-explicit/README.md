# Keep Mutation Testing Explicit

Use this when a routine local quality gate includes Stryker and cold or broadly
invalidated mutation runs make normal readiness checks disproportionately slow.

## Apply

1. Remove the mutation phase from the default `quality:gate` runner.
2. Keep `mutation:incremental` available for explicit local test hardening.
3. Keep the clean full `mutation` command in GitHub Actions.
4. Update quality-gate tooling tests from three phases to two.
5. Document mutation testing as a separate verification path rather than part
   of routine local readiness.

## Verify

- `npm run test:tooling`
- `npm run quality:gate`
- `npm run ci:local`
- Confirm the GitHub-only mutation job still invokes `npm run mutation`.
