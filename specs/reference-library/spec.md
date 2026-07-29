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
  when intake metadata is sparse. A PDF-origin key remains refinable after
  project linking and may improve with manual or reviewed metadata. Matching
  generated project aliases and canonical citations follow the refinement;
  custom or colliding aliases remain unchanged. Imported and non-PDF keys
  become final when exposed to a project. UUIDs remain the relational identity.
- Type-specific required fields follow common BibTeX entry types. DOI is not
  universally required. Every editable metadata field stores method, capture
  time, and actor provenance.
- BibTeX is bounded interchange and derived export, not live authority.
  Import retains the incoming key only as a suggested project alias.
- Human-facing titles, authors, and venues decode protective BibTeX braces and
  common accent markup for display, accessible names, search, and sorting. The
  stored metadata and derived BibTeX retain their round-trip-safe source text.
- A project links a stable library identity through one case-insensitive local
  citation alias and a bounded bibliographic snapshot. Alias rename rewrites
  exact `:cite[...]`, `:citet[...]`, and `:citep[...]` keys across all project
  files in the same revision.
- Project bibliography text is derived from linked snapshots. Normal export
  includes only aliases cited by composed `main.md`; archival export may use
  every explicit project link.
- The derived BibTeX projection remains internal collaboration state and an
  explicit import/export boundary. It does not appear in the Files or Research
  rails and never becomes an editable library authority.
- Existing workspace BibTeX migrates lazily and idempotently into the owner
  library, then becomes project links and derived bibliography.
- A bounded light-DOM reference-import control owns BibTeX and CSL JSON file
  selection, file reads, import transport, duplicate-submit gating, local
  failures, input reset, and refresh-pending state. It emits a typed successful
  refresh request; the workspace coordinator refreshes the canonical Library,
  applies toast policy, and acknowledges completion before another import.
- A PDF upload creates a provisional `misc` source immediately, derives only a
  title from its filename, assigns its provisional reference key, and attaches
  the private artifact atomically. Researchers may enrich metadata later;
  automatic services may suggest values but never fabricate or silently accept
  them.
- The browser may coordinate an ordered batch of at most 20 PDFs through the
  same atomic upload endpoint. Per-file failure does not stop later uploads;
  only failed files remain in an ephemeral retry queue. Batch intake performs no
  metadata extraction or provider lookup.
- A bounded upload control owns file selection, drag-and-drop acceptance,
  ordered batch execution, upload transport and response validation, partial
  failure, duplicate-submit and refresh-pending state, input reset, and guarded
  retries. Its bound companion status component owns queue progress, per-file
  outcomes, duplicate-source reveal actions, retry availability, busy and error
  presentation, and the ephemeral failed-file retry selection. The upload
  control emits typed notice or refresh-pending outcomes. The workspace
  coordinator retains canonical Library refreshes, duplicate-source navigation,
  and toast policy, then acknowledges the upload control so another batch may
  begin.
- A bounded light-DOM queue owns the count, visibility, reference choices,
  identification request, duplicate-submit gating, local progress and
  retryable failure state, and refresh-pending acknowledgment for legacy PDF
  artifacts that are not attached to a source. It derives that artifact subset
  and the available choices from the canonical Library snapshot. The workspace
  coordinator retains canonical Library refresh and toast policy. New uploads
  still create their provisional source atomically and normally bypass this
  compatibility queue.
- A bounded Library tools menu owns portable-archive file selection and reset,
  restore transport, duplicate-submit and refresh-pending state, local restore
  failures, export links, citation-network and archived-reference controls,
  canonical archived-reference visibility and local toggling, and typed refresh,
  navigation, and filter outcomes. The workspace coordinator reads that
  visibility when loading the Library and retains citation-network opening,
  canonical Library refresh, and notification policy.
- Linked PDF records may preview bounded, provider-specific OpenAlex, Crossref,
  DataCite, and Semantic Scholar candidates inline according to configured
  provider order. Records are grouped by normalized DOI before the researcher
  chooses one source per field. Acceptance refetches and verifies every selected
  provider, then commits the mixed fields once with provider-specific
  provenance. This may improve a PDF-origin refinable key before or after it is
  linked to a project.
