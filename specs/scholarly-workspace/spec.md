# Feature: Scholarly Workspace Vertical Slice

## Blueprint

### Context

Kirjolab needs to prove one complete scholarly loop before expanding into a
general editor or reference manager. A researcher must be able to move evidence
from an immutable PDF into an anchored annotation, connect it to manuscript
text, ask a local model for a grounded revision, review the candidate, and
export portable source.

The compatible `demo` workspace remains the default active catalog entry, while
authorized projects open canonically at `/editor/{workspaceId}`. `/editor`
redirects to the first active project. `/` is now the application dashboard and
does not bootstrap a workspace. The current editor supports loopback local
identity and a fail-closed Cloudflare Access mode for authenticated hosted
collaboration.

### Architecture

- **Application shell:** `src/views/home.ts` renders the accessible workspace;
  `src/client/app.ts` provides typed browser behavior bundled into
  `.generated/app.txt`. Persistent interface copy names the user's next action
  and keeps implementation detail in feature documentation rather than the
  task surface.
- **Capability-scoped editor shell:** Read-only `/share/{token}` and writable
  `/edit/{token}` project links render one shared project-file, source, and PDF
  layout without loading the authenticated application runtime. The validated
  route selects a genuinely read-only source control or the edit capability's
  bounded whole-file autosave and presence adapter; it never selects server
  authority through client-visible state.
- **Browser entry:** `/editor` redirects to the first active authorized project,
  using the compatible `demo` workspace by default, and
  `/editor/{workspaceId}` opens its canonical editor. Legacy
  `/workspaces/{workspaceId}` browser locations redirect to the canonical
  editor route with their query string intact. The `/` dashboard links into the
  editor but does not fetch a workspace snapshot, restore offline source, or
  open collaboration itself. Workspace APIs retain their existing paths.
- **Workspace snapshot client:** One typed browser client owns canonical
  workspace fetch status policy, JSON parsing, domain validation, and optional
  Yjs anchor reprojection. The workspace coordinator owns online/offline
  fallback, snapshot application, UI bootstrap, collaboration transitions, and
  error presentation.
- **Project switcher:** One bounded light-DOM control owns authorized project
  option rendering, archived-current handling, selected state, and focus entry,
  then emits a typed navigation intent. The workspace coordinator retains
  catalog fetching and canonical route navigation.
- **Project catalog:** One bounded light-DOM panel owns filtering, result and
  empty-state presentation, native modal lifecycle, and initial filter focus.
  The project starting-point browser binds that catalog owner directly and
  reads its live catalog without a parallel getter. The workspace coordinator
  retains catalog fetching and navigation authority.
- **Project sharing:** One bounded light-DOM panel owns collaborator and
  capability-link presentation, invitation input, clipboard interaction, and
  native modal lifecycle. The workspace coordinator retains membership and
  capability-link requests, authorization outcomes, and toast policy.
- **Browser runtime loading:** The generated application module is minified and
  excludes the Markdown pipeline and PDF.js. Content-fingerprinted immutable
  Markdown and PDF.js runtime URLs are compiled into each application build.
  Markdown loads concurrently with workspace data; PDF.js loads on first use.
  Consumers share each cached module thereafter.
- **Appearance:** The shell uses one semantic `app-*` token palette with light
  and dark values. Appearance follows the operating-system color scheme by
  default; a browser-local System, Light, or Dark preference may override it
  without entering project, collaboration, or server state. Every HTML surface
  identifies Kirjolab with the same lightweight, Worker-served SVG favicon.
- **Primary surfaces:** The authoring editor remains visible beside a tabbed
  research-context pane on desktop. The pane permanently hosts manuscript
  Preview, the owner-private Library, and Writing assistant, and can host
  publication, PDF, and model-candidate resources without making local tab,
  pin, scroll, or reading-position state collaborative.
  One progressive light-DOM tab strip owns fixed-tab presentation, dynamic-tab
  and overflow-overview composition from one input, keyboard focus, controlled-
  panel and Preview-control visibility, resource labels, private-versus-read-
  only PDF presentation, and typed selection or closure intents. The coordinator
  retains canonical active-context state, authorized resource loading, route
  synchronization, content rendering, and PDF-specific form and inspector
  presentation.
  Layouts narrower than the split pane's declared minimum width switch between
  one Authoring or Context surface while preserving both states and without
  introducing horizontal page overflow.
  On desktop, including short wide viewports, the workspace has one
  viewport-bounded content row: Authoring and Context reach its lower edge
  without an empty footer track. The manuscript textarea owns vertical
  scrolling within that row and does not expose a native resize handle that
  conflicts with the fixed pane layout.
  While Preview is active, a compact control at the pane boundary synchronizes
  the source caret and rendered passage in either direction. Preview content
  clicks navigate to source, while deliberate source navigation follows in
  Preview without moving the pane during ordinary typing. A bounded light-DOM
  control owns its directional actions, Preview-context visibility, current
  composition source map, bidirectional composition-offset resolution,
  centered source-offset derivation, Preview-to-source file-qualified focus
  intent, and source-viewport centering. Workspace Preview derives source-to-
  Preview automatic-versus-explicit eligibility from its bound active-file,
  context, and layout projections, owns one document-wide Yjs update
  subscription with disconnect teardown, reads the canonical snapshot directly
  from its bound project-file owner, and owns mapped DOM navigation. No parallel
  snapshot callback duplicates that owner. The coordinator retains those
  canonical authorities plus file activation, mode, caret, and source-focus
  policy.
  A bounded progressive Lit control owns browser-local top-navigation
  visibility, persistence, toggle and restore copy, ARIA presentation, and
  focus handoff. In workspace mode the toggle follows Preview availability;
  Library readers can restore navigation while it is hidden. The coordinator
  supplies only active-context availability.
- **Editor toolbar:** Persistent editor actions keep their labels on one line.
  The toolbar never wraps: Write/Map, word count, Insert, current target, and
  save state retain one horizontal hierarchy. Lower-frequency History, revision,
  Vim, and file mutations live in one labelled More menu. Target text may
  truncate with its complete value retained as a native title, and word count
  yields at the narrowest container widths instead of increasing toolbar height
  or overflowing the page. Above the phone layout, the More menu opens toward
  the manuscript so the authoring column cannot clip it beneath the project
  rail.
  File navigation remains in the default-visible project tree rather than
  consuming toolbar width with a duplicate selector.
- **Authoring modality:** Write and Map are peer views of the current project.
  Write retains the native collaborative Markdown textarea. Map replaces it
  with a read-only derived evidence graph, bounded project search, and an
  accessible typed-connection list. Navigation into manuscript source returns
  to Authoring/Write; changing modes never changes canonical or collaborative
  state. A
  bounded light-DOM tab component owns internal and workflow-driven mode
  selection, active-mode and ARIA presentation, and controlled editor, write-
  action, and map visibility before reporting the selected mode through one
  typed callback. One composed light-DOM map workspace owns its
  resource and link totals, search and overview presentation, graph and
  connection-panel synchronization, visibility, focus entry, and one typed
  resource-selection stream. The application coordinator retains authorized
  search requests, response validation, and resource navigation. The surface
  switcher's workspace-route binding applies the Authoring surface, supplied
  editor focus, and one URL replacement for every Write outcome; Map outcomes
  replace the route without changing surfaces or focus.
