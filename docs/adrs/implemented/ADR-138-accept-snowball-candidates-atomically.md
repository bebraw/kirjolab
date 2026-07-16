# ADR-138: Accept Snowball Candidates Atomically

**Status:** Implemented

**Date:** 2026-07-16

**Amends:** [ADR-063](./ADR-063-model-citation-assertions-with-provenance.md)

## Context

ADR-063 lets a researcher explicitly expand a DOI-backed source and preserves
assertions for references already in the private library. Crossref references
that are not yet known are returned to the browser, but the interface currently
discards them. Saving one through the generic discovery importer would also
lose the reviewed expansion identity and would not create the source-to-source
assertion needed to continue snowballing.

Creating every returned reference automatically would pollute the library and
misrepresent provider output as researcher selection. Trusting metadata echoed
back by the browser would weaken the existing metadata review boundary.

## Decision

Kirjolab will render unmatched DOI references as a bounded, reviewable discovery
round attached to the selected seed source. The researcher may verify a DOI and
explicitly accept an individual candidate.

Acceptance sends only the candidate DOI and the reviewed expansion response
fingerprint. The Worker refetches the seed's bounded Crossref reference list,
requires the response fingerprint and candidate membership to match, fetches
complete metadata for that DOI, and then asks the owner-scoped reference library
to perform one synchronous transaction. That transaction creates or reuses the
DOI-backed reference and records an `extracted` provider assertion from the seed
to the accepted reference.

The accepted reference keeps field-level Crossref provenance. A repeated
acceptance reuses the stable DOI identity and assertion-deduplication contract.
Unaccepted candidates remain transient provider results and do not mutate the
library.

## Consequences

**Positive:**

- A backward-snowballing round leads directly to another traversable library
  source without losing why it was discovered.
- The browser cannot fabricate candidate metadata or attach an unrelated DOI to
  a reviewed provider response.
- Reference identity and citation provenance appear together or not at all.

**Negative:**

- Acceptance performs two bounded provider reads: the seed expansion refetch
  and the candidate metadata fetch.
- A changed provider response invalidates a stale review and requires the
  researcher to expand the seed again.
- Rejected and deferred candidates are not yet retained as a durable screening
  log.

**Neutral:**

- This change implements backward snowballing only. Forward citation discovery
  remains provider-dependent follow-up work.

## Alternatives Considered

### Import every expansion candidate

This removes a click but fills the private library with unreviewed provider
output and violates the explicit-mutation boundary.

### Trust the candidate metadata returned by the browser

This is faster but lets stale or modified client data become canonical library
metadata and breaks the fingerprint-verified provider review pattern.

### Save the reference and assertion in separate requests

This reuses generic endpoints but can leave an orphaned reference or omit the
discovery relationship when the second write fails.