- One bounded discovery-search component owns query inputs, publication-type
  choices, the provider request, response validation, search progress,
  result-count copy, and typed validated-result events. Its bounded sibling
  owns result presentation, metadata-to-CSL projection, import transport,
  per-result duplicate-submit gating, local progress and retryable failures,
  refresh-pending state, and a typed refresh outcome. Their composed Library
  workspace routes results and completed outcomes while the application
  coordinator retains canonical Library refresh and toast policy.
- One bounded filter component owns Library query and facet values, dynamic
  type choices, validated defaults, canonical reference filtering,
  project-linkage projection from canonical project-reference inputs, result
  counts, and reset behavior. A composed light-DOM Library workspace combines
  its owned Library snapshot with canonical project-reference and research-share
  inputs, synchronizes the resulting reference list, citation network, and
  unidentified-PDF queue, rerenders on filter changes, and owns focused-
  reference reveal. It encompasses discovery, reference import, PDF
  upload and status, web capture, tools, filters, results, citation network, and
  the unidentified-PDF queue; owns their sibling bindings and archive/capture
  delegation; and routes their outcomes through narrow coordinator callbacks.
  Nested project-reference and research mutation events stay inside this
  composite and resolve through the same callback boundary. The application
  coordinator retains canonical loading, cross-feature navigation, snapshot
  application, refresh execution, comparison effects, and notification
  presentation.
- Direct publication-management navigation is one Library-workspace lifecycle:
  activate the Library context, request canonical refresh, recover archived
  visibility when needed, focus the available reference, and emit a standalone
  route only after successful focus.
- A bounded light-DOM reference summary owns each result's display title,
  compact metadata, PDF action, project-link state, link and unlink transport,
  canonical workspace-response validation, and typed completed mutation
  outcomes. The workspace coordinator retains PDF presentation, canonical
  snapshot application, metadata editing and refinement, and Library refresh
  policy.
- A bounded light-DOM personal-fields block owns each source's tag, collection,
  reading-state, archive-state, and private-note form values; their request
  payloads and lifecycles; archive confirmation; duplicate-submit gating; and
  local retryable failures. It emits a typed successful-refresh outcome. The
  workspace coordinator retains canonical Library refreshes and notification
  policy.
- A bounded light-DOM metadata editor owns manual bibliographic values,
  refinement progress, PDF suggestions, grouped scholarly-provider matches,
  work and field selections, PDF extraction, provider preview and acceptance,
  refinement workflow state, manual and reviewed local persistence, and typed
  refresh and notice outcomes. The workspace coordinator retains canonical
  refreshes and notification policy; metadata components never receive or
  return raw DOM targets.
- A bounded light-DOM PDF-row component owns attached-artifact presentation,
  signed-in member access context, rights choices, primary-versus-secondary
  refinement availability, rights persistence, duplicate-submit gating, local
  retryable failures, and typed navigation, refinement, and refresh outcomes.
  The enclosing reference list routes a refinement intent to the metadata
  editor in that same reference row. The workspace coordinator retains PDF
  presentation, canonical Library refreshes, and notification policy.
- A bounded light-DOM research-row component composes attached PDFs with
  private notes, highlights, and web captures; owns share state, capture
  diagnostics, downloads, comparisons, project-pin availability, recapture
  presentation, share and revoke transport, project-pin transport, canonical
  workspace-response validation, and completed mutation outcomes. The workspace
  coordinator retains snapshot application, refreshes, and notification policy.
  Component updates, including nested PDF rows, finish before Library scroll
  restoration.
- A bounded light-DOM reference-list component owns result and empty-state
  rendering, per-reference detail expansion, composition of summary, metadata,
  personal-field, PDF, and research rows, nested update settlement, and
  addressed-card focus. It handles row-local PDF refinement without exposing
  the row or metadata editor DOM. Cross-feature child actions continue bubbling
  to the workspace coordinator, which retains canonical filtering, requests,
  refreshes, and notification policy.