- **Left project rail:** Files, Research, and Comments are peer local navigation
  modes. Comments contains the selected-passage composer and durable comment
  history without taking vertical space from the manuscript editor. Derived
  bibliography state stays outside ordinary editor rails. Their persistent
  switcher uses compact icons with accessible names,
  native hover titles, and a visible open-comment count.
  One bounded light-DOM tab component owns its active mode, open-comment count,
  ARIA selection state, controlled-panel visibility, and the selection
  transition used by both tab clicks and workflow-driven navigation. It reports
  the selected mode through one typed callback. The workspace surface switcher's
  route binding consumes that outcome and replaces the canonical URL. The
  application coordinator retains guide rendering; the layout manager retains
  collapse and resize behavior.
  The bounded project-tree panel owns the workspace-only Cmd/Ctrl+P shortcut
  and emits a typed quick-open intent; the coordinator reveals the Files rail
  before asking the panel to focus its filter.
  Research is limited to the actionable Project evidence, Claims, and
  References inventories; project search and graph controls belong to Map. The
  bounded project-publication component owns the complete References collection
  shell and count from its authoritative publication data.
  One bounded layout manager owns rail collapse and resizing, authoring/context
  pane resizing, keyboard and pointer interactions, ARIA values, browser-local
  persistence, PDF resize notification, and resolution of its controls beneath
  the workspace root. The coordinator supplies that root plus context and PDF
  hooks rather than collecting each internal control. Widths remain
  context-specific transient UI state rather than collaborative data or
  workspace URL state.
  On desktop the rail width is adjustable by pointer or keyboard within bounded
  readable limits and persists as a browser-local, cross-project preference.
  It can collapse without losing that width and exposes an editor-toolbar
  restoration action while hidden. Compact layouts keep the stacked rail and
  omit the resize and collapse affordances. Long file inventories scroll inside
  the rail without increasing the document height or moving the workspace below
  the viewport.
  At rail widths of at least 20rem, the navigation icons reveal short visible
  labels. Both desktop separators expose a centered grip plus native help for
  pointer dragging, arrow-key adjustment, and `Home` reset.
- **Legacy project evidence:** Project-owned PDFs and their annotations remain
  available for existing projects without advertising the superseded upload
  path. Research hides the collection when both are absent; otherwise one
  compact Project evidence collection groups highlights beneath their paper.
  Its Lit panel projects PDFs, annotations, claim-evidence links, passage links,
  and publication-PDF links directly from the canonical workspace snapshot plus
  browser-local evidence selection.
  Its Lit panel owns guarded PDF removal only after both annotations and
  explicit publication links are absent, and guarded annotation removal only
  after claim evidence is absent. It derives passage-link confirmation counts,
  owns stable encoded targets, one shared duplicate-submit gate, pending state,
  retryable failures, notices, and completed-removal outcomes. Canonical
  resource navigation asks the panel to reveal its addressed annotation card;
  the coordinator does not query that internal DOM. Canonical refresh,
  annotation-form reset, and notification policy remain in the workspace
  coordinator. New PDF intake remains in Library → Add reference.
- **Workspace navigation:** `WorkspaceCatalog` lists and creates stable
  workspace resources while each `DocumentRoom` retains isolated coordination.
  Dashboard and Projects-browser links use `/editor/{workspaceId}`; creating or
  selecting a project navigates there before its state and collaboration are
  initialized. `/editor` remains the concise resume entry and resolves through
  the authorized catalog.
  Infrequent project-management and file-mutation actions stay grouped in
  labelled menus so the persistent chrome prioritizes authoring and export.
  A bounded direct-child surface switcher owns responsive Authoring/Context
  selection, ARIA presentation, and the parent workspace's visibility-driving
  active-surface projection. Through one workspace-route binding it also owns
  readiness, ordered file, rail, Write/Map, context, layout, and surface
  restoration, canonical URL comparison, and push-versus-replace history
  writes. It restores the persisted layout before applying any explicit URL
  override. The coordinator supplies canonical state and bounded restoration
  effects through the live project, Context, and authoring owners rather than
  duplicating owner state and methods as callback adapters. Write/Map mode
  selection follows the same boundary, while the surface switcher's route
  binding applies Authoring, focuses the supplied authoring target, and replaces
  the route once for every Write outcome.
  The project-view Lit control likewise applies normalized internal, restored,
  and route-driven workspace layouts, resilient local persistence, and resize
  notification before reporting one typed outcome. The surface switcher's route
  binding consumes that outcome, asks its supplied Context owner to ensure an
  available PDF for PDF-only mode, and replaces the canonical route.
  A bounded History trigger owns the monotonic presented revision and badge,
  delegates its open intent to the history dialog, and routes revision-dependent
  collaborator data, highlight refresh, offline scheduling, and active-candidate
  refresh through bound owners. Collaboration retains server revision authority.
  A composed Lit history-dialog boundary owns modal lifecycle, busy state,
  panel-close handling, and timeline, inspection, and comparison presentation;
  the coordinator retains the revision XState workflow, requests, mutations,
  navigation, and failure policy.
  A bounded connection-status owner binds the collaboration workflow and
  authoring controls once. It derives connection label/tone plus source and
  companion editability and requests assistant-availability refresh after each
  transition; collaboration retains state-machine and transport authority.
  User-facing copy calls the editable unit a project; workspace remains an
  implementation term for APIs, types, and coordination boundaries.
- **Personal preferences:** A compact panel beside the Kirjolab heading owns
  browser-local, cross-project choices that are normally configured once:
  appearance, Vim editing, and the local model connection, endpoint, model,
  and reasoning effort. The same panel exposes a copyable application version
  derived from the built offline shell for error and cache reporting. Project
  layout, sharing, export, and publication controls remain in their
  task-specific surfaces. Writing assistant links back to the shared panel
  rather than duplicating model controls.
  A bounded light-DOM version control owns build-version presentation and both
  Clipboard API and textarea fallback copying. It also derives its version from
  the built offline shell and owns service-worker registration, update refresh
  sequencing, workspace-navigation caching, ready projection, and fail-open
  behavior. Narrow bindings retain coordinator-owned persistence, pinned-update
  presentation, and copy notices.
  A bounded light-DOM Vim control owns stored enablement, mode presentation,
  modal keyboard and pointer-selection behavior, and editor-listener teardown;
  the coordinator supplies only the source textarea and its visual shell.
- **Model provider settings:** A bounded light-DOM component owns browser-local
  provider preferences, Valibot-backed bounded restoration, persistence, model
  options, discovery requests, overlapping-request suppression, busy and result
  status, and failure recovery. The application coordinator supplies cross-
  feature discovery availability, mirrors status to the assistant workflow, and
  retains generation.
- **Assistant task setup:** A bounded light-DOM component owns local operation,
  target scope, instruction, claim relation, rhetorical purpose, structured
  table requirements, operation-specific copy and visibility, target-preview
  wording and excerpt truncation from canonical target inputs, and generation
  readiness. It emits typed task-change and generation intents; the application
  coordinator retains canonical editor target, evidence, model requests,
  workflow state, results, and status policy. The assistant-generation presenter
  derives insertion and scoped passages from bound canonical file, source, and
  target providers plus the task-owned scope. When evidence
  selection is requested, the bounded Project evidence
  and Claims panels own collection opening, scrolling, and focus for the first
  available grounding choice; the application coordinator retains rail
  selection while the context-resource presenter supplies the shared no-
  evidence notice route. The assistant-generation presenter binds once to that
  presenter for canonical candidate, project-PDF, project snapshot, Library-
  refresh, assistant-tab, and no-evidence notice routes instead of repeating
  them across task, result, and candidate workflows. It also binds the remaining
  application-owned generation inputs and consequences once through one
  workflow coordinator instead of separate candidate, result, and control
  callback bags. It binds the live project, editor, history, and collaboration
  owners once as authoring sources instead of duplicating their values through
  getter adapters, then derives scoped and insertion passages, generation
  input, availability, target presentation,
  and snapshot readiness internally. The bounded workflow-status owner reconciles its
  selected keys directly against coordinator-supplied canonical annotations and
  claims, retains those collections for model-evidence projection, and exposes
  the resulting evidence without requiring the coordinator to re-supply them;
  the coordinator does not construct or retain a parallel valid-key set.
