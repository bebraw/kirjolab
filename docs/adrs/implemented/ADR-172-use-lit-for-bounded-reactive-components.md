# ADR-172: Use Lit for Bounded Reactive Components

**Status:** Implemented

**Date:** 2026-07-25

## Context

Kirjolab's server-rendered application shell keeps initial navigation and
content available without transferring ownership of the whole page to a client
framework. As browser features accumulated, `WorkspaceApp` also accumulated a
large element registry and imperative presentation updates alongside its
network and workflow coordination.

A component library can reduce that coordination burden over time, but a
whole-shell migration would duplicate application state, weaken server
rendering, and create a large regression surface. Immediate line-count savings
are also a poor measure for the first component because establishing a typed
component boundary has a fixed cost.

## Decision

Use pinned Lit for bounded reactive browser components whose local template,
presentation state, element references, and DOM events can leave
`WorkspaceApp`. Components emit typed intent or completion events; the existing
application coordinator retains cross-feature network workflows, canonical
project refresh, navigation, Yjs and XState actors, and persisted domain state.
A component may own a bounded request workflow when its complete lifecycle,
payload, validation, progress, and result serve only that component's local
interaction.

The adopted components own bounded presentation:

- The import panel owns connected and disconnected account presentation,
  reactive account actions, local field values, account/repository/branch
  discovery requests, validation, stale-request guards, option rendering, form
  submission, readiness, preview/status rendering, native dialog lifecycle, and
  typed Disconnect, Preview, Cancel, and Confirm intents.
- The workspace sync menu owns repository status, relationship tone, Pull and
  Push availability, its bounded read-only connection and status refresh
  lifecycle, interval, validation and stale-request guard, typed Check, Pull,
  Push, and Settings intents, and one typed state event for the settings mirror.
- The workspace sync review owns Pull and Publish requests and diff rendering,
  conflict choices, commit-message input, disconnect confirmation, response
  validation, readiness, progress, and one typed completed-mutation event.
- The new-project starting-point browser owns template and existing-project
  groups, the fetched template catalog and optimistic hidden-template state,
  the derived visible-template view, local selection and preview state, bounded
  preview rendering, and typed selection, project-load, and template-delete
  intents.
- The workspace sharing panel owns member and capability-link presentation,
  invitation input, clipboard interaction, native parent-dialog lifecycle, and
  typed invite, share-link, and notice intents.
- The workspace catalog panel owns project filtering, result and empty-state
  rendering, metadata labels, filter focus reset, and native parent-dialog
  lifecycle.
- The project history panel owns timeline, comparison controls, busy and error
  states, revision cards, inspectors, and typed revision-operation intents.
- The project history dialog composes the server-rendered modal and reactive
  history panel, owns modal lifecycle and busy presentation, consumes the panel
  close intent, and emits one typed dialog-close event.
- The project history trigger owns revision-badge presentation and emits one
  typed open intent. The application coordinator retains revision authority,
  history loading, and dialog policy.
- Reused writing-workflow panels own research-question and reviewer-response
  Markdown-to-item adaptation, counts, empty states, action labels, and typed
  open, download, and source-selection intents.
- The assistant result panel owns validated-table previews, clarity input,
  transient revision choices and their captured passage, source-revision,
  evidence, provider-continuation, or table-target context, reference-discovery
  cards, local save progress, and complete typed continuation, selection,
  insertion, and save intents.
- The project map panel owns provenance-lane rendering, measured SVG connector
  geometry, responsive relayout, focus and hover emphasis, and a typed resource
  selection intent.
- The project map workspace composes search, provenance-map, and typed-connection
  panels; owns resource and link totals, search-versus-overview presentation,
  mode visibility, focus entry, and one typed resource-selection stream; and
  exposes one graph-presentation boundary to the application coordinator.
- The candidate review panel owns before/after and provenance rendering,
  live collaboration and workflow decision availability, progress, local
  scroll state, and typed apply, reject, and evidence-navigation intents.
- The publication context panel owns scholarly metadata, linked-paper and
  project-PDF option rendering, citation readiness, local scroll state, and
  typed citation, paper, link, and unlink intents.
- The knowledge search panel owns query capture, empty, result, and error
  presentation, and typed search and resource-selection intents.
- The claim list panel owns the Claims collection shell and count, claim,
  evidence-link, passage-link, grounding selection, create availability,
  live passage-resolution presentation, grounding-choice focus, empty-state,
  and action presentation with typed create, claim, and navigation intents.
- The manuscript comment panel owns composer body and status state plus comment,
  anchor-status, empty-state, and action presentation with typed create, open,
  re-anchor, and resolve intents.
- The project publication list owns the References collection shell and count,
  reference metadata, alias and DOI labels, empty-state, and action
  presentation with typed open, manage, and enrich intents.
