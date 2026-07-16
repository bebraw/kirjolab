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
- Each source also has one unique author-facing reference key. New
  keys prefer normalized first-author surname plus publication year, add a
  topical suffix for collisions, and use explicit `source`/`undated` fallbacks
  when intake metadata is sparse. A new PDF key remains provisional while the
  source is private-only, may improve with reviewed metadata, and becomes
  permanently final on its first project link. Imported, captured, migrated,
  and already finalized keys remain stable. UUIDs remain the relational identity.
- Type-specific required fields follow common BibTeX entry types. DOI is not
  universally required. Every editable metadata field stores method, capture
  time, and actor provenance.
- BibTeX is bounded interchange and derived export, not live authority.
  Import retains the incoming key only as a suggested project alias.
- A project links a stable library identity through one case-insensitive local
  citation alias and a bounded bibliographic snapshot. Alias rename rewrites
  exact `:cite[...]`, `:citet[...]`, and `:citep[...]` keys across all project
  files in the same revision.
- Project bibliography text is derived from linked snapshots. Normal export
  includes only aliases cited by composed `main.md`; archival export may use
  every explicit project link.
- The read-only derived BibTeX projection is secondary project-file context. It
  remains collapsed in the Files rail rather than occupying the manuscript
  editor or becoming an editable library authority.
- Existing workspace BibTeX migrates lazily and idempotently into the owner
  library, then becomes project links and derived bibliography.
- A PDF upload creates a provisional `misc` source immediately, derives only a
  title from its filename, assigns its provisional reference key, and attaches
  the private artifact atomically. Researchers may enrich metadata later;
  automatic services may suggest values but never fabricate or silently accept
  them.
- The browser may coordinate an ordered batch of at most 20 PDFs through the
  same atomic upload endpoint. Per-file failure does not stop later uploads;
  only failed files remain in an ephemeral retry queue. Batch intake performs no
  metadata extraction or provider lookup.
- Linked PDF records may preview bounded, provider-specific OpenAlex, Crossref,
  DataCite, and Semantic Scholar candidates inline according to configured
  provider order. Records are grouped by normalized DOI before the researcher
  chooses one source per field. Acceptance refetches and verifies every selected
  provider, then commits the mixed fields once with provider-specific
  provenance. This may improve a private-only provisional key but never changes
  a finalized key.
- Tags, notes, highlights, reading state, artifact rights, archive state, and
  deletion impact remain library-owned.
- Archiving a reference requires explicit confirmation that names the target
  and explains that it will leave the active Library until restored. Cancelling
  confirmation performs no mutation; restoring an archived reference remains
  immediate.
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
- `/library` exposes the same private Library and kind-qualified PDF reader
  without opening a project. This mode must not fetch a workspace snapshot,
  connect a collaboration socket, restore manuscript state, or expose project
  linkage and sharing actions. A PDF can be imported, privately annotated, and
  exported from this surface through the existing owner-library contracts.
- Standalone PDFs have stable `/library/pdfs/{artifactId}` locations. Opening a
  PDF pushes history, page changes replace that location with an optional
  `page` query, direct navigation restores the authorized artifact, and Back
  returns to `/library` without creating project or collaborative state.
- The default Library view keeps one **Add reference** control for PDF, website,
  BibTeX, and CSL intake without intake-time metadata overrides. Search stays
  visible; filters and maintenance tools use separate compact menus. References
  render as dense two-line rows suitable for large collections, while metadata,
  organization, reading state, and attached research remain available through
  per-reference progressive disclosure. A reference with an attached PDF
  exposes a compact row-level **PDF** action so opening the private reader never
  depends on expanding metadata details; references without an artifact omit
  the action.
- An attached private PDF opens from its library record in a kind-qualified
  context tab. Reading uses the owner-private stream and local page state. Text
  selection creates only an ephemeral private-highlight draft. Selection
  changes settle briefly so iPad handles can establish the complete range, and
  fragmented browser rectangles coalesce into continuous visual-line geometry.
  An explicit save records its artifact, page, quote, optional comment, and
  bounded normalized selection rectangles in the owner library
  without adding, sharing, or annotating the artifact in a project.
- Saving a text selection whose normalized rectangles overlap a saved
  highlight on the same artifact page extends that stable highlight instead of
  creating a second resource. Geometry, quotation text, and distinct comments
  are combined within their existing bounds. Non-overlapping selections remain
  separate highlights.
- The private reader stays focused on the page: its idle annotation surface is
  a compact Select, Text, Note, and Draw toolbar. One typed interaction
  transition authority keeps tool selection, note composition, saved-resource
  selection, note dragging, and drawing mutually exclusive. Changing tools or
  cancelling a pointer interaction clears its transient draft. Text selection
  opens a contextual save row; Note places a page-anchored private note; Draw
  captures Apple Pencil or mouse strokes with red as the default color and an
  adjustable 1–24 pixel width while touch remains available for pan and zoom.
  The Draw surface disables native browser gestures before pointer input begins
  so a zoomed iPad page cannot take over an Apple Pencil stroke. The reader
  handles one-finger panning and two-finger zooming explicitly on that surface.
  Once a Pencil or mouse stroke owns the surface, accompanying touch events are
  consumed without changing reader scroll until that stroke finishes or is
  cancelled.
  Notes and strokes use normalized page coordinates so they remain aligned when
  the page is resized. Saved annotations are collapsed by default.
- Saved text-highlight comments and page-note bodies expose an explicit edit
  action. Editing preserves the annotation id, page, geometry, and creation
  time while advancing its update time; it never changes the immutable PDF.