- **Editor status:** One bounded light-DOM component owns the visible authoring
  target, bounded line counting, file, line-range, caret, and selection wording,
  its full tooltip, online or offline save-state presentation, browser-local
  Yjs-relative target, active file context, range selection, resolved caret, and
  non-empty passage projection. It also projects one live insertion target from
  its owned source, caret, and passage state. The Insert menu consumes that
  target and the editor and notice owners directly for syntax and relative-file
  insertion, without coordinator-built insertion callbacks. The application
  coordinator supplies the Yjs document and active text plus save state from
  collaboration workflows; it retains editor highlighting and assistant
  refresh.
- **Project evidence mutations:** The bounded Project evidence panel owns
  guarded PDF and annotation removal plus annotation-passage-link transport
  from a resource-presenter-validated typed passage. Its enclosing resource presenter
  owns annotation-form cleanup and selection, edit and PDF routes, fragment-
  removal refresh sequencing, and notice dispatch. Separate typed workspace and
  assistant bindings retain Yjs selection stability, grounding authority,
  canonical refresh transport, passage navigation, and mutation completion
  policy outside the panel; the resource presenter validates and delegates
  passage linking.
- **Claim and publication routes:** The enclosing resource presenter configures
  the claim list and publication list/context panels and routes claim
  annotations to project evidence, publication opening to canonical context,
  and citation and linked-paper intents among its composed Lit owners. The
  application coordinator retains mutation consequences, passage effects,
  Library entry management, and refresh policy.
- **Access control:** Verified Cloudflare Access identities or loopback-local
  identities resolve explicit owner/member roles before workspace state.
- **Schema lifecycle:** Every SQLite-backed document, catalog, and access
  Durable Object owns an ordered, named, append-only migration ledger. Each
  pending migration and its ledger record commit in one synchronous
  transaction; anchor backfill and initial bibliography projection are explicit
  data migrations.
- **Platform verification:** `src/**/*.workers.test.ts` runs through the
  dedicated Cloudflare Vitest project in a real local `workerd` runtime with
  isolated per-test storage. It owns Durable Object migration, transaction,
  RPC, and eviction contracts; Node tests own shared pure-domain behavior.
- **Document semantics:** A pinned unified/remark pipeline parses standard
  Markdown and GFM while `src/domain/markdown.ts` adds headings, citations,
  references, aliases, anchors, validation, and allowlist preview security from
  the scientific-writing syntax.
- **Project composition:** One stable root `main.md` composes user-named
  supporting Markdown files through bounded relative `::include[path]`
  directives. Preview and export use the composed source while diagnostics and
  durable anchors retain file-qualified source provenance.
- **Project-file operations:** One bounded light-DOM dialog owns the selected
  file or folder operation, operation-specific copy, initial path, focus, and
  cancellation. Its typed save intent carries the operation mode and submitted
  path together. Two instances of one bounded light-DOM action component own
  the rail and editor-menu commands plus entry-file delete availability and
  emit one typed action contract. The workspace coordinator retains active-file
  identity, resource checks, target and include capture, upload selection,
  persistence, deferred deletion, selection, refresh, and toast policy.
- **Collaboration:** `DocumentRoom` is a SQLite-backed Durable Object for each
  composed project. On a hibernatable WebSocket connection it sends full binary Yjs
  state followed by a versioned `sync` control. The browser sends no state on
  open, retains ordered local updates until a durable `ack`, and replays only
  unacknowledged updates after reconnect.
- **Connection workflow:** One browser-local XState actor coordinates
  disconnected, connecting, synchronizing, live, reconnecting, offline, and
  reset phases. It tracks queued-update count, the remote-revision boundary,
  collaborator count, and whether an authorized offline copy exists. WebSocket
  instances, retry timers, Yjs documents and updates, and IndexedDB records
  remain outside the actor. A typed collaboration session composes that actor
  with the ordered pending-update queue, Yjs server-shadow document,
  acknowledged server vector, and offline-delta reconstruction. One typed
  socket authority around the session owns WebSocket creation, reconnect and
  selection timers, online/offline browser subscriptions, strict control
  routing, binary-update application, queue flushing, reset cleanup, reload
  sequencing, and the document-wide local-update subscription. It schedules
  offline persistence for every update, delegates remote/offline-origin
  filtering and local enqueueing to the session, selects pending save wording,
  invalidates assistant availability, flushes immediately, and supports
  explicit teardown. The workspace coordinator supplies editor-selection
  restoration, revision effects, resource refresh, collaborator presentation,
  and UI projection through explicit callbacks. One
  bounded light-DOM component presents the actor-derived label and connected
  tone together and also owns the equivalent private-Library status presentation.
- **Editor ownership:** After `sync`, source and bibliography inputs derive from
  `Y.Text`; server collaboration controls own the displayed revision. REST
  workspace refreshes cannot assign those values. The editor reports `Saved`
  once initial synchronization completes with no queued local updates.
- **Source editor adapter:** One bounded browser adapter owns textarea-to-Yjs
  synchronization and history, syntax and presence mirroring, scroll alignment,
  completion geometry, and relative-selection capture and validated resolution
  to normalized numeric ranges. The same adapter owns the attributed atomic
  range-splice primitive used by editor completion, syntax, and generated-table
  actions.
  The workspace coordinator retains document identity, collaboration workflow,
  canonical completion inputs, authoring-target use, and navigation authority.
- **Citation completion:** With the caret in a `:cite`, `:citet`, or `:citep`
  key, the source editor ranks matching project aliases by key, author, and
  title and shows key, author, title, and year metadata. A browser-local
  preference defaults suggestions to project references and may also expose a
  separate private-library `Add and cite` action. Completion replaces only the
  active comma-separated key in one collaborative text transaction; accepting
  a private-library result explicitly links it to the project first.
- **Include completion:** With the caret in a line-level `::include[...]`
  directive, the source editor suggests other project Markdown files by their
  path. Each inserted reference is computed relative to the active file and
  replaces only the path inside the directive in one collaborative text
  transaction.
- **Completion presentation:** One bounded light-DOM component owns citation
  and include context detection from its bound editor, candidate ranking,
  display adaptation, option markup, empty-state hiding, popup positioning,
  hover and keyboard selection, active-descendant state, selected-option
  scrolling, editor change, keyboard, and blur binding, browser-local
  citation-scope persistence, local Escape and blur dismissal, private-Library
  loading and response validation for that scope, and project acceptance.
  One callback reports bound-editor changes for coordinator-owned authoring
  selection, presence, and model-availability consequences. Acceptance applies
  relative includes immediately. For a private-Library citation it preserves
  the collaborative range, requests project linking, delegates canonical
  snapshot application, resolves the range again, applies the citation through
  the insertion owner, and presents completion. The pure citation-completion adapter derives project and
  available unlinked Library candidates from canonical reference inputs; the
  component derives project-relative include candidates from canonical files
  and the active file id. The workspace coordinator supplies narrow mutation,
  range, insertion, and notice capabilities while retaining canonical snapshot
  and Yjs authority without caching candidates, visible options, completion
  kind, or completion-local loading state.
- **Source citation action:** One bounded light-DOM control derives the citation
  context at the current source caret, owns action availability, and emits the
  resolved citation keys and locator. The enclosing context-resource presenter
  resolves one key against the canonical project, chooses a unique linked PDF
  and locator page or publication context, and owns grouped and missing-citation
  notices. The workspace coordinator retains canonical snapshot authority and
  context navigation effects.
