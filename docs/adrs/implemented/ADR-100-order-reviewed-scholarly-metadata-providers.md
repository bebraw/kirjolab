# ADR-100: Order Reviewed Scholarly Metadata Providers

**Status:** Partially superseded by [ADR-103](./ADR-103-compose-metadata-from-several-providers.md)

**Date:** 2026-07-14

**Amends:** [ADR-085](./ADR-085-unify-reviewed-metadata-refinement.md)

## Context

ADR-085 uses Crossref for DOI and bibliographic lookup and DataCite as an exact-DOI fallback. This is strong for registry metadata, but no one index covers every scholarly work or consistently exposes the richest author, venue, and abstract fields.

[OpenAlex](https://developers.openalex.org/api-reference/introduction) indexes scholarly works across publication types, supports DOI lookup and relevance-ranked search, and exposes a free daily API allowance. Its current API requires a key. [Semantic Scholar](https://www.semanticscholar.org/product/api) offers DOI lookup and relevance search over its Academic Graph. Public requests share a throttled unauthenticated pool, while a key provides an identified limit. [DataCite](https://support.datacite.org/docs/how-do-i-query-the-rest-api-and-whats-in-the-response) already complements Crossref for repository, dataset, and other registered research outputs.

OpenAlex and Semantic Scholar are aggregating indexes rather than DOI registration authorities. Their breadth helps discovery, but it does not justify silent acceptance or removing provider-specific provenance.

## Decision

The reviewed metadata workflow will use a bounded provider cascade:

1. When `OPENALEX_API_KEY` is configured, query OpenAlex first for exact DOI and bibliographic discovery.
2. Query Crossref next, retaining its DOI-registry mapping and bibliographic search.
3. For an exact DOI that Crossref does not own, query DataCite.
4. Use Semantic Scholar as the final bibliographic source through its public
   pool, adding `SEMANTIC_SCHOLAR_API_KEY` when configured. Exact-DOI lookup
   retains its key-gated rollout until that path is reviewed separately.

Bibliographic discovery fills one ordered, DOI-deduplicated list of at most five candidates. Failure of an optional provider does not discard candidates from another provider. If every attempted provider fails, the workflow reports a provider failure and preserves local PDF suggestions.

Every candidate names its provider. Acceptance sends only that name, DOI, selected fields, and preview fingerprint. The Worker refetches the DOI from the same provider, verifies the fingerprint and DOI uniqueness, and records `openalex`, `crossref`, `datacite`, or `semantic-scholar` provenance on selected fields.

Provider responses remain capped at one megabyte and only selected response
fields are requested. OpenAlex and Semantic Scholar keys are optional Worker
secrets, never committed variables. Without those secrets, bibliographic
discovery still combines Crossref with the throttled public Semantic Scholar
pool; exact-DOI refinement retains the existing Crossref-to-DataCite behavior.

## Trigger

The metadata review identified OpenAlex as a broader first-pass scholarly index and requested complementary coverage from DataCite and Semantic Scholar.

## Consequences

**Positive:**

- DOI-less and non-journal works gain broader discovery coverage.
- Existing Crossref and DataCite behavior remains available without new credentials.
- DOI deduplication prevents the same work appearing once per provider.
- Provider-specific refetch and provenance preserve the existing review boundary.

**Negative:**

- Full OpenAlex coverage requires an additional API-key secret; a Semantic
  Scholar key is recommended for predictable hosted limits.
- A refinement can make several sequential external requests before filling five candidates.
- Aggregator metadata may differ from registry metadata and therefore still requires field-level review.

**Neutral:**

- DataCite remains an exact-DOI provider; its broad query API is not added to fuzzy bibliographic search in this change.
- Citation-network expansion remains Crossref-specific and is outside this metadata-refinement decision.

## Alternatives Considered

### Replace Crossref with OpenAlex

This simplifies discovery order but loses the direct registration-authority path and makes a new credential mandatory for existing deployments.

### Query every provider in parallel

Parallel lookup reduces latency but spends provider quota even after five strong candidates are available and makes deterministic priority harder to explain.

### Accept the first OpenAlex match automatically

OpenAlex relevance is a discovery score, not an identity guarantee. Automatic acceptance would violate the reviewed metadata contract.

### Require a Semantic Scholar key for bibliographic discovery

This makes hosted limits more predictable, but turns a useful public fallback
off precisely when another provider is unavailable or not configured. The
bounded public request is therefore allowed to fail independently, while a key
remains recommended for hosted use.