- Tags, notes, highlights, reading state, artifact rights, archive state, and
  deletion impact remain library-owned.
- An authenticated project member may stream PDFs attached to the project
  owner's linked references through a project-scoped read-only endpoint. The
  endpoint exposes bounded display metadata, never owner object keys or general
  Library state. Unlinking the reference or removing membership revokes future
  access; public read-only and edit bearers never receive this capability.
- Archiving a reference requires explicit confirmation that names the target
  and explains that it will leave the active Library until restored. Cancelling
  confirmation performs no mutation; restoring an archived reference remains
  immediate.
- Web sources are stable records keyed by normalized canonical URL. Every
  access appends an immutable bounded snapshot with exact timestamp, content
  hash, retrieval metadata, diagnostics, and private raw/readable R2 objects.
  Existing project pins never advance during ordinary library refresh.
- Bounded web source capture and snapshot-comparison components own local URL
  input, reset behavior, capture and comparison requests, Valibot-backed
  comparison-response validation, duplicate-submit state, progress and failure
  presentation, and readable-text comparison presentation. The workspace
  coordinator retains persistence refreshes and user-notification policy.
- Source-to-source citation relationships are stored as provenance-bearing
  assertions between stable reference UUIDs. Confirmed, extracted, inferred,
  and conflicting derived states remain distinct from project manuscript
  `cites` links; researcher review never erases captured provenance.
- The bounded citation-network panel owns manual source and relationship
  choices, network and assertion presentation, and typed record and review
  intents. Its containing workspace owns the latest validated network and
  expansion snapshots, loading, filtering, request generations, validation,
  prompts, provenance-bearing mutations, and local failures while composing the
  shell and panel. The workspace coordinator retains canonical Library refresh
  and notification policy through typed outcomes.
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
- The default Library view keeps one **Add reference** control with PDF and
  website intake first. BibTeX and CSL JSON remain secondary, explicitly named
  reference-file imports without intake-time metadata overrides. Search stays
  visible; filters and maintenance tools use separate compact menus. References
  render as dense two-line rows suitable for large collections, while metadata,
  organization, reading state, and attached research remain available through
  per-reference progressive disclosure. A reference with an attached PDF
  exposes a compact row-level **PDF** action so opening the private reader never
  depends on expanding metadata details; references without an artifact omit
  the action.
- Every metadata, organization, reading-state, and private-note control in the
  per-reference disclosure has a stable identifier and a reference-qualified
  accessible name. Placeholder text is guidance, not the control's only label.
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
- A successful PDF intake automatically queues independent private highlight
  and reference analyses.
  Standard PDF highlight annotations retain their bounded geometry and optional
  comment; flattened yellow page graphics are detected from a bounded managed-
  browser render and matched back to the PDF text layer. Candidates
  without recoverable text are ignored. The researcher reviews selection and
  may edit each private note before one explicit, atomic import. Detection never
  uploads page pixels, silently saves a candidate, shares research, or mutates a
  project. A scan reads at most 200 pages and returns at most 128 candidates.
  Queue messages contain identifiers and fingerprints rather than PDF bytes.
  Generated analyzer and PDF-worker text assets load through bundled Worker
  modules; Node-only filesystem URLs are evaluated lazily so deployed analysis
  never depends on `import.meta.url` as a filesystem base.
  The owner Library Durable Object stores fingerprint-qualified queued, running,
  ready, and failed analysis state so delivery and retries are idempotent. Its
  stable RPC facade delegates that bounded SQL lifecycle and persisted-result
  validation to an adjacent capability service without moving migrations,
  authorization, or multi-resource transactions out of the Durable Object. The
  managed browser runs on a synthetic non-opaque origin so PDF.js can load its
  same-origin module worker without a cross-origin wrapper or fake-worker
  fallback. It can read only the synthetic analyzer document, generated PDF.js
  worker, and exact R2 object supplied through request interception for that
  job. The reference kind scans the bounded PDF text for
  a conventional References, Bibliography, Works Cited, or Literature Cited
  heading. It returns at most 128 numbered or author-year entries with their
  bounded raw citation, source page, and best-effort title, authors, year, DOI,
  URL, and confidence. The reader presents those candidates in a separate
  References disclosure with DOI/source links and an explicit rerun control
  after ready or failed analysis. Reference candidates do not silently create
  library records, citation assertions, or project state. A generic versioned
  artifact-analysis envelope allows later analysis kinds to reuse the same queue
  and lifecycle without weakening owner isolation. Pure annotation
  normalization, flattened-region detection, text matching, bibliography
  parsing, candidate deduplication, and
  confidence scoring consume normalized page, span, and bitmap inputs through
  the source-local PDF-analysis core. PDF.js loading, browser rendering, queue
  state, storage, authorization, polling, and UI remain adapter concerns. Each
  kind retains independent persisted state and validation. A bounded light-DOM
  component polls highlight status and owns
  empty, mixed-source, error,
  saved-highlight overlap filtering, review-selection, private-note, stable
  import transport, busy, explicit analysis retry, and completion presentation. It
  accepts explicit artifact, reference, and saved-highlight context, ignores
  stale asynchronous results after that identity changes, and emits only a
  typed completed-import outcome. The application coordinator retains
  canonical Library refresh and completion toast policy.