- **Offline authoring:** A service worker retains the allowlisted authoring
  shell and previously authorized canonical editor navigation. IndexedDB
  stores the current Yjs document, last acknowledged server vector, and last
  authorized workspace snapshot per identity and project. Existing Markdown
  files remain editable offline; restart derives one pending Yjs delta and
  sends it only after the ordinary server-led `sync` boundary. The offline
  persistence authority validates the snapshot and workspace identity, decodes
  the server vector, applies the Yjs update, reprojects anchors, and evicts a
  corrupt record before returning restoration state. One inferred Valibot
  schema validates the persisted envelope, exact schema version, ArrayBuffer
  fields, and 16 MiB bounds; identity and workspace matching remain explicit
  store policy. One typed offline session binds the store, document, canonical
  snapshot and server-vector sources, availability guard, and save outcomes. It
  owns Yjs encoding, guarded debounced scheduling and flush, restoration
  delegation, project-copy clearing, and coordinated IndexedDB and shell-cache
  cleanup. The project-file owner consumes the typed restoration result and
  sequences collaboration recovery plus restored revision, catalog, project,
  Context, connection, and Preview projection through its bound lifecycle
  capabilities. It also owns workspace opening across restoration, catalog
  refresh, and canonical project refresh. Source and bibliography editing stay
  locked until connection-state projection establishes editability. First use requires network data,
  revoked access clears offline state, and other network failures retain a
  restored project in explicit offline mode.
  The workspace-catalog owner derives the single authorized offline project row
  from restored snapshot identity, title, and save time. The connection-status
  owner combines restored collaboration/editability projection with pending-
  versus-saved wording. The coordinator supplies the capabilities but does not
  reconstruct the restoration sequence.
- **Offline shell updates:** Browser builds derive the Kirjolab Cache Storage
  namespace from emitted shell content. Workspace and Library startup both
  check an existing registration for an update without adding Library
  navigation to the offline allowlist. Activation removes old shell
  generations, persists an open offline workspace when the user accepts a
  persistent update notice, and reloads the controlled page once. Ordinary
  transient notices may briefly replace the update notice, which returns until
  the user refreshes. The application-version owner performs registration,
  caching, update refresh sequencing, ready projection, and fail-open handling;
  the coordinator supplies only project persistence and the pinned notice.
- **Application notices:** One bounded light-DOM component owns transient and
  persistent message rendering, replacement timers, one-shot action
  availability and callback lifecycle, pinned fallback restoration, modal
  reparenting, and popover visibility. The workspace coordinator supplies
  authorized action effects and retains deferred-deletion authority, offline
  persistence, and notification policy without caching notice state.
- **Application element registry:** One typed browser-shell boundary resolves
  every required server-rendered and custom element, validates its constructor,
  and exposes an inferred registry shape. The workspace coordinator must not
  duplicate that registry as a manually maintained interface.
- **Collaborator selections:** A client may send only an exact-key, bounded
  `protocol: 1` selection message for the current file and revision. The room
  supplies its socket identity, validates the range, broadcasts it only to
  peers, and never persists it. Edit-link holders join this presence exchange
  without receiving or sending binary Yjs state. Disconnect emits a
  server-owned clear control and excludes the closing socket from the updated
  collaborator count and broadcast.
- **Collaborator selection presentation:** One bounded light-DOM component
  stores and replaces each collaborator's latest remote selection, removes it
  on departure, clears it on disconnect, prunes stale revisions, filters it to
  the current file, renders caret or range copy with an accessible source
  excerpt, and supplies those same ranges to the editor overlay. The workspace
  coordinator retains the local-author range, collaboration transport, revision
  authority, and highlight placement; the component requests that placement
  through a typed callback whenever its remote selection collection changes.
- **Revision boundary:** Causally new Yjs state materializes Yjs, Markdown, and
  BibTeX together and advances the revision once. Duplicate or replayed updates
  receive an `ack` at the current revision without persistence, rebroadcast, or
  a revision increase. When bibliography text changes, every complete canonical
  entry is reconciled into publication resources in the same transaction.
- **Logical history:** A separate monotonic history sequence captures complete
  project state for manuscript and resource mutations without changing the
  source revision used to validate selections. Immutable milestone names point
  to one history revision. Restore creates a new source and history head and
  sends a terminal server-owned reset control so every connected browser
  clears its offline state, completes a normal socket close handshake, reloads,
  and fetches resources from the restored coordination state without a
  redundant follow-up socket message or abrupt transport loss.
- **Resource metadata:** The document Durable Object stores project-pinned
  bibliographic and explicitly shared research snapshots, passage links, and
  model candidates alongside the project coordination atom. The owner-scoped
  reference library stores private PDF artifacts, annotations, notes, tags, and
  reading state. No metadata or filename heuristic creates an association. Its
  server-owned `resources` control invalidates a coalesced REST metadata refresh
  without replacing editor state.
- **Reference library:** A separate owner-keyed Durable Object is authoritative
  for stable bibliographic records and per-field provenance. BibTeX imports and
  legacy workspace data reconcile into it; project-local aliases derive
  bibliography snapshots without exposing private notes, tags, PDFs,
  highlights, or reading state. Additional research enters a project only by
  explicit rights-checked snapshot sharing and forward-only revocation.
  A bounded light-DOM filter panel owns query and facet state, dynamic reference
  types, filtering and deterministic sorting from the canonical Library
  snapshot, visible-versus-total counts, reset behavior, and its typed change
  intent. It derives current project-linked reference ids from canonical
  project-reference inputs. A composed Library workspace synchronizes the
  filter, result list, citation network, and unidentified-PDF queue and owns
  filter-driven rerendering and focused-reference reveal. The coordinator
  retains Library loading, cross-feature navigation, mutations, refresh, and
  notifications.
- **Private PDF reading:** Owner-library PDF artifacts may reuse the context
  PDF renderer through distinct private `library-pdf:` tabs. Their bytes and tab
  authorization remain owner-private. Selection creates only an ephemeral
  draft; explicit save may create a library-owned page-and-quote highlight,
  while navigation never creates project evidence or sharing state.
  A pure Library route adapter reads root, addressed-reference, encoded
  artifact, and bounded page locations and writes canonical private-PDF URLs;
  the composed Library workspace owns current-location parsing and the
  browser-history restoration subscription with teardown plus root, addressed-
  reference, private-PDF, and active-page history mutation. It also owns its
  bound project refresh sequence, reads the live snapshot directly from its
  project-file owner, and sequences linked-PDF loading, authorization
  reconciliation, project and context presentation, settlement, and canonical
  route replacement. The coordinator retains cross-feature navigation and
  notices.
  One pure active-load projection resolves project evidence, private Library,
  or shared-reference input and its authorized URL from the active typed tab
  and canonical snapshots. The coordinator retains viewer updates, form
  selection, routing, and failure handling.
  A dedicated Select tool makes saved highlights, freehand lines, and note pins
  directly actionable on the page. Highlight comments, line color/width, and
  note text remain editable; selected notes may be dragged to a new normalized
  page position. A pending note renders its anchor while its body is composed.
  On touch hardware, fingers pan and pinch-zoom even while Draw is active;
  Apple Pencil and mouse pointers create ink. The bounded markup layer owns
  active-tool and drawing attributes plus clamped pointer normalization against
  its rendered page bounds, coalesced-sample accumulation and near-duplicate
  rejection, pixel-space shape recognition, and adjustment back to normalized
  page points. The layer schedules and cancels delayed recognition, updates the
  reactive live draft, and emits a typed recognition intent for inspector
  messaging. Subsequent pointer movement is adjusted inside the layer without
  exposing pixel-space shape state.
  Note-pin and drawing-stroke hit-testing is likewise component-owned; the
  layer combines those targets with page geometry and active tool state into
  typed note placement, drawing start, touch rejection, and selection actions.
  It performs local default suppression, pointer capture, shape cancellation,
  and active-drawing presentation before returning an action. During a freehand
  gesture, the layer retains the active pointer and normalized points, suppresses
  native scrolling, expands coalesced samples, updates the live draft, schedules
  recognition, and applies snapped-shape adjustments. A matching pointer release
  returns the final points for coordinator-owned persistence. Cancellation or an
  inactive layer transition clears the draft and recognized shape. The
  annotation state machine does not duplicate drawing gesture state. For a
  selected note, the layer owns drag start coordinates, the five-pixel movement
  threshold, native-default suppression, normalized preview geometry, and the
  transient pin position. A matching release returns note identity, movement
  state, and final normalized position for coordinator-owned click handling or
  persistence. The annotation state machine does not duplicate note-drag state.
  Prospective note placement stays within the layer through its eight-pixel
  stationary-press threshold; only a stationary release sends the normalized
  start point into the annotation composition workflow.
  The annotation toolbar owns the guidance associated with each tool, while
  the coordinator decides when that guidance is presented in the inspector.