- Saved private highlight rectangles repaint over the matching page. Existing
  quote-only highlights remain valid but cannot recover geometry. Note pins can
  be dragged to a new normalized anchor; drawing undo deletes the newest stroke
  on the active page by creation time and stable id.
- At tablet widths, page navigation and annotation tools share one left rail so
  the page retains vertical and horizontal space. Short landscape viewports use
  two columns without shrinking touch targets; taller viewports use one. A
  horizontal swipe begun in the page surround changes page, while a two-finger
  gesture zooms the PDF rather than the application. Live ink updates one draft
  path between saves.
- Once the PDF has a saved text highlight, page note, or drawing, **Export
  annotated** downloads a derived PDF without changing the stored source.
  Freehand strokes are flattened at their normalized page coordinates. Page
  notes become interactive sticky-note annotations with popup contents; text
  highlights with geometry become one standard multi-quad PDF highlight
  annotation per saved highlight, preserving continuous line backgrounds and
  one interactive comment target. Legacy quote-only highlights become
  page-level comments.
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
  response headers. It forwards HTTP byte ranges and object preconditions to R2
  so private readers can request bounded slices and validate the current ETag.
- `GET /api/library/pdfs/{id}/annotated` applies only that artifact's private
  annotations and returns an attachment with private, non-cacheable headers.
  It uses the same authenticated-owner lookup as the original PDF stream, reads
  at most the existing 25 MB source limit, and never persists the derived copy.
- Reference tag, note, highlight, reading, archive, deletion-impact, and
  confirmed deletion routes mutate only the authenticated owner's library.
- Highlight creation accepts at most 512 normalized rectangles. Missing or
  malformed geometry fails closed; migrated legacy rows contain an empty list.
- `PATCH /api/library/references/{referenceId}/highlights/{highlightId}` updates
  only the bounded private comment for an owner-matching highlight.
- `POST /api/library/references/{referenceId}/pdf-markups` creates an
  owner-private note or drawing for an identified artifact. Notes are limited
  to 8,000 characters; colors use six-digit hex; widths are 1–24; drawings
  contain 2–2,048 normalized points. `DELETE` of a markup requires the same
  reference ownership boundary. PDF markups are not project-share resources.
- `PATCH /api/library/references/{referenceId}/pdf-markups/{markupId}` moves an
  owner-private note to a validated normalized anchor and may replace its
  bounded body. It cannot turn a drawing into a note or mutate a resource owned
  by another reference.
- The private PDF drawing tool keeps color, line width, and undo controls in a
  compact vertical group within the annotation rail. Activating drawing must
  not open a horizontal overlay across the document or widen the page.
- Web-source capture, snapshot inspection, inert content download, and neutral
  snapshot comparison routes remain within the same owner-private API.
- Citation assertion, review, bounded network, and explicit Crossref reference
  expansion routes remain within the same owner-private API. A project id only
  filters the projection; it does not grant library access.
- Metadata refinement preview and acceptance routes are owner-private and
  non-cacheable. A one-to-four-provider batch must describe one normalized DOI,
  assign every field once, and fail without mutation on invalid, stale, mixed,
  unavailable, or duplicate-DOI input. Legacy Crossref enrichment remains
  compatible.
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
- Do not mutate a finalized reference key when metadata changes or a project
  unlinks it; it is an author-facing handle over the UUID, not a replacement
  relational identity.
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
- Do not create a temporary or hidden project to host standalone library work.

### Validation

- Pure tests cover type requirements, per-field provenance, DOI normalization,
  duplicate identity, portable snapshots, and bounded provider preview shapes.
- Real-`workerd` tests cover stable upsert, private state, PDF identification,
  project dependency impact, archive, tombstone deletion, project aliases,
  derived bibliography, cited-only filtering, alias rewrites, and selective
  provider-specific provenance.
- Key tests cover surname/year generation, sparse fallbacks, topical and numeric
  collision suffixes, provisional improvement, and permanent first-link finalization.
- Browser coverage opens a private artifact, saves and revisits a private
  page-and-quote highlight, restores reading state, keeps project evidence
  controls unavailable, and proves that capture does not mutate the workspace
  snapshot. It also extends an overlapping highlight and edits saved highlight
  and page-note text without replacing their identities. Pure tests prove
  fragmented DOM rectangles become visual lines and exported multi-line
  highlights remain one multi-quad annotation. Browser
  coverage opens attached PDFs directly from collapsed library rows and verifies
  that references without artifacts expose no PDF action.
- Browser coverage proves bounded batch progress, partial success, and retry
  without resubmitting successful PDFs.
- Browser coverage advances the reader's project-use states explicitly and
  proves PDF and highlight sharing can be revoked independently.
- Shell and browser coverage prove `/library` starts from the owner-library API
  alone and retains PDF import, annotation, and annotated-export controls.

## Current Milestone

- Implemented: owner-scoped library, provenance, BibTeX migration/import,
  lifecycle-aware memorable reference keys, direct PDF drafts, private PDFs and
  browser-coordinated batch PDF intake, legacy identification,
  notes/tags/highlights/reading state, archive
  and tombstone deletion, project aliases/snapshots, derived cited-only BibTeX,
  versioned web captures, provenance-bearing citation assertions and network,
  reviewed multi-provider metadata enrichment, explicit private PDF highlights in Context,
  and a permanent owner-private Library context tab.
- Superseded: workspace BibTeX authority and workspace-scoped publication
  projection described by ADR-044, ADR-051, and ADR-055.