- The private reader stays focused on the page: its idle annotation surface is
  a compact Select, Text, Note, and Draw toolbar. One typed interaction
  owner keeps tool selection, note composition, saved-resource selection, note
  dragging, and drawing mutually exclusive. Changing tools or cancelling a
  pointer interaction clears its transient draft. Text selection
  opens a contextual save row; Note places a page-anchored private note; Draw
  captures Apple Pencil or mouse strokes with red as the default color and an
  adjustable 1–24 pixel width while touch remains available for pan and zoom.
  The Draw surface disables native browser gestures before pointer input begins
  so a zoomed iPad page cannot take over an Apple Pencil stroke. The reader
  handles one-finger panning and two-finger zooming explicitly on that surface.
  Once a Pencil or mouse stroke owns the surface, accompanying touch events are
  consumed without changing reader scroll until that stroke finishes or is
  cancelled.
  Holding the pointer still for 850 milliseconds after drawing a sufficiently
  large single-stroke line, circle or ellipse, rectangle, or triangle attempts
  local shape recognition. A confident match replaces the live rough stroke
  with fitted geometry while the pointer remains captured. Continued movement
  scales and rotates that shape around its opposite anchor; lifting saves the
  adjusted shape, while an uncertain, open, or undersized stroke remains
  freehand. Recognition runs in page-pixel coordinates, makes no network
  request, and persists the result through the existing normalized drawing
  contract rather than introducing editable shape records. The markup surface
  emits its own touch-versus-drawing and recognized-shape guidance as one typed
  status outcome for presentation by the inspector.
  Note placement is committed only after a stationary pointer gesture ends;
  movement that becomes a scroll or page swipe cancels the pending note.
  Notes and strokes use normalized page coordinates so they remain aligned when
  the page is resized. Saved annotations are collapsed by default.
- Successful private drawing saves, drawing undo, note moves, and saved-markup
  deletion converge through one canonical Library refresh. The completion
  notice is shown after refresh, and refresh failure remains visible instead of
  leaving an unhandled completion request.
- The enclosing reference-Library component owns this same refresh-completion
  lifecycle for discovery, import, PDF intake, metadata, personal-field,
  citation-network, web-source, archive, and identification outcomes. It always
  settles local request state, uses the metadata-specific refresh when needed,
  and delegates only canonical Library loading and shared notice presentation.
- One bounded light-DOM component owns the private-highlight, page-note, and
  selected-markup composer values and visibility. Its private-highlight draft
  includes captured rectangles and an optional editing identity. Given the
  active artifact, reference, and current highlights, it owns highlight create
  and comment-update transport, stable encoded targets, overlap classification,
  duplicate-submit gating, pending and retryable failure state, and the typed
  completed-save outcome. Given a stable artifact, reference, page, normalized
  anchor, and optional editing identity, it also owns page-note create and body-
  update transport with the same pending and retry behavior. Given a selected
  markup's stable reference and markup identities, it owns drawing-style update
  and selected-markup delete transport, including duplicate-submit gating and
  retryable local failures. It emits typed cancel, completed-mutation, edit, and
  clear intents. The application coordinator retains canonical Library refresh,
  PDF draft and selection clearing, inspector policy, and toasts.