- The model candidate list owns revision and claim-draft summaries, empty-state,
  and a typed review-opening intent.
- The context-tab overview owns overflow visibility, counts, tab summaries, and
  typed activate and close intents.
- The composed context tab strip owns fixed-tab presentation and keyboard
  focus, delegates resource and overview presentation, and derives visibility,
  resource labels, PDF-mode state, and fixed-panel scroll capture and
  restoration for all controlled context panels.
- The context resource-tab strip owns resource tab and close-action markup,
  active-state presentation, panel associations, and typed activate and close
  intents.
- The project evidence panel owns project-PDF and annotation grouping, counts,
  expanded state, grounding selection, live passage-resolution presentation,
  grounding-choice focus, stroke controls, and typed navigation and mutation
  intents.
- The project tree panel owns path filtering, sorted folder, file, and image
  rows, active and entry presentation, the workspace quick-open shortcut and
  selection, action menus, listener teardown, and typed file, folder, image,
  and quick-open intents.
- The editor Insert menu owns scholarly-syntax choices, relative include-file
  option rendering, empty state, and local menu closing with typed syntax and
  include-file intents. The application coordinator retains collaborative
  selection resolution and Yjs edits.
- The source completion list owns citation and include option presentation,
  hover and keyboard selection, active-descendant state, selected-option
  scrolling, dismissal, and typed acceptance intents.
- The manuscript map panel owns summary metrics, heading outline, structural
  cues, local editing-pass selection, editing cues, and typed source-range
  selection intents.
- The Library discovery results panel owns provider, metadata, verification,
  and local save-progress presentation with typed save intents.
- The citation network panel owns manual source and relationship choices, graph
  geometry, source and edge cards, assertion provenance and review controls,
  snowball candidates, and local candidate-save progress with typed record,
  expansion, review, and save intents.
- The citation network workspace composes that panel with its Reference trail
  shell, owns visibility, current-project filter state, the latest validated
  network and expansion presentation snapshots, ARIA presentation, close
  behavior, reference synchronization, and candidate-save delegation, and emits
  one typed filter-change intent.
- The Preview context status and diagnostics panels own file-mode and
  validation status, unavailable-state presentation, composition and renderer
  diagnostic cards, source-map resolution, and typed source-range intents.
- The preview navigation control owns browser-local top-navigation visibility,
  storage restoration, toggle and restore presentation, active-context
  availability, and focus handoff between its spatially separated controls.
- The publication intake panel owns DOI and citation-key input, reviewed
  metadata, linked-reference rows, status, busy state, focus transitions, and
  typed preview, accept, cancel, and reference-opening intents.
- The LaTeX import panel owns archive, title, and root input, bounded client
  validation, converted-file and diagnostic review, preview identity, busy and
  status presentation, native dialog lifecycle, and typed preview,
  confirmation, and cancel intents.
- The GitHub import and detailed sync-review panels own their opaque preview
  identities and confirmation working state. The import panel additionally
  owns its read-only connection and repository-picker discovery lifecycle. The
  sync menu owns its read-only connection and status request lifecycle because
  its interval, validation, stale-request protection, and primary result
  presentation are local to that component. The sync review owns its Pull,
  Publish, and disconnect request lifecycle because their payload, validation,
  progress, and result presentation are local to the component. It emits only
  completed mutations; the application coordinator retains page-level refresh
  pause policy and canonical project refresh. Import mutations, project
  refresh, and navigation remain coordinator-owned.
- The export statistics panel owns loading, total, file, heading, and
  empty-group presentation for the live publication word-count projection.
- The project export dialog progressively enhances the server-rendered export
  links, owns both spatially separate export triggers, word-count badge
  presentation, modal open and close lifecycle, and synchronization of the
  nested live publication statistics without duplicating static export markup
  in the browser bundle.
- The knowledge connections panel owns connection counts, typed edge cards,
  relationship labels, empty state, and typed resource-selection intents.
- The assistant task panel owns operation, scope, instruction, claim relation,
  phrasing purpose, structured-table inputs, operation-specific copy and
  visibility, target-preview presentation, readiness, and typed change and
  generation intents.
- The PDF highlight import panel owns detection, empty, mixed-source, error,
  review, selection, private-note, busy and completion presentation, plus the
  opaque artifact identity associated with its current result. Its guarded
  import intent carries that identity with typed reviewed candidates.
- The project file dialog owns file and folder operation copy, initial path,
  active operation mode and stable mutation target, focus, cancellation, and
  typed save intents carrying the mode, path, and target identity together.
- Reused project-file action components own the rail and editor-menu action
  presentation, entry-file delete availability, and one typed create, include,
  rename, delete, folder-create, or image-upload intent contract.