- **Web sources:** Public HTTP(S) pages are captured through bounded,
  redirect-controlled Worker retrieval into immutable owner-private raw and
  readable R2 objects. Project citations pin one exact access timestamp and
  content hash; normal reference refresh cannot move the pin.
- **Citation assertions:** Source-to-source relationships live in the private
  shared library as directional provenance-bearing assertions, not manuscript
  `cites` edges. The bounded derived network can focus on current-project
  references, retains conflicts, and expands Crossref references only after an
  explicit owner action. One composed light-DOM workspace owns Reference trail
  visibility, current-project filter state and ARIA presentation, close
  behavior, and synchronization with the nested network panel. The application
  coordinator retains authorized requests, response validation, review
  prompts, mutations, refreshes, and notification policy.
- **Knowledge navigation:** Bounded workspace search and typed connection
  representations expose documents, sections, publications, PDFs, and
  annotations as navigable resources in the authoring Map without making an
  index or visual layout authoritative.
  A bounded light-DOM connection panel owns edge counts, relationship cards,
  empty state, and typed resource-selection intents; the application
  coordinator retains graph derivation and navigation authority.
- **Claims:** Human-authored propositions connect annotations to manuscript
  passages through explicit `supports`, `contradicts`, `extends`, and `used-in`
  relationships. The bounded claim list projects claims, annotations, evidence
  links, and passage links directly from the canonical workspace snapshot plus
  browser-local evidence selection; separate typed workspace and assistant
  bindings retain selection mutation, navigation, refresh, and notification
  policy outside the panel.
- **Manuscript anchors:** New annotation, claim passage links, and comments verify the
  current source revision and exact requested range, then store version 1 Yjs
  relative positions (start association `0`, end association `-1`), stable file
  identity, exact
  quote/context, original offsets, and anchored revision. Public links expose
  their immutable selector and a derived `resolved` or `stale` resolution
  rather than top-level current offsets. Version 1 resolves only through its
  relative positions. A one-time migration derives endpoints for still-valid
  offset rows; unconvertible legacy rows retain null endpoints and remain
  explicitly stale under the version 1 selector contract. The bounded Claims
  and Project evidence panels own live resolved, changed, and unavailable
  action presentation when the composed manuscript changes. One pure snapshot
  projection hydrates passage links, claim links, comments, and revision-model
  targets for synchronized refresh, offline restore, and live preview.
- **Manuscript comments:** Comments are attributed to stable workspace-person
  ids and stored outside Markdown with a version 1 manuscript anchor, body,
  lifecycle status, and timestamps. Creation and resolution are explicit
  resource mutations retained in project history; neither changes authored
  source. One typed workspace binding supplies a read-only authoring snapshot;
  the comment panel blocks create and re-anchor actions while collaboration is
  unstable or no manuscript passage is selected, stamps accepted passages with
  the supplied source revision, and owns action-specific feedback. Yjs selection
  resolution, revision and collaboration authority, canonical refresh, and
  notification presentation remain outside the panel. Its enclosing resource
  presenter configures the panel, resolves incoming anchors, rejects stale
  targets, selects exact-versus-changed notices, and routes file-qualified
  selection effects through the same application boundary used by claims,
  project evidence, and publications.
- **Blob storage:** The `PAPERS` R2 binding stores immutable private PDF bytes
  and bounded web representations under owner-library keys. Responses stream
  only through an authorized private-library route or active explicit project
  share; captured markup is attachment-only and never rendered.
- **Evidence capture:** PDF.js renders one selectable page. Text selection
  creates exact quote/context selectors plus normalized page rectangles before
  the annotation is saved.
- **Local models:** Before awaiting a user-configured OpenAI-compatible local
  endpoint, the browser captures an exact selected passage, bounded instruction,
  revision, and typed versioned annotation/claim references. Only that passage
  and evidence enter the provider-neutral browser adapter. The document room
  verifies the captured base and persists a Yjs-relative target, immutable
  evidence snapshots, provider/model identity, and replacement Markdown.
- **Mutation boundary:** Candidate creation fails if its immutable base revision
  or evidence version is already stale. A current pending candidate can be
  inspected, rejected without changing source, or applied only while its exact
  anchored target and revision remain current. Apply computes a local minimal
  splice inside the target range, atomically persists canonical source and
  accepted status, and cannot replace unrelated manuscript text.
- **Exports:** Dedicated endpoints return PDF, LaTeX, Markdown, source-bundle,
  BibTeX, and statistics artifacts with download metadata. One bounded Lit
  host progressively enhances the server-rendered export dialog, owns modal
  lifecycle, its header and editor-toolbar open triggers, the live word-count
  badge, and its close action, and synchronizes the nested live publication
  statistics. The application coordinator retains word-count derivation.

### API Contracts

- `GET /api/workspaces` returns the current owner's workspace summaries.
- `GET /api/library` returns only the verified owner's private reference
  library; its import, PDF, metadata, tag, note, highlight, reading, archive,
  and deletion routes retain that owner boundary.
- `POST /api/library/web-sources` captures one immutable web version; snapshot
  metadata, raw/readable attachment, source history, and comparison routes stay
  owner-private.
- `POST /api/workspaces` creates and registers an isolated workspace.
- `GET /api/workspaces/demo` returns the complete workspace representation.
- `GET /api/workspaces/demo/search?q={query}` searches the authorized workspace.
- `GET /api/workspaces/demo/graph` returns its derived typed-resource projection.
- `GET /api/workspaces/demo/socket` upgrades to protocol version one of the
  collaborative Yjs channel. The server sends binary state before
  `{"type":"sync","protocol":1,"revision":n}` and durably handles each client
  binary update before returning `{"type":"ack","revision":n}`.
- `POST /api/workspaces/demo/pdfs` streams one PDF of at most 25 MB to R2.
- `POST /api/workspaces/demo/files` creates a supporting Markdown file.
- `PATCH /api/workspaces/demo/files/{fileId}` renames it and atomically updates
  inbound include paths.
- `DELETE /api/workspaces/demo/files/{fileId}` deletes an unreferenced
  supporting file; the root `main.md` cannot be renamed or deleted.
- `GET /api/workspaces/demo/pdfs/{id}` streams an imported PDF, forwarding HTTP
  byte ranges and object preconditions to R2 for bounded reader requests and
  ETag validation.
- `POST /api/workspaces/demo/annotations` creates a selector-backed annotation.
- `POST /api/workspaces/demo/annotation-links` atomically creates one
  selector-backed annotation and its current manuscript passage link.
- `POST /api/workspaces/demo/bibliography/import` rejects input without a valid
  BibTeX entry before crossing the library Durable Object boundary, then
  minimally splices merged entries into the owner library and links its stable
  records with local aliases.
- `POST /api/workspaces/demo/references` links one owner-library record through
  a project-local alias and bibliographic snapshot.
- `POST /api/workspaces/demo/references/{id}/web-snapshot` explicitly repins a
  web citation to one immutable capture and derived access date.
- `POST /api/workspaces/demo/research-shares` explicitly pins one private
  research snapshot; its delete route revokes future access.
- `POST /api/workspaces/demo/publications/{id}/enrich` explicitly enriches a
  DOI-backed publication through Crossref, minimally splicing and atomically
  committing accepted canonical and `crossref`-sourced values.
- `POST /api/workspaces/demo/publication-intake/preview` resolves a known PDF
  and DOI to a bounded, non-mutating metadata review.
- `POST /api/workspaces/demo/publication-intake/accept` verifies that review
  and atomically creates or reuses its publication and PDF association.
- `POST /api/workspaces/demo/publication-pdf-links` explicitly associates a
  known publication and PDF in the same workspace.
- `DELETE /api/workspaces/demo/publication-pdf-links/{id}` removes only that
  association.
