# Feature: Reviewed PDF Metadata Refinement

## Blueprint

### Context

Researchers should be able to collect a PDF immediately and refine its citation
metadata later through one understandable Library action. Local PDF hints and
third-party scholarly records are useful evidence, but neither is trustworthy
enough to overwrite canonical metadata without review.

### Architecture

- Each linked PDF exposes one inline **Refine metadata** action.
- One browser-local XState actor coordinates the active reference's extraction,
  provider discovery, review, apply, failure, and supersession phases. It owns
  only transient candidates, preview data, errors, and request generation;
  PDF.js, provider requests, canonical metadata, and DOM elements remain
  outside the actor.
- The authorized browser first runs the existing bounded PDF.js extraction and
  keeps the PDF bytes and extracted page text local.
- The browser sends only the linked artifact id and bounded bibliographic hints
  (title, authors, year, and DOI) to the owner-private Worker route.
- The library authority verifies the artifact/reference relationship before any
  provider lookup.
- When its key is configured, OpenAlex is the first exact-DOI and bibliographic
  discovery source. Crossref, DataCite exact-DOI lookup, and configured Semantic
  Scholar complement it. Provider-specific records are retained so several
  sources for one DOI can contribute fields. A preview contains at most twelve
  bounded candidates.
- The inline result separates editable PDF suggestions from scholarly records.
  It groups scholarly records by normalized DOI, requires one work group, and
  offers a compact source selector for every differing field.
- Provider preview is non-mutating. Acceptance sends one to four provider, DOI,
  selected-field, and SHA-256 fingerprint selections rather than trusted
  metadata. A field may occur in only one selection.
- The Worker refetches every selected provider record, verifies every
  fingerprint and the shared DOI, rechecks DOI uniqueness, and delegates one
  atomic mixed-provider mutation to the library. Any failure leaves every field
  unchanged.
- Accepted local fields record `pdf-metadata` provenance. Accepted provider
  fields record `openalex`, `crossref`, `datacite`, or `semantic-scholar`
  provenance.
- UUIDs, PDF bytes, unselected values, and finalized reference keys remain
  unchanged. Reviewed values may improve a private-only provisional key.

### API Contract

- `POST /api/library/references/{referenceId}/metadata-refinement/preview`
  accepts a linked `artifactId` and bounded PDF candidates. It returns zero to
  twelve provider candidates with provider, match method, bounded metadata,
  score when supplied, and a 64-character hexadecimal fingerprint.
- `POST /api/library/references/{referenceId}/metadata-refinement/accept`
  accepts a legacy single selection or a batch of one to four unique providers
  for one valid DOI. Each includes its preview fingerprint and a non-empty
  unique field list drawn from `type`, `title`, `authors`, `year`, `venue`,
  `doi`, `url`, and `abstract`; fields must also be unique across the batch.
- The existing PDF metadata and Crossref routes remain compatible trust
  boundaries for existing callers.
- Missing ownership, invalid input, duplicate DOI ownership, a changed DOI or
  fingerprint, and provider failure leave the library unchanged.

### Privacy Contract

- Private PDF bytes and extracted page text never leave Kirjolab.
- OpenAlex, Crossref, DataCite, and Semantic Scholar receive only DOI values or
  bounded extracted bibliographic text.
- Provider responses are bounded to 1 MB and rendered through text properties.

### Anti-Patterns

- Do not run extraction or provider lookup automatically during upload.
- Do not send PDF bytes or opening-page text to a metadata provider.
- Do not mutate during preview, trust provider values echoed by the browser, or
  apply every provider field by default without individual controls.
- Do not combine candidates with different normalized DOIs, partially apply a
  multi-provider review, merge duplicate records, or move private research as a
  refinement side effect.
- Do not persist ephemeral candidate lists or change finalized reference keys.

## Contract

### Definition of Done

- [x] One inline action reports local-extraction and provider-search progress.
- [x] PDF suggestions remain usable when provider lookup fails or finds no match.
- [x] DOI lookup retains credential-free Crossref and DataCite coverage.
- [x] Configured OpenAlex runs first and configured Semantic Scholar runs last.
- [x] DOI-less PDFs receive at most twelve provider-specific matches grouped by DOI.
- [x] Work, per-field source, and field selection precede any provider mutation.
- [x] Acceptance refetches and verifies provider metadata before applying it.
- [x] Fields from several providers apply atomically with distinct provenance.
- [x] Selected fields retain provider-specific provenance across durable storage.
- [x] Unit, API, and Workers-runtime tests cover matching, fallback, bounds, and review.

### Regression Guardrails

- Local extraction retains its page, text, and candidate bounds.
- Provider adapters identify Kirjolab, bound response bodies, and reject malformed data.
- Artifact ownership is checked by the owner-keyed library authority.
- Manual editing, PDF download, local-only review, and project linking remain available.
- Provider unavailability must not hide or discard already extracted PDF suggestions.
- Late extraction or discovery results from a cancelled or superseded reference
  must not replace the active review, and apply failure must retain that review
  for correction or retry.

### Scenarios

**Scenario: DOI identifies a DataCite record**

- Given: a linked PDF yields a DOI that Crossref does not own
- When: the researcher refines metadata
- Then: DataCite supplies one reviewed candidate and the PDF remains private

**Scenario: Bibliographic hints produce several matches**

- Given: a linked PDF yields a title, author, and year but no DOI
- When: the researcher refines metadata
- Then: up to five provider-ordered matches appear for explicit candidate and field review

**Scenario: Provider metadata changes after preview**

- Given: a provider candidate and fingerprint are visible
- When: the exact provider record changes before acceptance
- Then: acceptance reports a conflict and no library field changes

**Scenario: Several providers complement one DOI**

- Given: OpenAlex, Crossref, and DataCite return different useful fields for one DOI
- When: the researcher chooses a source independently for each field and applies the review
- Then: Kirjolab refetches every selected source and commits all chosen values once with field-level provenance

**Scenario: Provider lookup is unavailable**

- Given: browser extraction has already produced local suggestions
- When: one or more scholarly providers fail
- Then: the local suggestions remain reviewable and canonical metadata remains unchanged