- The project template save dialog owns replacement choices, local name and
  description values, loading and replacement copy, focus, cancellation, and
  typed save intents.
- The project starting-point browser owns project title, template and existing
  project choices, preview and loading state, create readiness and status, and
  typed create, cancel, import, project-preview, and template-delete intents.
  It also owns its native parent-dialog opening, closing, focus containment,
  listener teardown, and return-focus lifecycle.
- The Library discovery search owns query inputs, publication-type choices,
  duplicate-submit gating, progress and result-count copy, and typed query
  intents.
- The workspace settings panel owns title, entry-file and publication-profile
  values, archive and template visibility, modal lifecycle, the nested
  GitHub-sync presentation boundary, and typed project-action intents.
- The reference Library filter panel owns query, type, reading,
  organization, project-linkage, completeness, and sort values, dynamic type
  choices, result counts, reset behavior, and a typed filter-change intent.
- The model provider settings panel owns connection, endpoint, model, and
  reasoning-effort values, saved-value validation, dynamic model choices,
  discovery progress, status presentation, opening and focusing its preferences
  host, and typed change and discovery intents.
- The claim dialog owns create and edit presentation, proposition and note
  values, evidence-relation and annotation selection, modal lifecycle, and a
  typed save intent.
- The Library PDF upload control owns file selection, drag-and-drop acceptance,
  drag and busy presentation, input reset and disabling, and typed file and
  busy-drop intents. Its companion status owns queue progress, file outcomes,
  duplicate actions, retry availability, the ephemeral failed-file selection,
  busy and error presentation, and typed retry and reveal intents.
- The Library tools menu owns archive-file selection and reset, citation-network
  and archived-reference controls, canonical archived-reference visibility,
  export links, and typed restore, navigation, and filter intents.
- The web source panels own URL capture and reset state plus readable-text
  snapshot comparison presentation.
- The project annotation form owns its complete composer: visibility,
  publication-intake composition, citation availability, highlight-tool and
  undo state and presentation, active annotation identity, visible-PDF choices,
  captured quotation fields, optional note input, selection status, and typed
  tool, complete undo, citation, save, and link intents.
- The Library PDF annotation forms own private-highlight, page-note, and
  selected-markup composer visibility and values, private-highlight geometry
  and optional editing identity, plus typed save, cancel, edit, delete, and
  drawing-style intents.
- The Library PDF annotation toolbar owns tool and drawing-style controls,
  per-tool guidance, annotation availability and inspector state, and typed
  tool, undo, export, and inspector intents.
- The Library PDF inspector owns its shell visibility, active-artifact identity,
  status presentation, expanded state, annotation-details opening, nested
  annotation component composition, and typed close intent.
- The Library PDF annotation list owns saved private-highlight and markup cards,
  empty state, comments, share and citation availability, and typed navigation,
  edit, cite, share, revoke, and delete intents.
- The Library PDF markup layer owns saved and draft drawing SVG, note pins,
  tool, saved-resource selection, note-composition, and open-note-card state;
  live draft geometry updates; note movement and focus restoration; active
  interaction attributes; pointer normalization to page coordinates;
  coalesced-sample accumulation and deduplication;
  delayed pixel-space shape recognition and adjustment, recognition-timer
  cleanup, note-pin and drawing-stroke hit-testing, tool-aware pointer-down
  interpretation, local pointer capture, note-placement press and note-drag
  thresholds, note-drag preview state, drawing activation and continuation,
  typed recognition intents, and local note-card dismissal.
- The Library PDF project-use block owns unidentified, unlinked, and linked
  presentation, capability-boundary copy, citation preview, and a typed
  reference-link intent.
- The collaborator selection list owns current-revision and current-file
  filtering, caret and range presentation, accessible excerpts, and missing-file
  fallbacks for remote editor presence.
- The application toast owns message and action presentation, replacement
  timers, one-shot callback lifecycle, pinned fallback restoration, modal
  reparenting, popover visibility, and typed action and dismissal intents.
- The workspace switcher owns project option rendering, archived-current
  handling, selected state, focus entry, and a typed navigation intent.
- The research diary summary owns missing and existing diary presentation,
  derived entry, question, and action counts, action copy, and a typed open
  intent.
- The assistant workflow status owns operation-specific attribution and status
  copy, live status presentation, selected evidence keys, selection count and
  limit copy, evidence and connection actions, and their typed intents.
- The workspace rail tabs own active-tab and open-comment-count presentation
  plus a typed navigation intent.
- The authoring mode tabs own Write and Map active-state presentation,
  controlled editor, write-action, and map visibility, map focus entry through
  its composed workspace, plus a typed mode-change intent.
- The unidentified-PDF queue owns legacy unattached-artifact count, visibility,
  reference choices, and typed identification intents.
