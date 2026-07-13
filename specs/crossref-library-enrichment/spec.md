# Feature: Reviewed Crossref Library Enrichment

## Blueprint

### Context

A DOI-backed private-library record should be easy to complete from an
authoritative metadata provider without silently overwriting reviewed fields.

### Architecture

- Preview reads the current library DOI and uses the existing bounded Crossref
  singleton-work adapter. It is non-mutating.
- Preview returns mapped metadata and a SHA-256 fingerprint over every bounded
  provider field.
- The permanent Library tab shows an inline current-versus-Crossref comparison
  with independently selectable fields.
- Acceptance sends the selected field names and preview fingerprint, not trusted provider values.
- The Worker refetches Crossref metadata and rejects a changed fingerprint before mutation.
- The owner-keyed library authority verifies DOI stability and uniqueness, then
  applies only selected fields with `crossref` provenance.
- UUID, PDF artifacts, and unselected values and provenance remain unchanged.
  Reviewed values may improve a private-only provisional key; finalized keys remain unchanged.

### API Contract

- `POST /api/library/references/{referenceId}/crossref/preview` returns bounded
  provider metadata and its fingerprint for the record's current DOI.
- `POST /api/library/references/{referenceId}/crossref/accept` accepts a 64-byte
  hexadecimal fingerprint and a non-empty unique list drawn from `type`,
  `title`, `authors`, `year`, `venue`, `doi`, `url`, and `abstract`.
- Missing DOI, duplicate DOI ownership, changed provider metadata, invalid field
  selections, and upstream failure leave the library unchanged.

### Anti-Patterns

- Do not mutate on preview or accept metadata echoed by the browser.
- Do not overwrite every field when only some were reviewed.
- Do not merge duplicate records or move private research as an enrichment side effect.
- Do not change finalized reference keys after enrichment.

## Contract

### Definition of Done

- [x] DOI-backed records expose inline Crossref lookup and comparison.
- [x] Preview is bounded and non-mutating.
- [x] Acceptance refetches and verifies the preview fingerprint.
- [x] Only selected fields change with Crossref provenance.
- [x] Duplicate, stale, invalid, and provider-failure paths fail without mutation.
- [x] Unit, Workers-runtime, and browser tests cover the complete flow.

### Regression Guardrails

- Crossref request identification, response bounds, and mapping remain centralized in the existing adapter.
- Provider strings are rendered through text properties rather than markup.
- Existing PDF review and manual metadata editing remain available.
- Project snapshots do not update until their existing explicit synchronization boundary runs.

### Scenarios

**Scenario: Researcher selectively enriches a DOI-backed source**

- Given: a library record has a reviewed DOI and partial metadata
- When: the researcher previews Crossref and accepts selected fields
- Then: only those values change with Crossref provenance; a private-only
  provisional key may improve, while a finalized key remains stable

**Scenario: Crossref metadata changes after preview**

- Given: a provider preview is visible
- When: acceptance refetches materially different metadata
- Then: the request reports a conflict and no library field changes
