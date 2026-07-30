# ADR-194: Report Live Citation Provider Coverage

**Status:** Implemented

**Date:** 2026-07-30

## Context

Crossref supplies backward references and Semantic Scholar supplies forward
citations. Their coverage, metadata completeness, latency, and rate limits can
change independently of Kirjolab releases. Unit fixtures prove mapping and
bounds but cannot show the providers' current operational usefulness.

Precision and recall would require a licensed, maintained scholarly graph as
ground truth. Comparing the two providers directly is also invalid because
they answer opposite citation directions.

## Decision

Add `npm run diagnostics:citation-providers` as an advisory live probe. It runs
the production bounded provider adapters over a small versioned seed list and
reports, per provider and direction:

- availability and failure text;
- DOI candidate count;
- title, author, and year completeness;
- truncation; and
- elapsed request time.

The command accepts repeated `--doi` overrides and `--json`. It performs no
Library writes, does not capture owner data, and is excluded from routine CI
because network state and public quotas are unstable.

## Consequences

**Positive:**

- Provider regressions and coverage gaps become inspectable through the same
  adapters used in production.
- Machine-readable output can be captured deliberately for comparisons.
- The report avoids presenting unlike directions as a false accuracy score.

**Negative:**

- Results vary with provider indexes, latency, and quota state.
- Running the command spends a small amount of provider quota.
- The curated seed corpus is illustrative rather than representative of every
  discipline.

## Alternatives Considered

### Make the live probe a CI gate

External outages and rate limits would make repository readiness nondeterministic.

### Compare Crossref and Semantic Scholar overlap

Backward references and forward citations are different sets, so overlap does
not measure either provider's quality.

### Claim precision and recall from hand-picked relationships

A tiny hand-picked graph would create a brittle and misleading quality score.