- The Library reference summary owns title and metadata presentation, PDF and
  project-link actions, and their accessible labels.
- The Library reference personal-fields block owns tags, collections,
  archive-state presentation, reading state, private-note composition, and
  typed save intents.
- The Library reference metadata editor owns manual field values, PDF and
  provider suggestions, work and field selections, refinement progress, and
  typed save, refine, and application intents.
- The Library reference PDF rows own attached-artifact presentation, member
  access context, rights choices, and typed open, rights, and refinement
  intents.
- The Library reference list owns result and empty-state rendering, detail
  expansion, nested reference-component composition, nested update settlement,
  and addressed-card focus.

It renders into light DOM so the existing semantic token and utility-class
system remains authoritative. The Worker keeps equivalent fallback markup for
the initial server-rendered shell. Future components must replace meaningful
imperative DOM coordination or establish a reusable boundary; Lit is not a
reason to wrap static markup mechanically.

## Consequences

**Positive:**

- The application coordinator addresses one typed presentation component
  instead of managing its internal elements independently.
- The sync menu removes eight internal elements plus their presentation updates
  from the application coordinator's registry.
- The import picker replaces ten internal element references, the coordinator's
  repository-option cache, outer form reference and submit binding, and its
  imperative option and preview DOM assembly. It also absorbs the former
  connection panel, separate native-dialog reference, request-generation field,
  and connection, installation, repository, and branch discovery methods.
- The sharing panel replaces fifteen internal element references and the
  coordinator's member/link DOM assembly. It also removes the separate native
  dialog reference and close-event bridge while leaving membership, capability,
  and authorization requests in the application coordinator.
- The catalog panel replaces three internal element references and the
  coordinator's filter/result DOM assembly. It also removes the separate native
  dialog reference and close-event bridge while leaving catalog fetching,
  workspace switching, and navigation authority in the application coordinator.
- The history panel replaces six internal element references and the
  coordinator's timeline/inspector DOM assembly while leaving its XState actor,
  fetches, confirmations, mutations, reloads, and navigation in the
  application coordinator.
- The project history dialog replaces separate dialog and panel references with
  one component reference and consolidates panel-close, native-dialog-close,
  loading, busy, timeline, inspection, and comparison presentation. The
  application coordinator retains the XState actor and revision operations.
- The writing-workflow panels replace five internal element references and two
  parallel imperative list renderers while leaving file creation, response
  export, and source navigation in the application coordinator.
- The assistant result panel replaces six imperative result renderers and their
  local event bindings. It also removes the coordinator's parallel transient-
  result discriminator and context cache by emitting the context retained with
  the visible result. Model requests, workflow state, candidate persistence,
  document edits, and Library imports remain in the application coordinator.
- The project map panel replaces three internal element references, two
  coordinator fields, and imperative node, connector, resize, focus, and hover
  management while leaving graph derivation and resource navigation in the
  application coordinator.
- The project map workspace replaces six coordinator element references with
  one component reference, consolidates four child event subscriptions into
  two domain events, and owns graph/search fan-out plus map entry focus. The
  application coordinator retains authorized search, response validation,
  graph acquisition, resource navigation, editor visibility, and URL policy.
- The candidate review panel replaces thirteen internal element references and
  the coordinator's candidate-copy, status, evidence, and action renderers while
  leaving applicability checks, workflow transitions, canonical mutations, and
  evidence navigation in the application coordinator.
- The publication context panel replaces eight internal element references and
  imperative metadata, paper-row, and link-form renderers while leaving
  manuscript insertion, PDF navigation, and link mutations in the application
  coordinator.
- The knowledge search panel replaces three internal element references and
  imperative result-card rendering while leaving authorized fetches, response
  validation, and resource navigation in the application coordinator.
- The claim list panel replaces one internal list reference and five imperative
  claim render helpers. It also replaces the separate create-button reference,
  native binding, availability update, count reference, and count mutation
  while leaving evidence-selection state, dialogs, mutations, passage
  navigation, and annotation navigation in the application coordinator.
- The manuscript comment panel replaces three composer element references,
  submit binding, reset and saved-status updates, one internal list reference,
  and its imperative card renderer while leaving anchor selection, mutations,
  refreshes, notifications, and passage navigation in the application
  coordinator.
- The project publication list replaces one internal list reference and its
  imperative card renderer. It also replaces the separate count reference and
  mutation while leaving context navigation, Library management, metadata
  enrichment, and refreshes in the application coordinator.
- The model candidate list replaces one internal list reference and its
  imperative card renderer while leaving generation, candidate state, context
  navigation, applicability checks, and decisions in the application
  coordinator.
