# Feature: Reference Library Discovery

## Blueprint

### Context

Researchers need to find reusable sources by bibliographic content and by their
private research workflow state.

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

## Contract

### Definition of Done

- [x] Every agreed facet is available through labelled controls.
- [x] Linked/unlinked uses stable shared reference identity.
- [x] Completeness uses explicit core-field rules.
- [x] No-match and empty-library states are distinct.
- [x] Pure and browser tests cover combined filters and sorting.

### Regression Guardrails

- Filtering must not mutate the snapshot or reorder its canonical arrays.
- Tags and collections remain distinct stored concepts even though one filter
  can search both.
- Archived records enter the projection only after explicit archived loading.
