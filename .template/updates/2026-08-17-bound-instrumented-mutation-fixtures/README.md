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
5. Keep mutation-selected tests proving each skipped hard boundary, including
   exact acceptance, first rejection, aggregation, and stable failure. Prefer a
   cheap production-used guard or accumulator seam. If that source belongs to
   an immutable published artifact, use an isolated test module to tighten only
   the relevant imported hard ceilings and exercise the unchanged public
   interface; never reimplement the guard or rewrite immutable source.
6. Pin large deterministic byte fixtures with literal fingerprints instead of
   deep-comparing separately generated boundary-sized arrays.
7. Reverify the worker marker whenever the pinned Stryker release changes.

## Fallback

Keep a fixture mutation-selected when it is already cheap under instrumentation
or when no deterministic counterpart covers its behavior. Do not raise global
timeouts or lower mutation thresholds to accommodate a timing-only fixture.

## Verify

- Run focused tests normally and with `STRYKER_MUTATOR_WORKER=verification`.
- `npm run mutation:affected -- --mutate <representative-source>`
- `npm run ci:local`