- The context-tab overview replaces three internal element references and its
  imperative row and close-action renderers while leaving tab titles, routing,
  canonical context state, focus restoration, and transitions in the
  application coordinator.
- The context resource-tab strip replaces one internal element reference, the
  shared resource-tab id helper, and its imperative tab renderer while leaving
  tab titles, keyboard focus, routing, canonical context state, panel labelling,
  and transitions in the application coordinator.
- The project evidence panel replaces five internal element references and the
  imperative PDF, annotation, grouping, count, passage-link, and stroke-control
  renderers while leaving API mutations, confirmations, editor selection,
  grounding authority, PDF navigation, refreshes, and toast policy in the
  application coordinator.
- The project tree panel replaces three internal element references and the
  imperative filter, hierarchy, row, and action-menu renderers while leaving
  file and folder mutations, editor rebinding, image operations, include
  insertion, and API authority in the application coordinator.
- The manuscript map panel replaces seven internal element references and the
  imperative metric, outline, structural-cue, and editing-cue renderers while
  leaving composed-source derivation and file-qualified editor focus in the
  application coordinator.
- The Library discovery results panel replaces its imperative result-card and
  save-button renderer while leaving provider requests, response validation,
  CSL import, Library refreshes, and status policy in the application
  coordinator.
- The citation network panel replaces six internal element references,
  assertion-form binding and option rendering, plus the imperative SVG graph,
  node, edge, assertion, expansion, candidate, and progress renderers while
  leaving network requests, prompts, mutations, validation, refreshes, and
  toast policy in the application coordinator.
- The citation network workspace replaces four shell and panel references plus
  three coordinator presentation fields with one component reference. It
  removes native filter and close bindings plus the coordinator's snapshot
  assembly helper while leaving authorized network requests, validation,
  prompts, mutations, refreshes, and toast policy in the application
  coordinator.
- The Preview presentation panels replace three internal element references,
  three imperative diagnostic renderers, and the coordinator-local source-map
  lookup helper while leaving Markdown loading and rendering, composed-source
  derivation, editor focus, and file selection in the application coordinator.
- The publication intake panel replaces eleven internal element references and
  its imperative linked-reference, metadata-review, visibility, availability,
  status, and focus updates while leaving the XState workflow, DOI requests,
  acceptance mutation, refreshes, and navigation in the application
  coordinator.
- The LaTeX import panel replaces ten internal element references, two
  coordinator fields, and imperative root-option, converted-file, diagnostic,
  readiness, status, and busy rendering. It also replaces the separate native
  dialog reference while leaving validated preview and creation requests plus
  navigation in the application coordinator.
- The export statistics panel replaces the imperative total, explanatory,
  group, row, and empty-state renderers while leaving composition and canonical
  word-count derivation in the application coordinator and domain.
- The project export dialog replaces separate dialog, close-action, and
  statistics-panel references plus both external trigger references with one
  component reference. It removes the coordinator's trigger and close bindings
  plus word-count badge mutation and owns the latest statistics projection. The
  application coordinator retains only canonical word-count derivation.
- The knowledge connections panel replaces two internal element references and
  imperative edge-card and resource-link rendering while leaving graph
  derivation and cross-resource navigation in the application coordinator.
- The assistant task panel replaces eighteen internal element references and
  imperative operation, scope, purpose, copy, visibility, instruction-default,
  target-preview, and readiness updates while leaving editor target resolution,
  evidence selection, model requests, workflow state, results, and status policy
  in the application coordinator.
- The PDF highlight import panel replaces five internal element references,
  imperative candidate-card rendering, DOM-based review collection, and scan
  and import busy updates. It also replaces the coordinator's duplicate
  detection-artifact field while leaving PDF inspection, duplicate filtering,
  active-reader validation, mutation, refresh, and toast policy in the
  application coordinator.
- The project-file action components replace seven button references, seven
  direct bindings, and coordinator-owned delete availability with two component
  references and one typed event protocol. The coordinator retains active-file
  identity, resource checks, dialogs, upload selection, mutation, deferred
  deletion, and toast policy.
- The project file dialog replaces seven internal element references and
  imperative file and folder operation configuration. Its save intent also
  removes the coordinator's duplicate operation-mode and folder-target fields
  while leaving resource availability, collaborative include-target capture,
  persistence, selection, refresh, and toast policy in the application
  coordinator.
- The project template save dialog replaces seven internal element references
  and imperative replacement-option, value, status, focus, and cancellation
  handling while consuming the starting-point browser's visible template view.
  The application coordinator retains catalog refresh, seed capture,
  persistence, and toast policy.
- The project starting-point browser replaces seven internal form and action
  element references, coordinator submit, selection-change, cancel, and import
  bindings, title and selection collection, readiness, loading, and error
  updates. It also replaces the coordinator's duplicate template array and
  hidden-ID set while leaving template and project-preview requests, deferred
  deletion, project and import workflows, and navigation in the application
  coordinator.