- A companion light-DOM toolbar component owns active-tool presentation,
  drawing color and width, undo and export availability, annotation count, and
  inspector-expanded state. From the active page drawings, it derives the
  newest stable undo target and owns its deletion, pending suppression,
  retryable local failure state, and typed completion outcome. It also emits
  typed tool and inspector intents. Given a stable artifact identity and
  filename, it owns original-PDF download independently of annotation state as
  well as annotated-PDF download and installed-app file sharing, including
  cancellation and download fallback, and emits typed status outcomes. The
  application coordinator retains canonical refresh, inspector policy, and
  toast presentation.
- A bounded light-DOM inspector component composes the annotation forms,
  imported-highlight review, saved annotation list, and project-use block. It
  owns shell visibility, active-artifact identity, status presentation,
  expanded state, annotation-details opening, and a typed close intent. Given
  one canonical artifact, project, reference, and Library snapshot, it derives
  and projects each child component's context and resets child presentation
  state when the active artifact changes. The application coordinator retains
  local PDF viewer draft/tool/selection presentation through the composed
  context-resource presenter. The application coordinator retains navigation,
  persistence, close policy, canonical refreshes, history, and notifications.
- A bounded light-DOM markup layer owns saved and draft drawing SVG, note pins,
  tool and saved-resource selection state, note composition, open note cards,
  page-local saved-drawing and note projection from canonical artifact and
  markup inputs, live draft geometry updates, pointer capture, note movement,
  drawing and shape-recognition gestures, note-card dismissal, and focus restoration. It
  binds its host pointer-down, move, up, and cancellation events, routes them
  through that local gesture state, restores canonical note geometry after a
  cancelled drag, and emits typed selection, stationary-note, touch-warning,
  and completed-mutation outcomes. It
  persists a completed note move from the saved note's stable identities,
  suppresses overlapping move gestures, restores canonical geometry after a
  retryable failure, and emits a typed completed-move outcome. Given the active
  artifact and reference identities, it also persists a completed normalized
  drawing with the style captured at pointer release. A failed drawing remains
  visible for explicit retry or discard, and a pending save suppresses a new
  stroke. The annotation forms own page-note composition persistence; the
  application coordinator retains canonical refreshes, inspector policy, and
  notifications.
- A bounded light-DOM annotation list owns the private reader's saved highlight
  and markup cards, empty state, comments, share and citation availability, and
  typed navigation, edit, and cite intents. It owns research-share and revoke
  transport, canonical workspace-response validation, and completed mutation
  outcomes. A saved markup card owns its stable encoded delete request, a list-
  wide duplicate-request lock, retryable card-local failure state, and a typed
  deletion outcome. The application coordinator retains PDF navigation,
  history and load effects, while the composed context-resource presenter owns
  saved-highlight artifact lookup and post-open inspector status. The
  coordinator also retains project citation, snapshot application, canonical
  refreshes, and notifications.
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
  horizontal swipe begun on the fitted page or its surround changes page,
  except when it begins on an interactive PDF link or saved annotation. A
  two-finger gesture zooms the PDF rather than the application, anchored at the
  pinch midpoint; trackpad zoom is anchored at the pointer. The reader preserves
  its scrollbar-free fitted width across buffered zoom renders and remeasures it
  only after document or layout changes, so returning to fitted zoom cannot
  leave the page narrower. Live ink updates one draft path between saves.
- The active PDF page exposes standard PDF link annotations. Internal
  destinations stay in the reader and restore the destination page and
  position; external URLs open in a protected new tab.
