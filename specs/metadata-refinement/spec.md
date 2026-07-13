# Feature: Reviewed PDF Metadata Refinement

## Blueprint

### Context

Researchers should be able to collect a PDF immediately and refine its citation
metadata later through one understandable Library action. Local PDF hints and
third-party scholarly records are useful evidence, but neither is trustworthy
enough to overwrite canonical metadata without review.

### Architecture

- Each linked PDF exposes one inline **Refine metadata** action.
- The authorized browser first runs the existing bounded PDF.js extraction and
  keeps the PDF bytes and extracted page text local.
- The browser sends only the linked artifact id and bounded bibliographic hints
  (title, authors, year, and DOI) to the owner-private Worker route.
- The library authority verifies the artifact/reference relationship before any
  provider lookup.
- A DOI triggers an exact Crossref lookup with a DataCite fallback when Crossref
  has no record. Without a DOI, a bounded Crossref `query.bibliographic` search
  returns at most five unique DOI-backed candidates.
- The inline result separates editable PDF suggestions from provider candidates.
  The researcher chooses a provider record and approves fields independently.
- Provider preview is non-mutating. Acceptance sends provider name, DOI,
  selected field names, and a SHA-256 fingerprint rather than trusted metadata.
- The Worker refetches the exact provider DOI, verifies the fingerprint and DOI
  uniqueness, and delegates one atomic selected-field mutation to the library.
- Accepted local fields record `pdf-metadata` provenance. Accepted provider
  fields record `crossref` or `datacite` provenance.
- UUIDs, PDF bytes, unselected values, and finalized reference keys remain
  unchanged. Reviewed values may improve a private-only provisional key.

### API Contract

- `POST /api/library/references/{referenceId}/metadata-refinement/preview`
  accepts a linked `artifactId` and bounded PDF candidates. It returns zero to
  five provider candidates with provider, match method, bounded metadata, score
  when supplied, and a 64-character hexadecimal fingerprint.
- `POST /api/library/references/{referenceId}/metadata-refinement/accept`
  accepts `crossref` or `datacite`, one valid DOI, the preview fingerprint, and
  a non-empty unique list drawn from `type`, `title`, `authors`, `year`, `venue`,
  `doi`, `url`, and `abstract`.
- The existing PDF metadata and Crossref routes remain compatible trust
  boundaries for existing callers.
- Missing ownership, invalid input, duplicate DOI ownership, a changed DOI or
  fingerprint, and provider failure leave the library unchanged.

### Privacy Contract

- Private PDF bytes and extracted page text never leave Kirjolab.
- Crossref and DataCite receive only DOI values or bounded extracted
  bibliographic text.
- Provider responses are bounded to 1 MB and rendered through text properties.

### Anti-Patterns

- Do not run extraction or provider lookup automatically during upload.
- Do not send PDF bytes or opening-page text to a metadata provider.
- Do not mutate during preview, trust provider values echoed by the browser, or
  apply every provider field by default without individual controls.
- Do not merge duplicate records or move private research as a refinement side effect.
- Do not persist ephemeral candidate lists or change finalized reference keys.

## Contract

### Definition of Done

- [x] One inline action reports local-extraction and provider-search progress.
- [x] PDF suggestions remain usable when provider lookup fails or finds no match.
- [x] DOI lookup covers Crossref and DataCite without API credentials.
- [x] DOI-less PDFs receive at most five Crossref bibliographic matches.
- [x] Candidate and field selection precede any provider mutation.
- [x] Acceptance refetches and verifies provider metadata before applying it.
- [x] Selected fields retain provider-specific provenance across durable storage.
- [x] Unit, API, and Workers-runtime tests cover matching, fallback, bounds, and review.

### Regression Guardrails

- Local extraction retains its page, text, and candidate bounds.
- Provider adapters identify Kirjolab, bound response bodies, and reject malformed data.
- Artifact ownership is checked by the owner-keyed library authority.
- Manual editing, PDF download, local-only review, and project linking remain available.
- Provider unavailability must not hide or discard already extracted PDF suggestions.

### Scenarios

**Scenario: DOI identifies a DataCite record**

- Given: a linked PDF yields a DOI that Crossref does not own
- When: the researcher refines metadata
- Then: DataCite supplies one reviewed candidate and the PDF remains private

**Scenario: Bibliographic hints produce several matches**

- Given: a linked PDF yields a title, author, and year but no DOI
- When: the researcher refines metadata
- Then: up to five Crossref matches appear for explicit candidate and field review

**Scenario: Provider metadata changes after preview**

- Given: a provider candidate and fingerprint are visible
- When: the exact provider record changes before acceptance
- Then: acceptance reports a conflict and no library field changes

**Scenario: Provider lookup is unavailable**

- Given: browser extraction has already produced local suggestions
- When: Crossref or DataCite fails
- Then: the local suggestions remain reviewable and canonical metadata remains unchanged