- `POST /api/workspaces/demo/links` accepts an annotation id, source revision,
  requested offsets, and exact current text and returns a selector-backed
  annotation-passage link.
- `POST /api/workspaces/demo/claims` creates an evidence-backed claim.
- `PUT /api/workspaces/demo/claims/{id}` replaces its proposition, note, and
  evidence set.
- `DELETE /api/workspaces/demo/claims/{id}` removes the claim and its links.
- `POST /api/workspaces/demo/claim-links` accepts a claim id, source revision,
  requested offsets, and exact current text and returns a selector-backed
  claim-passage link.
- `POST /api/workspaces/demo/comments` accepts a current non-empty passage and
  bounded body, attributes it to the authenticated workspace person, and
  returns the anchored comment.
- `POST /api/workspaces/demo/comments/{id}/resolve` preserves the comment while
  recording its resolved state in project history.
- `POST /api/workspaces/demo/candidates` verifies and persists a targeted
  `revise-selection-v1` candidate with typed evidence snapshots.
- `POST /api/workspaces/demo/candidates/{id}/apply` applies a current pending
  candidate.
- `POST /api/workspaces/demo/candidates/{id}/reject` rejects a pending
  candidate without changing source.
- `GET /api/workspaces/demo/history` lists retained logical revisions and
  immutable milestones; `GET /history/{revision}` returns a read-only snapshot.
- `GET /api/workspaces/demo/history/compare?from={revision}&to={revision}`
  returns rename-aware file, composed manuscript, and binary identity changes.
- `POST /api/workspaces/demo/history/{revision}/milestones` immutably names an
  exact revision. Owner-only `restore` creates a new head and owner-only `seed`
  creates a new isolated workspace from the retained state.
- `GET /api/workspaces/{id}/export/*` exposes the source-mapped publication
  representations defined in `specs/export-pipeline/spec.md`, including
  composed Markdown, cited BibTeX, LaTeX ZIP, bounded PDF, source ZIP,
  diagnostics, intermediate data, and publication statistics.

### Anti-Patterns

- Do not make Yjs state, rendered HTML, or a candidate the only usable document
  representation.
- Do not send browser Yjs state speculatively when a socket opens or treat a
  sent frame as durable before its acknowledgement.
- Do not infer collaboration readiness from independent booleans. Editing and
  model operations derive readiness from the connection actor, and only the
  server-led `sync` event may enter its live state.
- Do not cache API responses, WebSockets, exports, model operations, library
  state, or PDF bytes as part of offline authoring.
- Do not initialize a workspace, restore offline manuscript state, or connect
  collaboration while rendering the `/` dashboard.
- Do not generate new `/workspaces/{id}` browser links or treat that legacy
  redirect as a second navigation-state authority.
- Do not treat the offline browser copy as project history, a portable backup,
  or authorization for server-side mutations.
- Do not let a REST metadata refresh assign source, bibliography, or displayed
  revision after Yjs synchronization.
- Do not move the source concurrency revision for resource-only history events,
  destructively move history backward, retarget a milestone, or merge a
  restored historical Yjs state into still-connected newer browser documents.
- Do not proxy arbitrary local-model endpoints through the hosted Worker.
- Do not capture a model candidate's source revision after awaiting its provider
  or accept stale candidate creation, stale candidate application, or stale
  passage ranges.
- Do not expose a derived current manuscript range as durable top-level link
  offsets or navigate an unresolved anchor.
- Do not use original offsets, exact quote/context, fuzzy search, or a nearest
  or first match as runtime navigation fallback when relative positions fail.
- Do not derive relative endpoints for a legacy offset row unless its range and
  exact excerpt still match current source during the one-time migration.
- Do not represent a selected-passage operation as a whole-document candidate or
  apply it outside its verified target range.
- Do not treat derived project BibTeX or citation aliases as shared-library
  authority, and do not delete owner research when a project link disappears.
- Do not infer a publication/PDF association from citation key, DOI, title,
  author, filename, or similarity, and do not delete either endpoint when an
  explicit link is removed.
- Do not add ad hoc schema checks or data backfills outside the ordered
  migration ledger, and never edit an applied migration definition.
- Do not treat a Node storage substitute or browser-only assertion as sufficient
  evidence for Durable Object SQLite transactions, migrations, RPC, or recovery
  after eviction.
- Do not buffer PDF bodies in Worker memory.
- Do not fetch private/local web destinations, auto-follow redirects, buffer an
  unbounded page, render captured markup, or silently advance a project pin.
- Do not write annotation data into imported PDFs.
- Do not deploy with local authentication or without a protected Cloudflare
  Access hostname and matching JWT configuration.
- Do not claim CSL-complete bibliography formatting or move live Markdown
  preview to a request-per-edit Worker path without measured justification.

## Contract

### Definition of Done

- [x] Two browser sessions converge on one collaborative Markdown document.
- [x] Current collaborator carets and selections appear as colored inline
      presence within the editor without entering canonical source or durable
      project state; equivalent location text remains available to assistive
      technology.
- [x] Collaborator carets align with the adjacent mirrored glyph box instead of
      extending into the leading between visual editor rows.
- [x] Collaborators can create, navigate, and resolve attributed range-anchored
      comments without mutating Markdown.
- [x] Comments use a dedicated left-rail mode instead of an editor-bottom
      drawer or modal.
- [x] The derived project bibliography stays internal to collaboration and
      explicit import/export boundaries instead of appearing in editor rails.
- [x] Crowded left-rail navigation remains identifiable through labelled icons,
      hover titles, selected state, and the visible comment count.
- [x] Activating a left-rail tab updates both its selected state and the
      visibility of the panel identified by that tab's `aria-controls` value;
      tab and manuscript-map range navigation use typed component bindings.
- [x] Empty projects do not show legacy Papers or Highlights controls; existing
      project-owned PDFs and annotations appear in one compact Project evidence
      collection with highlights nested beneath their paper.
- [x] Server state establishes synchronization before the browser sends queued
      updates, and each client update receives a durable acknowledgement.
- [x] Reconnect replays only unacknowledged updates; an already integrated
      replay is acknowledged without advancing the revision.
- [x] A previously opened project reloads offline, retains edits across another
      offline reload, and converges those edits after reconnection.
- [x] Hosted logout clears Kirjolab's offline workspace database and shell
      caches before leaving the application; the offline session owns that
      browser lifecycle together with page-exit persistence and teardown.
- [x] Yjs owns live editor text after synchronization while coalesced resource
      refreshes update only non-editor workspace state.
- [x] Markdown changes update a semantic preview and diagnostics immediately.
- [x] Permanent Preview, Library, and Writing assistant tabs plus resource-keyed
      publication, PDF, and candidate tabs share one right research-context
      pane beside manuscript authoring.
- [x] Tab, pin, page, focus, and reading-position state remains local while
      narrow layouts switch explicitly between Authoring and Context.
- [x] Private PDF annotation controls remain on one row and expose a dedicated
      Select tool for directly editing highlights, lines, and notes.
- [x] A new note anchor stays visible while its body is written, selected notes
      can be moved, and touch navigation cannot accidentally create ink.
- [x] The split workspace activates only when all minimum-width tracks fit;
      compact desktop windows remain free of horizontal page overflow.
- [x] The desktop project rail resizes by pointer or keyboard, resets to its
      default width, and preserves primary-pane minimum widths.
- [x] The desktop project rail collapses and restores without losing its
      preferred expanded width or changing compact layouts.
- [x] Wider project rails reveal mode labels, and desktop separators visibly
      communicate their pointer and keyboard interactions.
- [x] Desktop Authoring fills the workspace content row without an empty footer
      track or native manuscript resize affordance; long pane content scrolls
      locally without extending the outer document past the viewport.
- [x] Writing assistant remains a permanent, keyboard-accessible Context tab
      instead of extending the workspace below the fold.
- [x] Initial collaboration synchronization resolves the editor status from
      `Opening…` to `Saved` when no local update is pending.
