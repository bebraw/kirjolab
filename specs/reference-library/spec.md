# Feature: Reference Library Import and Enrichment

## Blueprint

### Context

A bibliography must work both as portable manuscript source and as scholarly
working memory. Researchers need to import existing BibTeX, see publications as
addressable resources, and deliberately improve DOI-backed metadata.

### Architecture

- `src/domain/bibliography.ts` parses, merges, normalizes, and serializes the
  supported BibTeX subset without runtime dependencies.
- BibTeX remains the canonical authored bibliography synchronized through Yjs.
- `DocumentRoom` materializes imported entries into a SQLite `publications`
  table with stable UUIDs and metadata-source provenance.
- Citation keys are workspace aliases. DOI values are normalized external
  identifiers. Neither replaces the internal publication id.
- `POST /api/workspaces/{id}/bibliography/import` accepts up to 2 MB of BibTeX,
  merges entries case-insensitively by citation key, and returns the snapshot.
- `POST /api/workspaces/{id}/publications/{publicationId}/enrich` resolves the
  stored DOI through Crossref and materializes the result into both the resource
  and canonical BibTeX.
- `CROSSREF_MAILTO` optionally identifies the deployment to Crossref. It is not
  a credential.

### Supported BibTeX Boundary

- Braced, quoted, bare numeric/text values, nested braces, and `(...)` entries.
- Common fields including author, title, year, venue, DOI, URL, and abstract.
- `@comment`, `@preamble`, and `@string` directives are ignored.
- Macro expansion, `#` concatenation, and lossless comment formatting are not
  promised in this slice.

### Anti-Patterns

- Do not use citation keys, titles, filenames, or DOI values as internal ids.
- Do not require Crossref availability for import.
- Do not enrich or overwrite imported metadata without an explicit action.
- Do not make the publication table the only usable bibliography copy.
- Do not expose Crossref response blobs directly as domain state.

## Contract

### Definition of Done

- [x] A browser can upload a `.bib` file and receive a merged bibliography.
- [x] Imported entries appear as stable publication resources.
- [x] Reimporting a citation key updates rather than duplicates its resource.
- [x] DOI prefixes and case normalize to one external identifier form.
- [x] DOI enrichment is explicit and records `crossref` provenance.
- [x] Accepted enrichment is exported in canonical BibTeX.
- [x] Parser and Crossref mapping behavior have unit tests.
- [x] A browser test proves import through the real Worker and Durable Object.

### Regression Guardrails

- Imports with no valid entries must not mutate the bibliography.
- Import must remain available without network access or credentials.
- Publication ids must remain stable across matching reimports.
- Crossref errors must not partially update stored publication metadata.
- User-controlled metadata must render through DOM text nodes, not HTML.
- Workspace authorization and same-origin mutation checks apply to all reference
  routes.

### Scenarios

**Scenario: Researcher imports an existing library excerpt**

- Given: a workspace and a valid `.bib` file
- When: the researcher imports it
- Then: Kirjolab merges canonical BibTeX and exposes each imported entry as a
  stable publication resource

**Scenario: Researcher enriches a DOI-backed publication**

- Given: an imported publication with a valid DOI
- When: the researcher chooses Enrich
- Then: Kirjolab requests bounded Crossref metadata, marks the source, and
  materializes the accepted fields into canonical BibTeX

**Scenario: Metadata service is unavailable**

- Given: a publication already stored from BibTeX
- When: Crossref returns an error
- Then: Kirjolab reports the failure and leaves the existing resource and
  bibliography unchanged