- **Download original PDF** saves the immutable owner-private artifact whether
  or not it has annotations. Once the PDF has a saved text highlight, page note,
  or drawing, **Export annotated** saves a derived PDF without changing the
  stored source. Installed iPad web apps share a real PDF file through the
  native sheet so **Save to Files** is available; ordinary browser sessions
  fetch the private PDF with the active same-origin session and save it through
  a temporary local object URL, so the browser download manager never has to
  re-request an authenticated artifact URL.
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
- A bounded light-DOM project-use block owns unidentified, unlinked, and linked
  PDF presentation, capability-boundary copy, citation preview, project-link
  transport, canonical workspace-response validation, active bibliographic
  record and project-link projection, and a typed completed mutation outcome.
  The workspace coordinator supplies canonical snapshots and retains snapshot
  application, project-PDF refreshes, and notification policy.
- The composed Library workspace owns archive-aware canonical Library loading,
  response validation, and the single browser Library snapshot projection used
  by its filters, list, network, PDF queue, and coordinator consumers. It also
  completes metadata changes by refreshing that canonical Library itself before
  requesting one bound project refresh.
  owns general Library entry sequencing across context activation, optional
  standalone history entry, and canonical refresh. Standalone startup binds
  browser history, projects the Context-only shell and private connection state
  through typed capabilities, opens the Library, and restores the current
  route. It restores standalone
  Library routes through owned reference focus and artifact lookup, owns
  current-location parsing, root, addressed-reference, private-PDF, and active-
  page history mutation, and its browser-history restoration subscription with
  lifecycle teardown, and owns archive-aware source recovery, focus, and
  missing-reference feedback for direct entry navigation and duplicate-PDF
  upload reveals. The
  project publication list delegates its manage intent directly to this
  workspace's available-reference workflow. The private-PDF inspector delegates
  project reference and research mutation snapshots directly to this
  workspace's apply-project-notice lifecycle. Neither path requires an
  application-level callback adapter. The
  latter enables archived visibility, refreshes canonically, reuses owned
  filter/list focus, and reports a missing source locally. The context-resource
  presenter's route binding is the single Library snapshot, refresh, citation-
  insertion, and notice authority used by both resource navigation and private-
  PDF workflows; its narrower private-PDF mutation binding carries no duplicate
  canonical sources. Reference, research-share, and private-PDF project
  mutations use one Library-workspace apply-project-notice lifecycle. A bound
  project refresh loads the Library and linked PDFs, reconciles context
  authorization, presents project and context consumers after settlement, and
  replaces the canonical route. Library mutations delegate canonical project
  snapshot acceptance to the project-file owner; the coordinator retains viewer
  effects, context transitions, and notification presentation.
- A project publication context resolves every authorized paper representation
  for the stable reference identity. The owner sees attached private-library
  PDFs without converting them into project resources; active artifact shares
  appear to project members as read-only shared PDFs; legacy project-local PDFs
  remain explicitly connectable and disconnectable. Its bounded presentation
  owner derives this ordered paper list and available project-PDF choices from
  coordinator-supplied canonical inputs, preferring a local private artifact
  over its duplicate shared-reference projection. Labels distinguish these
  scopes, and the context-resource presenter dispatches each typed paper choice
  through its matching canonical PDF route. Opening a private PDF never shares
  it implicitly.
- In a project, each saved private text highlight exposes **Cite in manuscript**.
  The private-PDF presenter checks citation readiness, chooses a collision-safe
  alias, and links only the bibliographic snapshot when the source is not yet in
  the project. The workspace coordinator accepts the resulting canonical
  snapshot and inserts the project citation alias at the remembered manuscript
  caret with the highlight page as its locator. The action does not share the
  private highlight or PDF artifact.

### API Contracts

- `GET /api/library` returns the authenticated owner's private active library;
  `?archived=include` also returns archived records.
- `POST /api/library/import` validates bounded BibTeX before crossing the
  library Durable Object boundary, then imports it with per-field provenance.
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
- `POST /api/library/references/{referenceId}/highlight-imports` atomically
  creates 1–128 reviewed owner-private highlights for one identified artifact.
  Each candidate uses the ordinary bounded page, quote, comment, and normalized
  rectangle validation.
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
- Drawing, note, highlight, imported-highlight, style, position, and reading-
  state mutation payloads pass bounded Valibot structure validation before
  owner-library orchestration. Imported-highlight candidate semantics and
  Durable Object domain bounds remain explicit.
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
  compatible. Reviewed PDF fields, artifact ids, provider and fingerprint
  envelopes, and selected-field bounds pass composable Valibot validation;
  normalized-DOI, unique-provider, disjoint-field, freshness, and duplicate
  rules remain explicit orchestration policy.
