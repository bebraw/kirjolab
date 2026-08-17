# Bound Instrumented Mutation Fixtures

Use this update when Stryker's instrumentation makes near-cap complexity or
hard-boundary integration fixtures unsuitable for repetition per mutant.

## Apply

1. Detect Stryker workers through one excluded test-support helper rather than
   repeating environment checks across test files.
2. Keep near-cap performance and inherently boundary-sized integration
   fixtures active in ordinary unit and coverage CI.
3. Skip those large fixtures only inside Stryker workers.
4. Retain a small mutation-selected behavioral counterpart for every skipped
   performance regression.
5. Factor production-used guards or accumulators into cheap internal seams so
   mutation-selected tests still prove each skipped hard boundary, including
   aggregation and its stable failure.
6. Reverify the worker marker whenever the pinned Stryker release changes.

## Fallback

Keep a fixture mutation-selected when it is already cheap under instrumentation
or when no deterministic counterpart covers its behavior. Do not raise global
timeouts or lower mutation thresholds to accommodate a timing-only fixture.

## Verify

- Run focused tests normally and with `STRYKER_MUTATOR_WORKER=verification`.
- `npm run mutation:affected -- --mutate <representative-source>`
- `npm run ci:local`
