# Feature: Reference Library Discovery

## Blueprint

### Context

Researchers need to find reusable sources by bibliographic content and by their
private research workflow state, without leaving the Library to query scholarly
indexes.

### Architecture

- A pure local projection filters the authorized private-library snapshot.
- Facets cover text, reference type, reading state, tag or collection,
  current-project linkage, and core metadata completeness.
- Sorting covers recent update, title, publication year, and reading priority.
- Filters combine with AND semantics; tag/collection matching is
  case-insensitive substring matching.
- Search replaces the visible collection and reports matching and total counts.
- Filter state is ephemeral and never enters project, library, collaboration,
  model-provider, or analytics state.
- A separate, collapsible discovery form accepts bounded keywords plus optional
  author, four-digit year, and bibliographic type facets.
- The Worker executes provider requests and returns only validated metadata;
  provider response shapes never enter the browser contract.
- Discovery is federated across Crossref, configured OpenAlex, and Semantic
  Scholar's public or configured pool. One provider failure does not discard
  another provider's results.
- Results remain ephemeral until the researcher explicitly saves one through
  the existing reviewed CSL JSON import path.

## Contract

### Definition of Done

- [x] Every agreed facet is available through labelled controls.
- [x] Linked/unlinked uses stable shared reference identity.
- [x] Completeness uses explicit core-field rules.
- [x] No-match and empty-library states are distinct.
- [x] Pure and browser tests cover combined filters and sorting.
- [x] A researcher can manually search scholarly providers from the Library.
- [x] Optional author, year, and type facets narrow provider-backed results.
- [x] Search results remain reviewable and require an explicit save action.

### Regression Guardrails

- Filtering must not mutate the snapshot or reorder its canonical arrays.
- Tags and collections remain distinct stored concepts even though one filter
  can search both.
- Archived records enter the projection only after explicit archived loading.
- Manual discovery must not depend on a model connection or transmit private
  manuscript content.
- Provider I/O remains bounded and server-side, and discovery responses remain
  uncached.