- The Library discovery search replaces six internal element references and
  imperative form-value, submit-state, progress, count, empty, and error
  handling while leaving provider requests, response validation, result
  presentation, import mutation, and refresh policy in the application
  coordinator.
- The workspace settings panel replaces fifteen internal element references and
  imperative entry-file option, profile-value, archive-label, template
  visibility, modal, and nested GitHub-review coordination while leaving
  authorization, persistence, navigation, synchronization requests,
  destructive confirmation, catalog refresh, and toast policy in the
  application coordinator.
- The reference Library filter panel replaces eight internal element references,
  seven control listeners, filter-value validation, dynamic type-option
  rendering, and result-count updates while leaving canonical filtering,
  linked-reference projection, result-card rendering, and navigation in the
  application coordinator.
- The model provider settings panel replaces six internal element references,
  duplicate preference listeners and status synchronization, stored-value
  validation, and imperative model-option rendering. It also removes the
  coordinator's preferences-host reference and split open/focus coordination,
  and owns its browser-local discovery request, overlap guard, busy state,
  result selection, and failure status. The application coordinator retains
  cross-feature discovery availability, local persistence, generation request
  construction, generation workflows, and assistant status mirroring.
- The claim dialog replaces eight internal element references, one coordinator
  field, imperative evidence-option rendering, DOM-based selection collection,
  and modal configuration while leaving evidence prerequisites, API mutation,
  refreshes, and toast policy in the application coordinator.
- The Library PDF upload control replaces two raw element references, four
  native file and drag bindings, coordinator-owned drag presentation, input
  reset and disabling, and duplicate busy state. Its companion status replaces
  imperative progress, outcome-row, error, duplicate-action, and retry
  rendering and owns the ephemeral failed-file retry selection. Queue execution,
  upload transport, Library refreshes, and toast policy remain in the
  application coordinator.
- The Library tools menu replaces three raw element references, three native
  bindings, archive-file DOM reads and reset, and scattered archived-button
  presentation while leaving archive transport, citation-network loading,
  Library refreshes, and toast policy in the application coordinator. The
  coordinator reads the component's canonical archived visibility when loading
  the Library.
- The web source panels replace three internal element references, submit
  binding, URL reset, comparison heading selection, and diff-hunk rendering
  while leaving capture and comparison requests, response validation, Library
  refreshes, and toast policy in the application coordinator.
- The project annotation form replaces thirteen internal element references,
  four direct toolbar and citation bindings, imperative composer visibility,
  citation and tool presentation, PDF-option and captured-selection updates,
  status rendering, submitter detection, editing identity, selected-tool state,
  and last-stroke undo state while leaving highlight geometry and persistence,
  manuscript linking, refreshes, and toast policy in the application
  coordinator.
- The Library PDF annotation forms replace seventeen internal element
  references, three submit bindings, cancel and selected-markup action bindings,
  composer visibility updates, DOM-based value collection, and the coordinator's
  duplicate highlight-rectangle and editing-identity fields. The markup layer's
  interaction state and drawing geometry remain separate from
  coordinator-owned mutations, refreshes, inspector policy, and toasts.
- The Library PDF annotation toolbar replaces twelve internal element
  references, tool, input, undo, export, and inspector bindings, and imperative
  active-tool, width-label, availability, count, and expanded-state updates. It
  also owns the guidance associated with each tool while leaving gestures in
  the markup layer and drawing persistence, annotated export, inspector policy,
  and toasts in the application coordinator.
- The Library PDF inspector replaces four shell element references, the direct
  close binding, artifact dataset comparisons, and repeated visibility, status,
  expansion, and details mutations while leaving interactions in the markup
  layer and mutations, refreshes, and close policy in the application
  coordinator.
- The Library PDF annotation list replaces five imperative highlight and markup
  render helpers plus their per-card handlers with one delegated typed action
  stream. The application coordinator retains PDF navigation, annotation
  mutations, project citation and research-share workflows, refreshes, and
  notification policy.