- `POST /api/workspaces/{id}/references` links a source snapshot and local
  alias. Patch renames the alias; sync refreshes metadata; delete unlinks only
  after its citations are removed.
- When PDF metadata changes its generated key, each registered project rewrites
  that alias only if it still exactly matches the previous generated key and
  the replacement is locally available. The rewrite and bibliography update
  share one project revision; custom and colliding aliases remain stable.
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
- Do not mutate imported or non-PDF finalized keys. PDF-origin generated keys
  may refine because the UUID, not the author-facing key, is the relational
  identity.
- Do not copy the full private record into a project when it is merely cited.
- Do not keep an editable project bibliography as a second authority.
- Do not expose the derived project bibliography in ordinary editor rails, a
  primary editor, a Library tab, or a modal surface.
- Do not silently identify a PDF from uncertain or incomplete metadata.
- Do not delete a library source because one project unlinks it.
- Do not flatten provider, extraction, model, or manual citation evidence into
  one trusted boolean edge.
- Do not cover authoring with a modal for the primary library workflow or
  duplicate its permanent tab with generic header and rail launchers.
- Do not combine project reference linkage, an artifact-rights declaration,
  PDF sharing, or highlight sharing into one ambiguous action.
- Do not require project PDF or highlight sharing merely to cite the identified
  source and page represented by a private highlight.
- Do not create a temporary or hidden project to host standalone library work.

### Validation

- Pure tests cover type requirements, per-field provenance, DOI normalization,
  duplicate identity, portable snapshots, and bounded provider preview shapes.
- Real-`workerd` tests cover stable upsert, private state, PDF identification,
  project dependency impact, archive, tombstone deletion, project aliases,
  derived bibliography, cited-only filtering, alias rewrites, and selective
  provider-specific provenance.
- Key tests cover surname/year generation, sparse fallbacks, topical and numeric
  collision suffixes, linked PDF refinement, generated-alias rewrites, and
  preservation of custom aliases.
- Browser coverage opens a private artifact, saves and revisits a private
  page-and-quote highlight, restores reading state, keeps project evidence
  controls unavailable, and proves that capture does not mutate the workspace
  snapshot. It also extends an overlapping highlight and edits saved highlight
  and page-note text without replacing their identities. Pure tests prove
  fragmented DOM rectangles become visual lines and exported multi-line
  highlights remain one multi-quad annotation. Browser
  coverage opens attached PDFs directly from collapsed library rows and verifies
  that references without artifacts expose no PDF action.
- Pure tests cover yellow-region recovery, text reconstruction, candidate
  bounds, and bulk-import validation. Real-`workerd` coverage proves reviewed
  candidates commit atomically. Browser coverage detects a flattened yellow
  highlight, presents its quote for review, imports it privately, and leaves
  project state untouched.
- PDF-reference extraction prefers PDF content-stream line endings so
  multi-column bibliographies retain reading order, then falls back to bounded
  positional row reconstruction when that representation yields no usable
  bibliography.
- Browser coverage proves bounded batch progress, partial success, and retry
  without resubmitting successful PDFs.
- Browser coverage advances the reader's project-use states explicitly and
  proves PDF and highlight sharing can be revoked independently.
- Browser coverage proves a project-linked bibliographic reference exposes its
  attached private-library PDF in publication context even when the project has
  no project-local PDF or artifact share.
- PDF-reference review routes expose only the current fingerprint-qualified
  analysis and persist owner-attributed accept/reject dispositions. Acceptance
  reuses exact DOI identity or creates one reference with `pdf-reference`
  field provenance and one PDF-backed extracted citation assertion in the same
  owner-library transaction; rejection creates neither resource.
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