- [x] Persistent toolbars group infrequent project and file mutations without
      hiding them behind unexplained glyphs.
- [x] The editor toolbar omits duplicate file navigation and keeps its visible
      controls in one contained row at a 1197 px split-workspace width.
- [x] Infrequent History, revision, and file actions remain labelled and
      keyboard-accessible from the editor's More menu.
- [x] The More menu remains fully visible inside the clipped authoring column
      instead of extending beneath the project rail.
- [x] Header Preferences opens and closes with pointer or keyboard, keeps
      personal appearance, Vim, and model settings together, and persists them
      locally across projects and refreshes.
- [x] Header Preferences exposes a copyable application version matching the
      active build-derived offline shell generation.
- [x] An activated offline-shell update keeps a Refresh now notice available
      until the user accepts it, then persists open offline work before reload.
- [x] Writing assistant opens the shared model preferences without duplicating
      connection fields inside its task workflow.
- [x] Insert-menu file paths truncate safely beside compact syntax help instead
      of overlapping at constrained authoring widths.
- [x] Permanent helper and empty-state copy stays concise, action-oriented, and
      free of architecture terminology that does not change the user's choice.
- [x] Project creation, navigation, access, search, and errors use one
      consistent user-facing noun.
- [x] The demo and UUID projects open at canonical `/editor` routes, legacy
      workspace links redirect without losing valid query state, and the root
      dashboard does not initialize collaboration.
- [x] Read-only and writable bearer links open one recognizable responsive
      editor shell while retaining a narrow capability-scoped client and
      distinct server APIs.
- [x] Normal-sized secondary text maintains at least 4.5:1 contrast across the
      canvas, paper, and editor surfaces.
- [x] The complete workspace follows the system light/dark scheme by default
      and restores an explicit browser-local appearance override when chosen.
- [x] Contextual toolbar actions stay out of the persistent chrome until the
      active citation or resource makes them usable.
- [x] Action popovers expose ordinary button-list keyboard semantics, close on
      Escape, and return focus to their labelled summary control. One bounded
      controller owns document-level outside-action dismissal, settings-menu
      containment, Escape ordering, focus restoration, and listener teardown.
- [x] Citation and reference targets are validated against BibTeX and document
      targets.
- [x] Citation keys offer keyboard-accessible project suggestions at the caret,
      with an opt-in personal preference for explicit private-library add-and-cite
      suggestions.
- [x] Include paths offer keyboard-accessible project-file suggestions using
      references relative to the active source file.
- [x] Preview citations open publication context and explicit citation
      insertion uses a remembered collaborative authoring position. The
      context-resource presenter resolves the active publication or sole-linked
      project PDF to the citation key and optional page locator before the
      coordinator performs Yjs syntax insertion.
- [x] Legacy workspace BibTeX and explicit imports reconcile into stable
      owner-library identities with per-field provenance.
- [x] Project-local aliases derive reproducible bibliography snapshots without
      exposing private library research.
- [x] Removing a project reference leaves its owner-library record intact.
- [x] Source citation assertions retain provenance and review while an
      accessible shared network exposes conflicts and current-project focus.
- [x] Search results and typed connections navigate across authored and evidence
      resources.
- [x] Annotations can be synthesized into editable claims and linked onward to
      exact manuscript passages.
- [x] A PDF can be imported, rendered with selectable text, streamed back, and
      annotated without mutation.
- [x] Publications and PDFs can be linked explicitly many-to-many and navigated
      through `has-artifact` without changing either endpoint.
- [x] An unlinked PDF can be identified through reviewed DOI metadata and
      atomically added and connected without citing the manuscript.
- [x] An annotation can be linked to the exact selected manuscript range.
- [x] A visible PDF selection and manuscript selection can create their
      annotation and passage link in one atomic mutation.
- [x] New annotation and claim passage links follow manuscript edits through
      versioned Yjs relative positions while preserving exact quote/context
      provenance.
- [x] Link representations distinguish immutable selectors from current
      resolution and expose stale anchors without silent relocation.
- [x] Synchronized, offline, and live-preview snapshots resolve every
      manuscript-backed resource through one shared projection.
- [x] A one-time migration adds valid relative endpoints to offset-only links
      and leaves unconvertible legacy links explicitly stale with null
      endpoints.
- [x] Ordered named migration ledgers apply each Durable Object schema exactly
      once; the document ledger also records anchor backfill and initial
      bibliography projection.
- [x] Workers-runtime tests exercise migration, rollback, projection, and
      persisted reconstruction against isolated real Durable Object storage.
- [x] A local model can return a grounded candidate with inspectable provenance.
- [x] Candidate creation and application are explicit and reject stale base
      revisions captured before model execution.
- [x] Applying a selection candidate changes only its verified target through a
      local minimal `Y.Text` splice and preserves surrounding anchors.
- [x] One source-mapped Markdown, BibTeX, LaTeX, PDF, statistics, diagnostics,
      and archive export boundary without private library state.
- [x] Unit coverage and browser tests exercise the critical workflow.

### Regression Guardrails

- Light and dark appearance must continue to derive from the shared `app-*`
  semantic tokens rather than component-specific parallel palettes.
- Appearance preference must remain browser-local and must not enter workspace,
  Yjs, Durable Object, or collaboration state.
- The bearer-link editor shell must not initialize identity-authorized project
  APIs, offline state, private research, history, comments, administration,
  general exports, or writable Yjs collaboration.

- Binary Yjs state must arrive before the versioned `sync` control on every
  connection, and the browser must not send queued state before that boundary.
- Canonical source and bibliography must be materialized after every causally
  new Yjs update.
- A client update must remain queued until its `ack`; replaying already
  integrated state must return the current revision without persistence,
  rebroadcast, or revision advancement.
- Offline records must be keyed by authenticated identity and workspace,
  validate their snapshot and bounded binary state before use, and never be
  written before the first authoritative server synchronization.
- Exercise service-worker startup and fallback in the browser suite; keep its
  separately testable registration and cache-policy helpers in the unit and
  mutation suites.
- A reset must clear the project browser copy before reload so restored history
  cannot merge with cached newer CRDT state.
- After synchronization, `Y.Text` and server controls must remain the only
  browser writers for editor text and displayed revision respectively.
- Resource invalidation refreshes must be coalesced and must never write editor
  text or collaboration revision.
- Selection metadata must be bounded, current-revision, file-valid, and
  server-attributed. It must never enter SQLite or project history.
- Comment creation must require the current source revision and exact selected
  text. Comment anchors and lifecycle changes must remain in logical history
  without moving the manuscript revision.
- Document updates must be scoped to one Durable Object per workspace/document
  coordination atom.
- Every SQLite-backed Durable Object must use strictly increasing, named,
  append-only migrations recorded in `_kirjolab_migrations`.
- A pending migration callback and its ledger insert must share one synchronous
  transaction; applied version/name mismatches must fail before new work.
- Initial canonical bibliography projection and manuscript-anchor backfill must
  remain recorded data migrations.
- Migration ordering, ledger mismatch, transactional rollback, representative
  historical upgrades, and reconstruction after eviction must be verified in
  `workerd` against real per-test Durable Object SQLite storage.
- `cloudflare:test` may seed and inspect private Durable Object state for these
  platform contracts; Node substitutes must not be their only verification.
- Revision-conflicted edit-link writes, guarded reference unlinking, invalid
  claim evidence, and stale model-candidate creation must cross the
  `DocumentRoom` RPC boundary as typed negative results and keep their existing
  HTTP `4xx` responses without emitting uncaught Durable Object exceptions.
- Collaboration WebSocket sends may suppress a closed connection or the
  runtime's confirmed disconnect error. Unexpected send failures must still
  escape for error telemetry and test failure.
- `/pdf.worker.js` must load as a real same-origin module worker from the
  authoring page without a blocked request or fake-worker fallback.
- PDF uploads must require `application/pdf`, a known positive content length,
  and the 25 MB size limit.
