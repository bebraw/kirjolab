# Feature: DOI Publication Intake

## Blueprint

### Context

An imported PDF should become connected working memory without requiring a
separate manual BibTeX import when the researcher already knows its DOI. The
workflow must still separate metadata lookup, library mutation, artifact
association, and manuscript citation.

### Architecture

- DOI preview is bounded, Crossref-backed, and non-mutating.
- `POST /api/workspaces/{id}/publication-intake/preview` accepts a known PDF
  id and DOI, then returns mapped metadata, its SHA-256 review fingerprint, an
  existing publication id when applicable, and a collision-aware key.
- Citation-key suggestions derive deterministically from mapped author/year
  metadata and all stable publication aliases, with explicit collision suffixes.
- Acceptance refetches Crossref metadata and delegates one atomic bibliography,
  publication, and PDF-link operation to the document room.
- `POST /api/workspaces/{id}/publication-intake/accept` accepts the PDF, DOI,
  reviewed citation key, and preview fingerprint. A changed fingerprint returns
  a conflict before any document-room mutation.
- Existing normalized DOI identity wins over a newly proposed citation key.
- New canonical entries use minimal Yjs bibliography splices and Crossref
  provenance; existing DOI-matched publications retain their metadata.
- A completed DOI/PDF pair is idempotent. Citation-key conflicts for a new DOI
  fail closed with no partial mutation.
- The action is available from an unlinked PDF context and opens the resulting
  publication without inserting manuscript syntax.

### Anti-Patterns

- Do not mutate on lookup or cancellation.
- Do not trust browser-returned metadata as Crossref provenance.
- Do not create a second publication for an existing normalized DOI.
- Do not infer publication/PDF links from metadata.
- Do not cite the paper as a side effect of intake.
- Do not attempt OCR, title search, or model identification in this slice.

## Contract

### Definition of Done

- [x] An unlinked PDF exposes an Identify paper action.
- [x] DOI and DOI URL input return a reviewed metadata preview.
- [x] Cancellation leaves bibliography, publications, and links unchanged.
- [x] Acceptance atomically creates or reuses the publication and artifact link.
- [x] Citation-key collision and repeated-acceptance behavior are deterministic.
- [x] Success opens publication context without inserting a citation.
- [x] Unit, Workers-runtime, and browser tests cover the complete flow.

### Regression Guardrails

- Crossref failure or invalid output must leave canonical state unchanged.
- External strings must be bounded and rendered through text nodes.
- Acceptance must verify the PDF and DOI/citation-key state inside the target
  document room.
- Yjs bibliography, materialized bibliography, publication projection, and a
  new link must commit or roll back together.
- Existing DOI identity and completed links must be reused idempotently.
- The imported PDF bytes remain immutable.

### Scenarios

**Scenario: Researcher identifies an imported paper**

- Given: an unlinked PDF is open in research context
- When: the researcher previews a DOI and accepts the reviewed citation key
- Then: canonical BibTeX, a stable publication, and the explicit PDF link appear
  together, and publication context opens without citing it

**Scenario: Researcher cancels intake**

- Given: Crossref metadata is visible in a preview
- When: the researcher cancels
- Then: no bibliography, publication, link, PDF, or manuscript state changes

**Scenario: DOI is already known**

- Given: working memory already contains the normalized DOI
- When: the researcher accepts intake for an unlinked PDF
- Then: Kirjolab preserves the existing publication and creates only the missing
  explicit artifact association