- The Library PDF markup layer replaces imperative SVG, polyline, draft-pin,
  saved-pin, and note-card construction plus coordinator-owned draft-line and
  note-focus queries. It also owns page-relative pointer normalization and its
  interaction attributes, coalesced drawing-sample accumulation, and
  bound-dependent shape recognition and adjustment, including recognition
  scheduling, transient recognized-shape state, manipulation, and cancellation.
  It also resolves note-pin and drawing-stroke targets without exposing its
  selectors and combines targets, page geometry, and active tool state into
  typed pointer actions. The layer also owns native-default suppression, pointer
  capture, recognition cancellation, and active-drawing presentation at gesture
  start. During continuation it owns native scroll suppression, coalesced sample
  expansion, reactive draft updates, recognition scheduling, snapped-shape
  replacement, manipulation, pointer validation, cancellation, and completion.
  It returns the final normalized points only when the active drawing pointer
  finishes. No separate state owner duplicates drawing pointer, point, or
  shape-manipulation state. Note dragging likewise keeps its start
  coordinates, movement threshold, native-default suppression, normalized
  preview position, note identity, pointer identity, completion result, and
  transient DOM update inside the layer. Tool mode, saved-resource selection,
  note composition or editing, and open-card state now live in the same layer,
  eliminating the separate annotation state machine and coordinator-owned
  transitions. The application coordinator retains persistence, inspector
  policy, refreshes, and notifications. A prospective note placement similarly
  remains layer-local until a stationary pointer release, when the layer opens
  its local note-composition state for a coordinator-owned durable save.
- The Library PDF project-use block replaces its imperative renderer and four
  one-off DOM-construction helpers. The application coordinator retains
  canonical reference and project-link lookup, the linking mutation, snapshot
  refreshes, and notification policy.
- The collaborator selection list replaces imperative remote-presence rendering
  and consolidates revision and file filtering for both the list and editor
  overlay. The application coordinator retains local-author selection,
  collaboration transport, revision authority, and editor-highlight placement.
- The application toast replaces action-element construction, coordinator timer
  state, popover visibility, modal reparenting, action callback state, and the
  persistent-update reminder field and bindings. The application coordinator
  supplies authorized effects and retains deferred-deletion authority, offline
  persistence, and notification policy.
- The workspace switcher replaces the final feature-level imperative option
  renderer plus its native change and focus coordination. The application
  coordinator retains catalog fetching and navigation authority.
- The research diary summary replaces three internal element references and
  coordinator-owned summary adaptation and copy. The application coordinator
  retains file lookup, creation, selection, and editor focus.
- The assistant workflow status replaces four internal element references,
  two native action bindings, operation-specific status copy, and attribution
  visibility. It also removes the coordinator's selected-evidence set and count
  formatting while exposing readonly keys for snapshot resolution and
  generation policy. The application coordinator retains evidence navigation,
  settings availability, generation, discovery-status mirroring, and broader
  status policy.
- The workspace rail tabs replace five internal element references, four
  native action bindings, four ARIA-selection mutations, and DOM-derived active
  mode. The application coordinator retains panel visibility, guide rendering,
  URL synchronization, collapse, and resize authority.
- The authoring mode tabs replace two internal element references, two native
  action bindings, two ARIA-state mutations, DOM-derived active mode, one
  write-action reference, and three coordinator-owned visibility mutations.
  The application coordinator retains editor focus policy and URL
  synchronization.
- The editor status component replaces separate target and save-status element
  references and owns their text and target-tooltip presentation. The
  application coordinator retains authoring-target resolution, collaboration
  and offline-save policy, and the status values those workflows select.
- The connection status component replaces separate label and tone element
  references and owns their synchronized presentation. The application
  coordinator retains collaboration-state interpretation and Library-mode
  status policy.
- The Vim mode control replaces separate toggle and mode-status element
  references and owns browser-local enablement, mode presentation, modal key
  handling, pointer-selection transitions, and editor-listener teardown. The
  application coordinator only supplies the source editor and its shell.
- The application-version control replaces separate value and copy-action
  element references and owns version presentation plus Clipboard API and
  textarea fallback behavior. The application coordinator supplies the active
  build version and retains toast presentation for the typed copy notice.
- The preview synchronization control replaces its container and two button
  references, owns Preview-context visibility, the current composition source
  map, bidirectional offset resolution, and one typed directional action stream.
  The application coordinator retains active-file and editor-offset selection,
  caret placement, scrolling, and focus policy.
- The preview navigation control owns browser-local top-navigation visibility,
  stored restoration, toggle and restore presentation, ARIA and title copy,
  restricted-Preview availability, and focus handoff. The application
  coordinator supplies only whether Preview is the active workspace context.
- The context tab strip replaces five shell references, three native primary
  action bindings, fixed-tab ARIA mutations, coordinator-owned roving focus,
  the separate overflow-tab renderer, seven controlled-panel references,
  visibility mutations, resource labelling, and PDF-mode presentation. It
  composes the existing dynamic resource tabs and overflow overview from one
  input while emitting their typed intents. The application coordinator retains
  active-context state, authorized Library loading, resource closure, route
  synchronization, content rendering, and resource-panel scroll restoration.
- The workspace surface switcher replaces two button references, native action
  bindings, and ARIA-state mutations. The application coordinator retains
  responsive surface visibility and URL synchronization.
