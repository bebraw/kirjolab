# ADR-054: Model Publication-PDF Associations Explicitly

**Status:** Accepted

**Date:** 2026-07-11

## Context

Kirjolab models publications and imported PDFs as separate stable resources.
That distinction preserves portable BibTeX, immutable source artifacts, and
standalone PDFs, but the application cannot reliably open a paper from a
citation until it can state which local artifact represents that publication.

Citation keys, DOI values, titles, authors, and filenames are unsuitable as
canonical links. They can be missing or mutable, and a publication may have
several local versions or supplements while one compound PDF may represent
several publications. Guessing would make research navigation convenient only
when the heuristic happens to be right.

## Decision

`DocumentRoom` will persist publication-to-PDF associations as stable,
workspace-scoped `PublicationPdfLink` records. The association is many-to-many:
one publication may have several local artifacts and one PDF may represent
several publications. Each publication/PDF pair is unique and projects a typed
`has-artifact` edge from publication to PDF in the workspace knowledge graph.

Creating and removing an association are explicit authorized actions against
two existing resources in the same workspace. Kirjolab will never infer a
canonical association from a citation key, DOI, title, author, filename, or
search similarity. A future adapter may propose a match for review, but only
explicit confirmation can create the link.

Removing an association deletes only the link. It does not delete or mutate the
publication, PDF, canonical BibTeX, or annotations. Publications and PDFs with
no association remain independently usable resources.

## Trigger

ADR-053 places publication and PDF resources in one research-context pane.
Moving from a citation to a local paper needs an identity-safe relationship
between those resources rather than a filename or metadata guess.

## Consequences

**Positive:**

- Citation navigation can expose the correct zero, one, or several local
  artifacts without conflating publication and file identity.
- Multiple versions, supplementary material, and shared compound artifacts are
  represented without special cases.
- `has-artifact` becomes a navigable, provenance-preserving hypermedia edge.
- Unlinking is safe because both endpoint resources and all annotations remain.

**Negative:**

- Association management adds a durable link type, migration, API, UI, and
  reconciliation surface.
- A researcher or reviewed import adapter must establish a link before
  citation-to-PDF navigation is available.
- The UI must present multiple linked artifacts without arbitrarily selecting
  one as canonical.

**Neutral:**

- Publication projection from BibTeX and immutable PDF storage remain
  unchanged.
- Automatic matching may later suggest associations, but suggestions are not
  durable scholarly relationships.

## Alternatives Considered

### Store one PDF id on each publication

This makes the common case simple but cannot represent versions, supplements,
or a PDF shared by several publication records without overwriting identity.

### Store one publication id on each PDF

This supports several PDFs per publication but still excludes compound
artifacts and makes the relationship an incidental property of one endpoint.

### Infer associations from metadata or filenames

Automatic matching appears convenient, but mutable or missing metadata makes
silent false links likely. A reviewed suggestion can provide convenience
without promoting a heuristic result to canonical state.

### Merge publications and PDFs into one resource type

A single record removes the association, but conflates intellectual work with
one local representation and breaks the existing portable bibliography and
immutable artifact boundaries.
