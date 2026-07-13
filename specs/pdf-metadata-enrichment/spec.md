# Feature: Reviewed PDF Metadata Enrichment

## Blueprint

### Context

PDF upload should remain immediate, while metadata already present in a paper
should be easy to review and reuse later without becoming canonical silently.

### Architecture

- The authorized browser uses the existing PDF.js dependency on demand.
- Extraction reads document information and at most the first three text pages,
  retains at most 64 KiB of normalized text, and returns bounded title, author,
  year, and DOI suggestions plus diagnostics.
- Suggestions are ephemeral local UI state. Opening, cancelling, or failing extraction does not mutate the library.
- Review is inline in the permanent Library tab rather than modal.
- Each suggested field can be selected independently. Applying suggestions sends only selected fields and the artifact id to the owner-private route.
- The library verifies the artifact/reference relationship, bounds every value,
  updates only selected fields, and records `pdf-metadata` provenance for those fields.
- Reference UUID, unselected metadata, and PDF bytes remain unchanged. Reviewed
  values may improve a private-only provisional key; finalized keys remain unchanged.

### API Contract

- `POST /api/library/references/{referenceId}/pdf-metadata` accepts one linked
  `artifactId` and a non-empty partial set of title, authors, year, and DOI.
- The route rejects unknown, unlinked, empty, or over-limit suggestions without mutation.

### Anti-Patterns

- Do not extract automatically during upload or block intake on extraction.
- Do not persist unreviewed candidates or replace all metadata with a partial extraction.
- Do not claim Crossref provenance for browser-derived values.
- Do not change a finalized reference key after enrichment.
- Do not send private PDF bytes to a third-party identification service.

## Contract

### Definition of Done

- [x] A PDF-backed Library record exposes inline metadata review.
- [x] Embedded metadata and bounded opening-page text produce useful candidates.
- [x] The user can apply individual fields and leave the rest untouched.
- [x] Accepted fields record PDF-specific provenance and preserve finalized keys.
- [x] Empty, malformed, or unlinked updates fail without mutation.
- [x] Unit, Workers-runtime, and browser tests cover extraction and review.

### Regression Guardrails

- Extraction must retain its page, text, and field bounds.
- Browser failure or cancellation must leave canonical metadata unchanged.
- Artifact ownership must be checked again inside the library authority.
- Existing manual metadata, PDF download, and project-link behavior must remain available.

### Scenarios

**Scenario: Researcher reviews embedded PDF metadata**

- Given: a provisional Library record owns a PDF with embedded metadata
- When: the researcher extracts suggestions and applies selected fields
- Then: only those fields change with `pdf-metadata` provenance and the stable reference identity remains unchanged

**Scenario: PDF metadata is unavailable**

- Given: a scan or sparse PDF yields no useful candidate
- When: extraction completes
- Then: the Library explains that no suggestions were found and remains unchanged