- The workspace rail tabs derive their four controlled panel targets from the
  existing `aria-controls` contract and own active-panel visibility alongside
  tab selection and comment-count presentation. The application coordinator
  retains route synchronization, responsive rail layout, and guide rendering.
- The unidentified-PDF queue replaces two internal element references,
  imperative section, count, empty-state, card, and option rendering, and
  per-card action bindings while leaving legacy artifact identification,
  Library refreshes, and toast policy in the application coordinator.
- The Library reference summary replaces imperative title, metadata, and action
  rendering plus per-card PDF and project-link handlers with one delegated
  action stream while leaving mutations, PDF presentation, result-card
  assembly, and metadata refinement in the application coordinator.
- The Library reference personal-fields block replaces six imperative form and
  select render helpers plus their per-card handlers and DOM value collection
  with one delegated action stream while leaving persistence, confirmation,
  Library refreshes, and toast policy in the application coordinator.
- The Library reference metadata editor replaces the metadata-field element
  map, suggestion-target map, refinement panel target, eight imperative render
  helpers, and DOM-based application selection collection. The application
  coordinator retains PDF extraction, provider requests, the refinement state
  machine, persistence, refreshes, and toast policy.
- The Library reference PDF rows replace two imperative row render helpers and
  per-artifact open, rights, and secondary-refinement handlers while leaving
  PDF presentation, rights persistence, extraction, and refinement workflow in
  the application coordinator.
- The Library reference research rows compose attached PDFs with private notes,
  highlights, and immutable web captures; own share, revoke, download,
  comparison, pin, diagnostic, and recapture presentation; and emit one typed
  action stream. The application coordinator retains persistence, capture and
  comparison requests, project-pin mutations, refreshes, and notification
  policy.
- The Library reference list replaces result-card, metadata-details, personal
  fields, and attached-research composition helpers plus coordinator-owned
  expansion and focus state. Nested typed actions continue bubbling to the
  application coordinator, which retains canonical filtering, mutations,
  requests, refreshes, and notification policy.
- The source completion list replaces imperative option construction, per-row
  pointer handlers, selection rendering, keyboard movement and acceptance, and
  source-editor ARIA synchronization. It also binds the editor keyboard and
  blur lifecycle, owns browser-local citation-scope persistence, and emits a
  typed scope-change intent. Acceptance now carries the component-selected
  candidate and replacement context, removing five coordinator caches and the
  completion-kind discriminator. The application coordinator retains context
  detection, candidate ranking, private-Library linking, Yjs edits, caret
  restoration, and menu positioning.
- The source citation control owns caret-context parsing and action
  availability and emits one typed resolved-citation intent. The application
  coordinator retains publication resolution, grouped-citation policy, and
  context navigation.
- The existing PDF viewer owns its complete status presentation, including
  active-load failures and text-selection pointer routing reported by the
  application coordinator, without exposing its internal elements to
  `WorkspaceApp`.
- The Preview DOM adapter owns direct article and viewport mechanics that do
  not need reactive templating: content assignment, source-span lookup,
  centering, transient emphasis, image lookup, and anchor scrolling. This
  keeps Lit focused on reactive presentation while still removing raw Preview
  elements from `WorkspaceApp`.
- The action-menu controller owns document-level outside-action dismissal,
  settings-menu containment, Escape ordering, focus restoration, and listener
  teardown for spatially separate native `details` menus.
- The browser shell resolves its native and Lit elements through one typed
  registry. TypeScript infers the returned registry shape from the validated
  constructors, replacing a separately maintained 86-field interface and
  keeping startup-only DOM lookup outside the application coordinator.
- Related template, visibility rules, and local event binding now have one
  browser owner.
- Later bounded extractions can reuse the same reactive component model without
  introducing a global frontend store.

**Negative:**

- The first extraction adds more lines than it removes because it establishes
  the boundary and preserves server-rendered fallback content.
- Browser bundles and production installs gain Lit and its transitive packages.
- Component behavior needs browser-level coverage in addition to
  server-template checks.

**Neutral:**

- Network requests, GitHub and workspace-access contracts, authorization
  handling, and disconnect confirmation remain in `WorkspaceApp`.
- The visual language and server-rendered application shell are unchanged.

## Alternatives Considered

### Keep imperative DOM ownership in `WorkspaceApp`

This avoids a dependency but continues growing the element registry, visibility
updates, and event wiring in the main coordinator.

### Adopt a whole-application client framework

React, Vue, or a full Lit shell could centralize rendering, but would require a
large migration and duplicate or replace the current server-rendered authority.

### Build a local reactive component base

A project-owned base could be smaller initially but would recreate scheduling,
property updates, template escaping, and event binding that Lit already
maintains.
