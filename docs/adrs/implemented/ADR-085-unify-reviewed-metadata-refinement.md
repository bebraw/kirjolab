# ADR-085: Unify Reviewed PDF Metadata Refinement

**Status:** Partially superseded by [ADR-103](./ADR-103-compose-metadata-from-several-providers.md)

**Date:** 2026-07-13

## Context

ADR-079 introduced bounded browser-side PDF metadata review, and ADR-080 added
a separate exact-DOI Crossref review. The two trustworthy operations appear as
separate Library actions, so a researcher must understand the implementation
boundary before they can complete one ordinary task: refine a collected PDF.

Many PDFs expose no DOI even when their title and author text is usable for
identification. Crossref supports bounded bibliographic queries as well as
singleton DOI retrieval. Some research outputs use DataCite rather than
Crossref; DataCite's public API supports unauthenticated singleton DOI retrieval.
Neither provider should receive a private PDF, and fuzzy search results cannot
be accepted as authoritative without explicit candidate and field review.

## Decision

Kirjolab will present local extraction and scholarly-provider lookup as one
inline **Refine metadata** workflow for a linked PDF. The authorized browser
will continue to read PDF bytes with PDF.js. It will send the owner-private
Worker only the artifact id and bounded title, author, year, and DOI hints.

The library authority will verify that the artifact belongs to the target
reference before lookup. A DOI will use exact Crossref retrieval and fall back
to exact DataCite retrieval only when Crossref reports that it has no record.
Without a DOI, the Worker will issue one Crossref `query.bibliographic` request
and return at most five unique DOI-backed candidates. Provider responses remain
bounded to one megabyte.

The researcher will choose one candidate and select fields independently.
Preview will not mutate state. Acceptance will carry only the provider name,
candidate DOI, selected field names, and preview fingerprint. The Worker will
refetch the exact DOI from the named provider, reject a changed fingerprint or
DOI conflict, and ask the owner-keyed durable library to apply one atomic update.
Accepted fields will record `crossref` or `datacite` provenance.

The existing local PDF and exact Crossref routes remain valid compatibility
boundaries. Provider failure will not remove local PDF suggestions already
extracted in the browser. PDF bytes and opening-page text will not be sent to
Crossref or DataCite.

## Consequences

**Positive:**

- One action covers extraction, identification, comparison, and selective acceptance.
- DOI-less papers can be identified from bounded bibliographic hints.
- DataCite-registered outputs can be refined without another credential or dependency.
- Refetch and fingerprint verification preserve honest provider provenance.
- Provider failure does not remove the existing local-only refinement path.

**Negative:**

- Normal provider acceptance performs a second external request.
- Crossref fuzzy ranking may surface plausible but incorrect works, so candidate review remains mandatory.
- DataCite participates only in exact DOI lookup; DOI-less DataCite search remains unsupported.
- The Worker now maintains two bounded provider mappers and their response-shape tests.

**Neutral:**

- Upload remains immediate and performs no extraction or network lookup.
- OCR, duplicate merging, and automated metadata acceptance remain separate concerns.
- Reviewed values may improve provisional keys, while finalized keys remain stable under ADR-083.

## Alternatives Considered

### Keep PDF, Crossref, and DataCite as separate actions

This mirrors implementation boundaries but makes the Library more complex and
requires researchers to manually sequence the normal refinement workflow.

### Send the PDF to a third-party identification service

This may improve difficult matches but exposes private research bytes and adds
provider retention and consent questions that are unnecessary for this slice.

### Accept the highest-scoring bibliographic match automatically

Crossref scores are rankings rather than identity guarantees. Automatic
acceptance could attach the wrong DOI and overwrite stronger reviewed metadata.

### Persist provider previews until acceptance

Persistence could avoid refetching but adds expiry and cleanup policy for
short-lived data and weakens the guarantee that provider provenance reflects
the record accepted at mutation time.
