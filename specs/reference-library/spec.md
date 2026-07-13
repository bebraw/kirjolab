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
- Each source also has one unique immutable author-facing reference key. New
  keys prefer normalized first-author surname plus publication year, add a
  topical suffix for collisions, and use explicit `source`/`undated` fallbacks
  when intake metadata is sparse. UUIDs remain the relational identity.
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
- The read-only derived BibTeX projection is secondary project-file context. It
  remains collapsed in the Files rail rather than occupying the manuscript
  editor or becoming an editable library authority.
- Existing workspace BibTeX migrates lazily and idempotently into the owner
  library, then becomes project links and derived bibliography.
- A PDF upload creates a provisional `misc` source immediately, derives only a
  title from its filename, assigns its immutable reference key, and attaches
  the private artifact atomically. Researchers may enrich metadata later;
  automatic services may suggest values but never fabricate or silently accept
  them.
- DOI-backed records may preview bounded Crossref metadata inline. Acceptance
  refetches and verifies the provider fingerprint, then changes only the fields
  the researcher selected while preserving the immutable reference key.
- Tags, notes, highlights, reading state, artifact rights, archive state, and
  deletion impact remain library-owned.
- Web sources are stable records keyed by normalized canonical URL. Every
  access appends an immutable bounded snapshot with exact timestamp, content
  hash, retrieval metadata, diagnostics, and private raw/readable R2 objects.
  Existing project pins never advance during ordinary library refresh.
- Source-to-source citation relationships are stored as provenance-bearing
  assertions between stable reference UUIDs. Confirmed, extracted, inferred,
  and conflicting derived states remain distinct from project manuscript
  `cites` links; researcher review never erases captured provenance.
- The library is a permanent, non-closable tab beside Preview in the project's
  research-context pane. Activating it refreshes the authorized owner snapshot
  without opening a modal or mutating project state.
- The default Library view gives PDF upload and website URL capture first-class
  actions, keeps search visible, and folds filters, interchange, graph, metadata,
  organization, and reading controls into progressive disclosure.
- An attached private PDF opens from its library record in a kind-qualified
  context tab. Reading uses the owner-private stream and local page state. Text
  selection creates only an ephemeral private-highlight draft; an explicit save
  records its artifact, page, quote, and optional comment in the owner library
  without adding, sharing, or annotating the artifact in a project.
- The private reader exposes a staged current-project handoff without changing
  those defaults: first add the bibliographic record, then explicitly review
  artifact rights, then explicitly share or revoke the PDF snapshot. Each saved
  highlight retains a separate share or revoke action.

### API Contracts

- `GET /api/library` returns the authenticated owner's private active library;
  `?archived=include` also returns archived records.
- `POST /api/library/import` imports bounded BibTeX with per-field provenance.
- `POST /api/library/pdfs` stores a private PDF under an owner-scoped R2 key and
  atomically creates its editable library draft. The legacy identify route
  remains available for artifacts created before this flow.
- `PUT /api/library/pdfs/{id}/rights` records private, unknown, or shareable
  artifact rights.
- `GET /api/library/pdfs/{id}` streams an artifact only when it occurs in the
  authenticated owner's library snapshot, with inline, private, non-cacheable
  response headers.
- Reference tag, note, highlight, reading, archive, deletion-impact, and
  confirmed deletion routes mutate only the authenticated owner's library.
- Web-source capture, snapshot inspection, inert content download, and neutral
  snapshot comparison routes remain within the same owner-private API.
- Citation assertion, review, bounded network, and explicit Crossref reference
  expansion routes remain within the same owner-private API. A project id only
  filters the projection; it does not grant library access.
- Crossref enrichment preview and acceptance routes are owner-private,
  non-cacheable, and fail without mutation on stale metadata or duplicate DOI
  ownership.
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
- Do not mutate an assigned reference key when metadata changes; it is an
  author-facing handle over the UUID, not a replacement relational identity.
- Do not copy the full private record into a project when it is merely cited.
- Do not keep an editable project bibliography as a second authority.
- Do not give the derived project bibliography a primary editor, Library tab,
  or modal surface.
- Do not silently identify a PDF from uncertain or incomplete metadata.
- Do not delete a library source because one project unlinks it.
- Do not flatten provider, extraction, model, or manual citation evidence into
  one trusted boolean edge.
- Do not cover authoring with a modal for the primary library workflow or
  duplicate its permanent tab with generic header and rail launchers.
- Do not combine project reference linkage, an artifact-rights declaration,
  PDF sharing, or highlight sharing into one ambiguous action.

### Validation

- Pure tests cover type requirements, per-field provenance, DOI normalization,
  duplicate identity, portable snapshots, and bounded Crossref preview shapes.
- Real-`workerd` tests cover stable upsert, private state, PDF identification,
  project dependency impact, archive, tombstone deletion, project aliases,
  derived bibliography, cited-only filtering, alias rewrites, and selective
  Crossref provenance.
- Key tests cover surname/year generation, sparse fallbacks, topical and numeric
  collision suffixes and immutability through enrichment.
- Browser coverage opens a private artifact, saves and revisits a private
  page-and-quote highlight, restores reading state, keeps project evidence
  controls unavailable, and proves that capture does not mutate the workspace
  snapshot.
- Browser coverage advances the reader's project-use states explicitly and
  proves PDF and highlight sharing can be revoked independently.

## Current Milestone

- Implemented: owner-scoped library, provenance, BibTeX migration/import,
  immutable memorable reference keys, direct PDF drafts, private PDFs and
  legacy identification, notes/tags/highlights/reading state, archive
  and tombstone deletion, project aliases/snapshots, derived cited-only BibTeX,
  versioned web captures, provenance-bearing citation assertions and network,
  reviewed Crossref enrichment, explicit private PDF highlights in Context,
  and a permanent owner-private Library context tab.
- Superseded: workspace BibTeX authority and workspace-scoped publication
  projection described by ADR-044, ADR-051, and ADR-055.
