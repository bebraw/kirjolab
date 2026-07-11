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
- After every bibliography-changing Yjs update, `DocumentRoom` reparses the
  complete canonical bibliography and projects every complete supported entry
  into its SQLite `publications` table.
- A projection contains citation key, type, title, ordered authors, year, venue,
  normalized DOI, URL, and abstract. It reuses a stable UUID by
  case-insensitive citation key first and normalized non-empty DOI second.
- An exactly unchanged projection does not rewrite its row, metadata-source
  provenance, or update timestamp. An authored field change records `bibtex`;
  explicitly accepted Crossref values remain `crossref` when the following
  projection is identical.
- Publication resources are monotonic working memory. Removing an entry from
  current BibTeX does not delete its resource.
- Citation keys are workspace aliases. DOI values are normalized external
  identifiers. Neither replaces the internal publication id.
- `POST /api/workspaces/{id}/bibliography/import` accepts up to 2 MB of BibTeX,
  merges entries case-insensitively by citation key, applies a minimal
  common-prefix/suffix Yjs splice, atomically reconciles the resulting complete
  bibliography, and returns the snapshot.
- `POST /api/workspaces/{id}/publications/{publicationId}/enrich` resolves the
  stored DOI through Crossref and materializes the result into both the resource
  and canonical BibTeX through the same atomic minimal-splice path while
  preserving explicit `crossref` provenance.
- `DocumentRoom` schema and projection backfills use the shared ordered,
  append-only `_kirjolab_migrations` ledger. Initial canonical bibliography
  projection is a named data migration rather than an incidental first edit.
- Workers-runtime tests seed and inspect private `DocumentRoom` SQLite state
  through `cloudflare:test`, proving projection migration and atomic
  materialization in isolated real `workerd` storage rather than a Node double.
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
- Do not project only explicit imports while ignoring direct collaborative
  BibTeX edits.
- Do not rewrite an unchanged projection or relabel its provenance.
- Do not delete a publication merely because its entry is absent from current
  BibTeX.
- Do not replace complete bibliography text through delete-all/insert-all.
- Do not add schema or projection backfills outside the ordered migration
  ledger or edit an applied migration.
- Do not accept Node-only storage tests as proof that bibliography projection
  and its document commit are atomic in a Durable Object SQLite transaction.

## Contract

### Definition of Done

- [x] A browser can upload a `.bib` file and receive a merged bibliography.
- [x] Imported entries appear as stable publication resources.
- [x] Direct local and remote BibTeX edits materialize every complete parsed
      entry without an import action.
- [x] Reimporting a citation key updates rather than duplicates its resource.
- [x] DOI prefixes and case normalize to one external identifier form.
- [x] DOI enrichment is explicit and records `crossref` provenance.
- [x] A no-op projection preserves provenance and update timestamp while a
      changed authored projection records `bibtex`.
- [x] Removing canonical BibTeX leaves its publication available as monotonic
      working memory.
- [x] Initial canonical entries are projected through a named data migration.
- [x] Accepted enrichment is exported in canonical BibTeX.
- [x] Parser and Crossref mapping behavior have unit tests.
- [x] A Workers-runtime test proves historical bibliography projection and
      atomic persistence against real Durable Object SQLite storage.
- [x] A browser test proves import through the real Worker and Durable Object.

### Regression Guardrails

- Imports with no valid entries must not mutate the bibliography.
- Import must remain available without network access or credentials.
- Publication ids must remain stable across matching reimports.
- Projection identity must match case-insensitive citation key before normalized
  non-empty DOI and create a UUID only when neither matches.
- Every complete entry in canonical BibTeX must be projected after each Yjs
  update that changes bibliography text.
- Exact projected equality must include citation key, type, title, ordered
  authors, year, venue, normalized DOI, URL, and abstract.
- Exact equality must preserve the existing row, metadata source, and update
  timestamp; any authored projected change must set the source to `bibtex`.
- Absence from canonical BibTeX must never implicitly delete a publication.
- Imports and enrichment must use a minimal common-prefix/suffix `Y.Text` splice
  and atomically persist document materialization with all projection writes.
- Crossref errors must not partially update stored publication metadata.
- Accepted Crossref enrichment must remain `crossref` after its identical
  canonical projection is reconciled.
- Initial bibliography projection must be a recorded data migration so existing
  rooms converge without a later edit.
- Projection migration, transaction rollback, ledger persistence, and reload
  behavior must run in the dedicated Workers Vitest project with isolated
  per-test SQLite storage; Node tests remain responsible for pure projection
  logic.
- User-controlled metadata must render through DOM text nodes, not HTML.
- Workspace authorization and same-origin mutation checks apply to all reference
  routes.

### Scenarios

**Scenario: Researcher imports an existing library excerpt**

- Given: a workspace and a valid `.bib` file
- When: the researcher imports it
- Then: Kirjolab merges canonical BibTeX and exposes each imported entry as a
  stable publication resource

**Scenario: Collaborative BibTeX becomes working memory**

- Given: a researcher or collaborator edits canonical BibTeX directly
- When: the Yjs update produces a complete supported entry
- Then: Kirjolab atomically materializes the bibliography and upserts its stable
  publication resource without requiring import

**Scenario: Projection is unchanged**

- Given: a publication has explicit `crossref` provenance and a known update
  timestamp
- When: canonical BibTeX reconciles to exactly the same projected values
- Then: Kirjolab retains the UUID, `crossref` provenance, and timestamp without
  rewriting the row

**Scenario: Researcher edits enriched metadata**

- Given: a publication was explicitly enriched through Crossref
- When: the researcher changes one of its projected canonical BibTeX fields
- Then: Kirjolab keeps its UUID, records the new values with `bibtex`
  provenance, and advances its update timestamp

**Scenario: Authored bibliography omits a known resource**

- Given: a canonical entry already has a stable publication resource
- When: the researcher removes that entry from current BibTeX
- Then: the resource remains in working memory and no implicit delete or cascade
  occurs

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

**Scenario: Initial bibliography projection migrates once**

- Given: an existing document room contains canonical BibTeX that predates
  complete reconciliation
- When: its pending named data migration runs
- Then: the migration atomically projects every complete entry and records its
  ledger version so later activations do not repeat it
