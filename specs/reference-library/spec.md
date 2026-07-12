# Feature: Shared Reference Library

## Blueprint

### Context

Researchers reuse sources, corrections, notes, PDFs, highlights, tags, and
reading state across papers. A project-local bibliography duplicates that
memory and makes citation aliases compete with stable source identity.

### Architecture

- `ReferenceLibrary` is a SQLite-backed Durable Object keyed by the verified
  owner's identity. It is the authority for bibliographic records and private
  research material; a `DocumentRoom` never becomes the library owner.
- Each source has a stable UUID independent of DOI, title, filename, and
  project citation aliases. DOI is normalized and preferred for likely-duplicate
  identity; records without DOI use a normalized title/year/first-author
  fingerprint and remain reviewable.
- Type-specific required fields follow common BibTeX entry types. DOI is not
  universally required. Every editable metadata field stores method, capture
  time, and actor provenance.
- BibTeX is bounded interchange and derived export, not live authority.
  Import retains the incoming key only as a suggested project alias.
- A project links a stable library identity through one case-insensitive local
  citation alias and a bounded bibliographic snapshot. Alias rename rewrites
  exact `:cite[...]` keys across all project files in the same revision.
- Project bibliography text is derived from linked snapshots. Normal export
  includes only aliases cited by composed `main.md`; archival export may use
  every explicit project link.
- Existing workspace BibTeX migrates lazily and idempotently into the owner
  library, then becomes project links and derived bibliography.
- A PDF first enters as an unidentified private artifact. It cannot attach to
  an ordinary source until the selected BibTeX type's required fields are
  complete. Automatic services may suggest metadata but never fabricate or
  silently accept it.
- Tags, notes, highlights, reading state, artifact rights, archive state, and
  deletion impact remain library-owned.
- Web sources are stable records keyed by normalized canonical URL. Every
  access appends an immutable bounded snapshot with exact timestamp, content
  hash, retrieval metadata, diagnostics, and private raw/readable R2 objects.
  Existing project pins never advance during ordinary library refresh.

### API Contracts

- `GET /api/library` returns the authenticated owner's private active library;
  `?archived=include` also returns archived records.
- `POST /api/library/import` imports bounded BibTeX with per-field provenance.
- `POST /api/library/pdfs` stores a private unidentified PDF under an
  owner-scoped R2 key; `POST /api/library/pdfs/{id}/identify` attaches it only
  to a complete source record.
- `PUT /api/library/pdfs/{id}/rights` records private, unknown, or shareable
  artifact rights.
- Reference tag, note, highlight, reading, archive, deletion-impact, and
  confirmed deletion routes mutate only the authenticated owner's library.
- Web-source capture, snapshot inspection, inert content download, and neutral
  snapshot comparison routes remain within the same owner-private API.
- `POST /api/workspaces/{id}/references` links a source snapshot and local
  alias. Patch renames the alias; sync refreshes metadata; delete unlinks only
  after its citations are removed.
- Workspace reads refresh changed linked metadata from the project owner's
  private library while exposing only the linked bibliographic record.

### Privacy and Security

- A shared reference library is owner-private. Workspace membership does not
  grant library browsing, PDF, note, tag, highlight, or reading-state access.
- Project snapshots contain no private abstract, note, tag, reading history, or
  artifact unless the owner performs the separate explicit sharing action.
- Library API responses are non-cacheable and all mutations retain the normal
  verified-identity and same-origin boundaries.
- R2 object keys are owner-scoped; direct artifact access resolves only through
  an authorized private-library or active project-share route.

### Anti-Patterns

- Do not make citation keys, DOI values, titles, or filenames stable source
  identities.
- Do not copy the full private record into a project when it is merely cited.
- Do not keep an editable project bibliography as a second authority.
- Do not silently identify a PDF from uncertain or incomplete metadata.
- Do not delete a library source because one project unlinks it.

### Validation

- Pure tests cover type requirements, per-field provenance, DOI normalization,
  duplicate identity, and portable snapshots.
- Real-`workerd` tests cover stable upsert, private state, PDF identification,
  project dependency impact, archive, tombstone deletion, project aliases,
  derived bibliography, cited-only filtering, and alias rewrites.

## Current Milestone

- Implemented: owner-scoped library, provenance, BibTeX migration/import,
  private PDFs and identification, notes/tags/highlights/reading state, archive
  and tombstone deletion, project aliases/snapshots, derived cited-only BibTeX,
  versioned web captures, and separate closed-by-default library UI.
- Superseded: workspace BibTeX authority and workspace-scoped publication
  projection described by ADR-044, ADR-051, and ADR-055.