- Annotation creation must require a known PDF, positive page number, exact
  quote, textual context fields, and valid bounded geometry when present.
- Creating a passage link must require the current source revision and exact
  text at a valid non-empty supplied range.
- New selectors must store version 1 relative endpoints with start association
  `0` and end association `-1`, exact/prefix/suffix text, original offsets, and
  anchored revision.
- Strict Valibot selector and resolution schemas must enforce exact keys,
  encoded-position syntax and bounds, ordered safe-integer ranges, immutable
  text lengths, and the `resolved`/`stale` result variants.
- Version 1 anchor resolution must use both stored relative positions and return
  `stale` if they are unavailable, target the wrong source type, or produce an
  invalid or collapsed range.
- Exact text, prefix, suffix, and original offsets must remain immutable
  provenance and must never relocate a link at runtime.
- Current offsets must appear only in a `resolved` result; public links must not
  expose mutable current offsets at their top level.
- Offset-only persisted rows must remain readable as version 1 selectors with
  null relative endpoints and stale resolution unless a one-time verified
  migration can derive both endpoints.
- Model source, selection, revision, and evidence must be captured together
  before provider I/O; creating or applying its candidate must fail after the
  document revision changes.
- Candidate application must compute the longest common prefix and
  non-overlapping suffix inside the verified target, deleting and inserting
  only its differing middle in one `Y.Text` transaction.
- Imported entries must reconcile stable library UUIDs by normalized DOI or a
  bounded reviewed bibliographic fingerprint, never by project alias alone.
- Absence from current project links must never delete a library record.
- PDF association must require reviewed identification against a complete
  source record; explicit artifact sharing must additionally pass rights
  checks.
- Derived project bibliography and alias rewrites must commit with their
  project revision and retain the linked bibliographic snapshot.
- Saving canonical metadata from an active project must immediately refresh
  every linked snapshot in that project, its derived BibTeX, and connected
  collaborators without requiring a reload.
- Browser code must remain external to Worker-rendered HTML and pass both strict
  worker and client TypeScript configurations.

### Verification

- Browser-shell tooling tests cover deterministic content fingerprints, and
  browser tests resolve the emitted runtime URLs from the built application,
  verify immutable responses, and verify the matching service-worker cache
  generation.
- `src/domain/**/*.test.ts` covers semantic rendering, validation, guards, and
  model-operation helpers.
- `src/worker.test.ts` covers routing, generated assets, and missing-binding
  behavior.
- `src/**/*.workers.test.ts`, selected by `vitest.workers.config.mts`, covers
  real Durable Object SQLite migration, transaction, projection, and eviction
  behavior with isolated per-test storage.
- `src/worker.e2e.ts` exercises real local Durable Object, WebSocket, and R2
  behavior, including the full evidence-to-prose workflow.
- `npm run test:workers` is part of the fast gate; `npm run quality:gate` and
  `npm run ci:local` are the readiness gates.

### Scenarios

**Scenario: Collaborative source becomes a preview**

- Given: the demo workspace is open at `/editor/demo` in a browser
- When: server state and the versioned synchronization control arrive, then a
  writer changes the Markdown source
- Then: the update stays queued until its durable acknowledgement,
  collaborators converge, the Durable Object materializes Markdown, and the
  semantic preview updates

**Scenario: A lost acknowledgement is recovered**

- Given: the document room persisted a browser update but its acknowledgement
  was lost with the connection
- When: the browser reconnects, synchronizes from server state, and replays the
  unacknowledged update
- Then: the document room acknowledges the replay at the current revision
  without persisting, rebroadcasting, or incrementing it again

**Scenario: Resource refresh preserves collaborative text**

- Given: a synchronized editor has a resource refresh in flight
- When: a collaborator changes the manuscript and the server invalidates
  resource metadata
- Then: refresh requests are coalesced, non-editor resources update, and the
  REST response cannot replace Yjs-owned source or collaboration revision

**Scenario: Researcher writes through a poor connection**

- Given: the researcher has previously opened and synchronized a project on
  this browser
- When: connectivity disappears and the project is reloaded
- Then: the cached authoring shell opens the existing Markdown files, edits are
  stored locally, and the editor reports that they are saved offline
- And: after connectivity returns, only the state absent from the last
  acknowledged server vector is queued after `sync` and durably acknowledged

**Scenario: Offline support has no authorized local copy**

- Given: a project has never completed synchronization in this browser for the
  current identity
- When: the researcher opens it without a network
- Then: Kirjolab explains that one online visit is required and does not invent
  an empty editable project

**Scenario: Researcher logs out of hosted Kirjolab**

- Given: this browser contains offline project copies
- When: the researcher activates the Cloudflare Access logout control
- Then: Kirjolab clears its IndexedDB workspace records and service-worker
  caches before following the logout URL

**Scenario: Evidence becomes linked working memory**

- Given: a PDF is imported
- When: the researcher records a page, exact quote, surrounding context, and a
  note through an in-view text selection, then selects manuscript text
- Then: Kirjolab stores an external annotation and a versioned manuscript
  selector without changing the PDF

**Scenario: A manuscript link follows collaborative edits**

- Given: a version 1 passage link resolves through its Yjs relative positions
- When: collaborators insert or delete text around the linked passage
- Then: the link resolves to the current non-collapsed relative range and
  reports whether its text still exactly matches the captured quote

**Scenario: A passage cannot be resolved safely**

- Given: either relative position is unavailable or the resolved range is
  invalid or collapsed
- When: the workspace represents the passage link
- Then: the resolution is `stale`, and Kirjolab does not use offsets, quotes,
  context, or nearest matching to relocate it

**Scenario: Legacy links are migrated conservatively**

- Given: an existing row stores only offsets and an exact excerpt
- When: the one-time anchor migration checks it against current source
- Then: a still-valid row receives relative positions, while an unconvertible
  row exposes null endpoints and an explicitly stale version 1 selector

**Scenario: Local model proposes grounded prose**

- Given: one manuscript passage and one or more annotations or claims are
  explicitly selected
- When: Kirjolab captures their immutable base and the local model returns a
  replacement passage
- Then: Kirjolab stores a pending candidate only if the captured revision and
  typed evidence versions are still current, with immutable evidence snapshots,
  provider/model identity, and a targeted replacement while leaving canonical
  Markdown unchanged

**Scenario: Collaboration invalidates a model result in flight**

- Given: a local model request is running against a captured source revision
- When: a collaborator advances the document before the provider responds
- Then: candidate creation rejects the stale base instead of labeling old output
  with the new revision

**Scenario: Researcher applies a current candidate**

- Given: a pending candidate targets the current document revision
- When: the researcher inspects and applies it
- Then: only the verified target range is minimally spliced, the candidate is
  accepted, anchors in unchanged surrounding prose remain resolved, and all
  collaborators receive the update

**Scenario: Imported bibliography becomes shared research memory**

- Given: an owner imports supported BibTeX
- When: records reconcile into the private shared library
- Then: each stable source retains per-field provenance and its imported key is
  only a suggested project alias

**Scenario: Rejected bibliography file import remains recoverable**

- Given: an owner chooses a BibTeX reference file in the private Library with no
  valid entries
- When: the bounded import rejects the file
- Then: the server error replaces the importing state, the Library file control
  resets, and the researcher can choose another file without reloading

**Scenario: Removing a project reference keeps working memory**

- Given: a project link has a stable owner-library source
- When: the owner removes its citations and unlinks it from the project
- Then: derived project BibTeX changes while private library content remains
  available and no unrelated relationship is deleted

**Scenario: A pending schema migration fails**

- Given: a Durable Object has one unapplied named migration
- When: its migration callback fails during guarded initialization
- Then: neither its changes nor ledger row commit, and a later activation can
  retry the same immutable migration

**Scenario: Researcher exports portable work**

- Given: the manuscript and bibliography have been edited collaboratively
- When: the researcher requests both export endpoints
- Then: plain Markdown and BibTeX downloads are returned without Yjs or private
  runtime state
