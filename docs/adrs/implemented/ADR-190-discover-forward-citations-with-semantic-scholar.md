# ADR-190: Discover Forward Citations With Semantic Scholar

**Status:** Implemented

**Date:** 2026-07-29

**Amends:** [ADR-138](./ADR-138-accept-snowball-candidates-atomically.md)

## Context

Backward snowballing follows references deposited with a Crossref work. A
complete reference trail also needs forward snowballing: works that cite the
selected seed.

Crossref's public REST API exposes citation counts, but retrieving a complete
list of citing works belongs to its member Cited-by service. Semantic Scholar's
Academic Graph API exposes a paper citations endpoint and accepts DOI-based
paper identifiers. Its coverage and deposited identifiers remain incomplete,
so results are discovery evidence rather than canonical truth.

## Decision

Kirjolab will use the bounded Semantic Scholar paper citations endpoint for an
explicit **Find citing works** action. A round requests at most 128 records and
retains only citing papers with valid DOIs. The browser receives a provider,
direction, response fingerprint, source locator, known assertions, and
unmatched review candidates.

Known works create extracted provider assertions directed from the citing work
to the selected seed. Saving an unmatched candidate sends only its DOI,
direction, and reviewed response fingerprint. The server refetches the same
bounded citation round, verifies membership and fingerprint, refetches complete
Semantic Scholar metadata, then atomically creates or reuses the reference and
the correctly directed assertion.

Transient network, rate-limit, and server failures receive one bounded retry
and then return a retryable service-unavailable response. Semantic Scholar field
provenance stays distinct from Crossref provenance.

## Consequences

**Positive:**

- Researchers can snowball in both directions from the same reference trail.
- Forward assertions retain their real citation direction and provider
  evidence.
- Client-edited or stale candidates cannot enter the Library unchecked.

**Negative:**

- Results are limited to Semantic Scholar records that expose valid citing-work
  DOIs.
- Public unauthenticated use shares a provider rate limit; a configured API key
  improves isolation.
- Forward and backward rounds can differ because their providers have different
  coverage and update schedules.

## Alternatives Considered

### Use Crossref Cited-by

The full citing-work list is not available through the anonymous public REST
contract and would add a member-specific credential and product dependency.

### Infer forward citations from local assertions only

This is precise for already imported research but cannot discover unseen citing
works.

### Import every citing work automatically

This would pollute the private Library and weaken the existing explicit review
and fingerprint-verification boundary.
