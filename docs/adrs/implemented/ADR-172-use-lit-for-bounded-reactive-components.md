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
  submission, readiness, import preview and creation requests, account
  disconnection, preview/status rendering, native dialog lifecycle, and typed
  Cancel and completed-navigation events.
- The workspace sync menu owns repository status, relationship tone, Pull and
  Push availability, its bounded read-only connection and status refresh
  lifecycle, interval, validation and stale-request guard, typed Check, Pull,
  Push, and Settings intents, and one typed state event for the settings mirror.
- The workspace sync review owns Pull and Publish requests and diff rendering,
  conflict choices, commit-message input, disconnect confirmation, response
  validation, readiness, progress, and one typed completed-mutation event.
- The new-project starting-point browser owns template and existing-project
  groups, template-catalog and existing-project preview requests, project
  creation, personal-template deletion, response validation, post-delete
  catalog refresh, the fetched catalog, and optimistic
  hidden-template state, the derived visible-template view, local selection
  and preview state, bounded preview rendering, and typed completion and
  template-delete events.
- The workspace sharing panel owns member and capability-link requests,
  response validation and presentation, invitation input and submission,
  clipboard interaction, native parent-dialog lifecycle, and typed notices.
- The workspace catalog panel owns project filtering, result and empty-state
  rendering, metadata labels, filter focus reset, and native parent-dialog
  lifecycle.
- The project history panel owns timeline, comparison controls, busy and error
  states, revision cards, inspectors, and typed revision-operation intents.
- The project history dialog composes the server-rendered modal and reactive
  history panel and owns its XState actor, modal lifecycle, timeline and
  operation requests, response validation, confirmations, request generations,
  stale-response rejection, busy and error state, and typed notice, navigation,
  reload, and close outcomes.
- The project history trigger owns revision-badge presentation and emits one
  typed open intent. The application coordinator retains revision authority,
  toast presentation, and browser navigation policy.
- Reused writing-workflow panels own research-question and reviewer-response
  Markdown-to-item adaptation, counts, empty states, action labels, and typed
  open, download, and source-selection intents.
- The assistant result panel owns validated-table previews, clarity input,
  transient revision choices and their captured passage, source-revision,
  evidence, provider-continuation, or table-target context, table generation and
  returned-shape validation, clarity, ideation, and phrasing provider requests,
  reference-discovery query formulation and registry transport, validated cards,
  the shared CSL import adapter, duplicate-submit gating, local save progress and
  retryable failures, refresh-pending state, and complete typed continuation,
  selection, insertion, and canonical-refresh outcomes.
- The project map panel owns provenance-lane rendering, measured SVG connector
  geometry, responsive relayout, focus and hover emphasis, and a typed resource
  selection intent.
- The project map workspace composes search, provenance-map, and typed-connection
  panels; owns resource and link totals, search-versus-overview presentation,
  mode visibility, focus entry, and one typed resource-selection stream; and
  exposes one graph-presentation boundary to the application coordinator.
- The candidate review panel owns before/after and provenance rendering,
  evidence-link availability, local revision and claim-draft applicability from
  canonical inputs, live collaboration and workflow decision availability,
  decision gating, encoded apply and reject transport, retryable same-candidate
  failure state, progress, local scroll state, and typed decision-start,
  completed-decision, and evidence-navigation outcomes. The coordinator retains
  assistant workflow transitions, canonical refresh, tab movement, and
  notification policy; the server remains authoritative for mutation safety.
- The publication context panel owns scholarly metadata, linked-paper and
  project-PDF option derivation and rendering from canonical reference inputs,
  citation readiness, local scroll state, and explicit project-PDF link and
  unlink transport, duplicate-submit gating, pending and retryable failure
  state, and typed citation, paper-navigation, and completed-relationship
  outcomes.
- The knowledge search panel owns query capture, empty, result, and error
  presentation, and typed search and resource-selection intents. Its enclosing
  project-map workspace owns the authorized search request, response validation,
  and search lifecycle because the same state controls graph-overview visibility.
- The claim list panel owns the Claims collection shell and count, claim,
  evidence-link, passage-link, grounding selection, create availability,
  live passage-resolution presentation, grounding-choice focus, empty-state,
  action presentation, confirmed deletion and claim-passage-link transport,
  duplicate-delete gating, local pending and retryable failure state, and typed
  create, claim, completed mutation, and navigation outcomes. The coordinator
  supplies the link workflow with a Yjs-validated typed passage input.
- The manuscript comment panel owns composer body and status state plus comment,
  anchor-status, empty-state, and action presentation with typed create, open,
  and re-anchor intents. Given a coordinator-validated current passage, it owns
  create and re-anchor transport, body reset, local retryable failure state,
  self-contained resolution transport, duplicate-resolution gating, and typed
  completed mutation outcomes.
- The project publication list owns the References collection shell and count,
  reference metadata, alias and DOI labels, empty-state, and action
  presentation. It also owns DOI-enrichment transport, duplicate-submit
  gating, pending and retryable failure state, and typed open, manage, and
  completed-enrichment outcomes.
- The model candidate list owns revision and claim-draft summaries, empty-state,
  revision and claim-draft provider requests, typed creation transport, fixed
  adapter and prompt-version derivation, operation-specific response validation,
  and a typed review-opening intent. The coordinator retains authorized target
  and evidence derivation, canonical refresh, context navigation, workflow state,
  and decisions.
- The context-tab overview owns overflow visibility, counts, tab summaries, and
  typed activate and close intents.
- The composed context tab strip owns fixed-tab presentation and keyboard
  focus, delegates resource and overview presentation, and derives fixed and
  canonical resource titles, visibility, resource labels, PDF-mode state, and
  fixed-panel scroll capture and restoration for all controlled context panels.
- The context resource-tab strip owns resource tab and close-action markup,
  active-state presentation, panel associations, and typed activate and close
  intents.
- The project evidence panel owns project-PDF and annotation grouping, counts,
  expanded state, grounding selection, live passage-resolution presentation,
  grounding-choice focus, stroke controls, project-PDF file input, validation
  and import transport, guarded legacy PDF and annotation removal transport,
  highlight-fragment update and deletion transport, trimmed-quote validation,
  annotation-passage-link transport from a coordinator-validated typed passage,
  duplicate-mutation gates, pending and retryable failure state, and typed
  navigation, mutation, notice, and completed outcomes.
- The project tree panel owns path filtering, sorted folder, file, and image
  rows, active and entry presentation, the workspace quick-open shortcut and
  selection, action menus, listener teardown, encoded empty-folder and image
  deletion transport, response validation, and typed file, folder, image, and
  quick-open intents. The coordinator retains optimistic hiding, delayed commit
  scheduling, Undo restoration, snapshot application, rendering, and failure
  notification.
- The project image upload control owns the image file input, sequential upload
  transport, response validation, duplicate-submit gating, local progress and
  retryable failure state, and a typed completed outcome carrying the final
  validated workspace snapshot. The coordinator retains snapshot application,
  project-tree and preview rendering, image insertion and deletion, and toast
  policy.
- The editor Insert menu owns scholarly-syntax choices, relative include-file
  option rendering, empty state, and local menu closing with typed syntax and
  include-file intents. The application coordinator retains collaborative
  selection resolution and Yjs edits.
- The source completion list owns citation and include option presentation,
  candidate ranking and display adaptation, empty-state hiding, popup
  positioning, hover and keyboard selection, active-descendant state,
  selected-option scrolling, dismissal, and typed acceptance intents. Its pure
  citation-completion domain adapter owns project and available unlinked Library
  candidate construction from canonical reference inputs.
- The manuscript map panel owns summary metrics, heading outline, structural
  cues, local editing-pass selection, editing cues, and typed source-range
  selection intents.
- The Library discovery results panel owns provider, metadata, verification,
  metadata-to-CSL projection, import transport, duplicate-submit gating, local
  save progress and retryable failures, refresh-pending state, and a typed
  refresh outcome.
- The citation network panel owns manual source and relationship choices, graph
  geometry, source and edge cards, assertion provenance and review controls,
  snowball candidates, and local candidate-save progress with typed record,
  expansion, review, and save intents.
- The citation network workspace composes that panel with its Reference trail
  shell and owns visibility, current-project filter state, loading, request
  generations, response validation, assertion recording and review, expansion,
  candidate acceptance, prompts, local progress and failures, the latest
  network and expansion snapshots, close behavior, reference synchronization,
  and typed notice or Library-refresh outcomes.
- The Preview context status and diagnostics panels derive file-mode and issue
  summaries from canonical preview and diagnostic inputs, and own
  unavailable-state presentation, composition and renderer diagnostic cards,
  source-map resolution, and typed source-range intents.
- The preview navigation control owns browser-local top-navigation visibility,
  storage restoration, toggle and restore presentation, active-context
  availability, and focus handoff between its spatially separated controls.
- The publication intake panel owns DOI and citation-key input, reviewed
  metadata, active-PDF linked-reference projection and rows, its XState workflow
  actor, preview and acceptance requests, response validation, stale-response
  guards, status, busy state, focus transitions, and typed refresh-pending
  acceptance and reference-opening outcomes.
- The LaTeX import panel owns archive, title, and root input, bounded client
  validation, converted-file and diagnostic review, preview identity, busy and
  status presentation, native dialog lifecycle, authenticated preview and
  creation request lifecycles, Valibot response validation, and typed cancel
  and completed-navigation intents.
- The GitHub import and detailed sync-review panels own their opaque preview
  identities and confirmation working state. The import panel additionally
  owns its read-only connection and repository-picker discovery lifecycle plus
  import preview, creation, and account-disconnection requests because their
  payloads, validation, progress, and results are local to that component. The
  sync menu owns its read-only connection and status request lifecycle because
  its interval, validation, stale-request protection, and primary result
  presentation are local to that component. The sync review owns its Pull,
  Publish, and disconnect request lifecycle for the same reason. It emits only
  completed mutations; the application coordinator retains page-level refresh
  pause policy, canonical project refresh, and navigation.
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
  visibility, target-preview wording and truncation from canonical target
  inputs, readiness, and typed change and generation intents.
- The PDF highlight import panel owns detection, empty, mixed-source, error,
  saved-highlight overlap filtering, review, selection, private-note, stable
  encoded import transport, duplicate-submit suppression, retryable failure,
  busy and completion presentation, plus its explicit artifact and reference
  context. It ignores stale asynchronous results after that identity changes
  and emits only a typed completed-import outcome.
- The project file dialog owns file and folder operation copy, initial path,
  active operation mode and stable mutation target, focus, cancellation,
  create and rename transport, file deletion transport, content-bearing
  workflow-file creation, shared response validation, created-path verification,
  duplicate-submit gating, local busy and retryable failure state, and typed
  completed outcomes carrying the mode, path, message, and validated workspace
  snapshot together. The coordinator retains workflow-template selection and
  navigation, the deletion grace period, optimistic hiding, Undo restoration,
  snapshot application, rendering, and notification.
- Reused project-file action components own the rail and editor-menu action
  presentation, entry-file delete availability, and one typed create, include,
  rename, delete, folder-create, or image-upload intent contract.
- The project template save dialog owns replacement choices, local name and
  description values, loading and replacement copy, focus, cancellation,
  promotion requests, response validation, local busy and error state, and
  typed validated completion outcomes.
- The project starting-point browser owns project title, template and existing
  project choices, catalog loading, project-preview loading, project creation,
  personal-template deletion, response validation, post-delete catalog refresh,
  preview and loading state, create readiness and status, and typed cancel,
  import, completion, and template-delete events. It also owns
  its native parent-dialog opening, closing, focus containment, listener
  teardown, and return-focus lifecycle.
- The Library discovery search owns query inputs, publication-type choices,
  provider requests and response validation, duplicate-submit gating, progress
  and result-count copy, and typed validated-result events.
- The workspace settings panel owns title, entry-file and publication-profile
  values, settings persistence, archive/restore, duplication and permanent
  deletion requests, destructive confirmation, local busy and error state,
  archive and template visibility, modal lifecycle, the nested GitHub-sync
  presentation boundary, and typed navigation, catalog-refresh, and
  save-as-template outcomes.
- One shared client HTTP adapter owns same-origin JSON serialization, supported
  write methods, non-success parsing, Valibot validation of the bounded API
  error contract, and caught-value fallback messages used by request-owning
  components and the application coordinator.
- The reference Library filter panel owns query, type, reading,
  organization, project-linkage, completeness, and sort values, dynamic type
  choices, result counts, reset behavior, and a typed filter-change intent.
- The model provider settings panel owns connection, endpoint, model, and
  reasoning-effort values, saved-value validation, dynamic model choices,
  discovery progress, status presentation, opening and focusing its preferences
  host, and typed change and discovery intents.
- The claim dialog owns create and edit presentation, proposition and note
  values, evidence-relation and annotation selection, stable claim identity,
  modal lifecycle, mutation transport, duplicate-submit gating, local busy and
  retryable failure state, and a typed successful-refresh outcome.
- The Library PDF upload control owns file selection, drag-and-drop acceptance,
  ordered batch execution, upload transport and response validation, partial
  failure and refresh-pending state, duplicate-submit gating, drag and busy
  presentation, input reset, guarded retries, and typed notice or refresh
  outcomes. Its bound companion status owns queue progress, file outcomes,
  duplicate actions, retry availability, the ephemeral failed-file selection,
  busy and error presentation, and typed retry and reveal intents.
- The Library reference-import control owns BibTeX and CSL JSON file selection,
  file reads, import transport, duplicate-submit gating, local busy and failure
  presentation, input reset, refresh-pending state, and one typed refresh
  outcome.
- The Library tools menu owns archive-file selection and reset, restore
  transport, duplicate-submit and refresh-pending state, local restore failures,
  citation-network and archived-reference controls, canonical archived-reference
  visibility, export links, and typed refresh, navigation, and filter outcomes.
- The web source panels own URL capture and reset state, capture and comparison
  requests, comparison-response validation, duplicate-submit guards, local
  progress and failure state, readable-text comparison presentation, and a
  typed captured outcome.
- The project annotation form owns its complete composer: visibility,
  publication-intake composition, citation availability, highlight-tool and
  undo state and presentation, active annotation identity, visible-PDF choices,
  captured quotation fields, highlight creation and stroke-extension transport,
  Valibot response validation, optional note input and persistence, local save
  status and retryable failures, paint-versus-erase selection feedback derived
  from its local tool and canonical capture, citation availability derived from
  the active PDF and canonical publication-PDF links, and typed tool, complete
  undo, citation, completed save, and link outcomes or intents.
- The Library PDF annotation forms own private-highlight, page-note, and
  selected-markup composer visibility and values, private-highlight geometry
  and optional editing identity, private-highlight create and comment-update
  transport, overlap classification, duplicate-submit gating, pending and
  retryable failure state, plus typed completed-save, cancel, edit, delete, and
  drawing-style outcomes.
- The Library PDF annotation toolbar owns tool and drawing-style controls,
  per-tool guidance, annotation availability and inspector state, newest-page-
  drawing selection, stable undo deletion, pending and retryable failure state,
  stable annotated-export target, installed-app file sharing, download fallback,
  and typed tool, completed-undo, export-status, and inspector outcomes.
- The Library PDF inspector owns its shell visibility, active-artifact identity,
  status presentation, expanded state, annotation-details opening, nested
  annotation component composition, and typed close intent.
- The Library PDF annotation list owns saved private-highlight and markup cards,
  empty state, comments, share and citation availability, and typed navigation,
  edit, and cite intents. It also owns research-share and revoke transport,
  canonical workspace-response validation, completed mutation outcomes,
  saved-markup card deletion, stable encoded targets, list-wide pending
  suppression, retryable card-local failures, and a typed deletion outcome.
- The Library PDF markup layer owns saved and draft drawing SVG, note pins,
  tool, saved-resource selection, note-composition, and open-note-card state;
  live draft geometry updates; note movement and focus restoration; active
  interaction attributes; pointer normalization to page coordinates;
  coalesced-sample accumulation and deduplication;
  delayed pixel-space shape recognition and adjustment, recognition-timer
  cleanup, note-pin and drawing-stroke hit-testing, tool-aware pointer-down
  interpretation, local pointer capture, note-placement press and note-drag
  thresholds, note-drag preview state, drawing activation and continuation,
  typed recognition intents, local note-card dismissal, completed note-move
  transport, stable encoded note targets, overlapping-move suppression,
  retryable local failures, and typed completed-move outcomes.
  Given stable active artifact and reference identities, it also owns completed
  drawing transport, style and page capture, pending-state suppression, and a
  visible failed draft with explicit retry and discard actions.
- The Library PDF project-use block owns unidentified, unlinked, and linked
  presentation, capability-boundary copy, citation preview, matching
  bibliographic-record and project-alias projection from canonical inputs, and
  a typed completed reference-link mutation outcome. It shares
  project-reference transport and canonical workspace-response validation with
  the Library reference summary.
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
  limit copy, ordered annotation-or-claim model-evidence projection from
  canonical collections, annotation-only claim-drafting subsets, evidence and
  connection actions, operation-specific generation-start copy, and their typed
  intents.
- The workspace rail tabs own active-tab and open-comment-count presentation
  plus a typed navigation intent.
- The authoring mode tabs own Write and Map active-state presentation,
  controlled editor, write-action, and map visibility, map focus entry through
  its composed workspace, plus a typed mode-change intent.
- The unidentified-PDF queue owns legacy unattached-artifact count, visibility,
  reference choices, identification transport, duplicate-submit gating, local
  progress and retryable failures, refresh-pending state, and a typed refresh
  outcome.
- The Library reference summary owns title and metadata presentation, PDF and
  project-link actions, their accessible labels, project-link and unlink
  transport, canonical workspace-response validation, and typed completed
  mutation outcomes.
- The Library reference personal-fields block owns tags, collections,
  archive-state presentation, reading state, private-note composition, all five
  persistence requests, payload normalization, archive confirmation,
  duplicate-submit gating, local failure state, and one typed successful-refresh
  outcome.
- The Library reference metadata editor owns manual field values, PDF and
  provider suggestions, work and field selections, refinement progress, manual
  and reviewed persistence, duplicate-submit gating, local failures, and typed
  refresh or notice outcomes.
- The Library reference PDF rows own attached-artifact presentation, member
  access context, rights choices and persistence, duplicate-submit gating,
  local failure state, and typed open, refresh, and refinement outcomes.
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
  dialog reference, close-event bridge, seven request methods, and two intent
  adapters while leaving global toast presentation in the application
  coordinator.
- The catalog panel replaces three internal element references and the
  coordinator's filter/result DOM assembly. It also removes the separate native
  dialog reference and close-event bridge while leaving catalog fetching,
  workspace switching, and navigation authority in the application coordinator.
- The history panel replaces six internal element references and the
  coordinator's timeline/inspector DOM assembly. The enclosing dialog now owns
  its XState actor, fetches, confirmations, mutations, and stale-response
  policy.
- The project history dialog replaces separate dialog and panel references with
  one component reference and consolidates panel-close, native-dialog-close,
  loading, busy, timeline, inspection, and comparison presentation. It also
  removes the coordinator actor and eleven request, operation, and failure
  methods while leaving toast, reload, and navigation outcomes in the
  application coordinator.
- The writing-workflow panels replace five internal element references and two
  parallel imperative list renderers while leaving workflow-template choice,
  response export, and source navigation in the application coordinator. The
  shared project-file owner performs their content-bearing file creation and
  created-path verification.
- The assistant result panel replaces six imperative result renderers and their
  local event bindings. It also removes the coordinator's parallel transient-
  result discriminator and context cache by emitting the context retained with
  the visible result. The result owner performs table generation, shape
  validation, and serialization, clarity, ideation, and phrasing requests,
  reference-query formulation, registry discovery and validation, and local
  discovered-reference import. Workflow state, candidate-input derivation,
  document edits, canonical refresh, and cross-panel status remain in the
  application coordinator; the candidate list performs revision and claim-draft
  generation and persists those candidate resources.
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
  also replacing candidate-decision availability branches, the apply/reject
  request, retryable local failure reconstruction, evidence-id collection, and
  revision/claim-draft applicability derivation. It leaves canonical inputs,
  workflow transitions, refresh, tab movement, notification policy, and evidence
  navigation in the application coordinator.
- The publication context panel replaces eight internal element references and
  imperative metadata, paper-row, and link-form renderers plus two coordinator
  relationship-mutation methods. It also replaces the coordinator's parallel
  available-PDF and private-Library, shared-reference, and project paper-option
  mapper while leaving canonical inputs, manuscript insertion, PDF navigation,
  refresh, and workspace notification policy in the application coordinator.
- The knowledge search panel replaces three internal element references and
  imperative result-card rendering. Its project-map workspace also replaces the
  coordinator's authorized search fetch and response validation while leaving
  graph derivation and resource navigation in the application coordinator.
- The claim list panel replaces one internal list reference and five imperative
  claim render helpers. It also replaces the separate create-button reference,
  native binding, availability update, count reference, count mutation, and
  coordinator deletion and passage-link request methods while leaving Yjs
  selection validation, evidence-selection state, dialogs, canonical refresh,
  notification policy, passage navigation, and annotation navigation in the
  application coordinator.
- The manuscript comment panel replaces three composer element references,
  submit binding, reset and saved-status updates, one internal list reference,
  its imperative card renderer, and all three coordinator comment request
  paths. It leaves Yjs selection validation, current-passage derivation,
  canonical refreshes, notifications, and passage navigation in the
  application coordinator.
- The project publication list replaces one internal list reference and its
  imperative card renderer. It also replaces the separate count reference and
  mutation plus the coordinator enrichment method while leaving context
  navigation, Library management, canonical refresh, and notification policy
  in the application coordinator.
- The model candidate list replaces one internal list reference and its
  imperative card renderer plus the coordinator's revision- and claim-candidate
  requests, response guards, and provider generation. It leaves authorized
  target and evidence derivation, canonical candidate state, context navigation,
  applicability checks, workflow state, and decisions in the application
  coordinator.
- The context-tab overview replaces three internal element references and its
  imperative row and close-action renderers while leaving title derivation to
  its composed parent and routing, canonical context state, focus restoration,
  and transitions in the application coordinator.
- The context resource-tab strip replaces one internal element reference, the
  shared resource-tab id helper, and its imperative tab renderer while leaving
  title derivation, keyboard focus, and panel labelling to its composed parent
  and routing, canonical context state, and transitions in the application
  coordinator.
- The project evidence panel replaces five internal element references and the
  imperative PDF, annotation, grouping, count, passage-link, and stroke-control
  renderers plus the coordinator PDF- and annotation-removal methods while
  also replacing the annotation-passage-link and project-PDF import requests
  and the final raw project-PDF input reference. It also replaces fragment
  update validation and transport plus fragment-deletion transport while
  leaving Yjs selection validation, PDF selection and undo coordination,
  grounding authority, PDF navigation, form synchronization, canonical refresh,
  and toast policy in the application coordinator.
- The project tree panel replaces three internal element references and the
  imperative filter, hierarchy, row, and action-menu renderers. Its companion
  image upload control also replaces the coordinator file-input listener and
  sequential upload request, while the tree replaces the empty-folder and image
  DELETE requests. File deletion, editor rebinding, validated snapshot
  application, image insertion, optimistic hide and Undo coordination, include
  insertion, and cross-feature rendering remain in the application coordinator.
- The manuscript map panel replaces seven internal element references and the
  imperative metric, outline, structural-cue, and editing-cue renderers while
  leaving composed-source derivation and file-qualified editor focus in the
  application coordinator.
- The Library discovery results panel replaces its imperative result-card and
  save-button renderer while leaving provider requests and response validation
  in its search sibling. It owns CSL import and its local lifecycle while the
  application coordinator retains canonical Library refresh and toast policy.
- The citation network panel replaces six internal element references,
  assertion-form binding and option rendering, plus the imperative SVG graph,
  node, edge, assertion, expansion, candidate, and progress renderers while
  delegating its typed intents to the enclosing workspace.
- The citation network workspace replaces four shell and panel references plus
  three coordinator presentation fields with one component reference. It
  removes native filter and close bindings plus the coordinator's snapshot
  assembly helper, six request and mutation methods, and two intent adapters.
  Canonical Library refreshes and toast policy remain in the application
  coordinator.
- The Preview presentation panels replace three internal element references,
  three imperative diagnostic renderers, and the coordinator-local source-map
  lookup helper while leaving Markdown loading and rendering, composed-source
  derivation, editor focus, and file selection in the application coordinator.
- The publication intake panel replaces eleven internal element references and
  its imperative linked-reference, metadata-review, visibility, availability,
  status, and focus updates. It also removes the coordinator's XState actor and
  seven request/workflow methods while leaving canonical snapshot refresh,
  publication navigation, and global toast presentation in the application
  coordinator. Acceptance stays in the machine's accepting state until that
  refresh is acknowledged or rejected.
- The LaTeX import panel replaces ten internal element references, two
  coordinator fields, and imperative root-option, converted-file, diagnostic,
  readiness, status, and busy rendering. It also replaces the separate native
  dialog reference and owns the validated preview and creation requests because
  their payload, progress, validation, and result presentation use only local
  reviewed state. Navigation remains in the application coordinator.
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
  target-preview, and readiness updates while leaving editor target, passage,
  and scope resolution, evidence selection, model requests, workflow state,
  results, and status policy in the application coordinator.
- The PDF highlight import panel replaces five internal element references,
  imperative candidate-card rendering, DOM-based review collection, and scan
  and import busy updates. It also replaces the coordinator's duplicate
  detection-artifact field, PDF inspection and duplicate filtering workflow,
  active-reader validation, import request, and import failure handling. The
  application coordinator retains canonical Library refresh and completion
  toast policy.
- The project-file action components replace seven button references, seven
  direct bindings, and coordinator-owned delete availability with two component
  references and one typed event protocol. The coordinator retains active-file
  identity, resource checks, dialogs, upload selection, mutation, deferred
  deletion, and toast policy.
- The project file dialog replaces seven internal element references and
  imperative file and folder operation configuration. Its completed outcome also
  removes the coordinator's duplicate operation-mode and folder-target fields
  and file/folder request helper, and its deletion method removes the file DELETE
  request while leaving resource availability, collaborative include-target
  capture, deletion grace and Undo coordination, snapshot application,
  selection, rendering, and toast policy in the application coordinator.
- The project template save dialog replaces seven internal element references
  and imperative replacement-option, value, status, focus, and cancellation
  handling while consuming the starting-point browser's visible template view.
  It also replaces the coordinator's promotion request and response guard. The
  application coordinator retains catalog refresh and toast policy.
- The project starting-point browser replaces seven internal form and action
  element references, coordinator submit, selection-change, cancel, and import
  bindings, title and selection collection, readiness, loading, and error
  updates. It also replaces the coordinator's duplicate template array and
  hidden-ID set while leaving template and project-preview requests, deferred
  deletion, project and import workflows, and navigation in the application
  coordinator.
- The Library discovery search replaces six internal element references and
  imperative form-value, submit-state, progress, count, empty, and error
  handling plus the provider request and response validation. The application
  coordinator routes validated results and retains import mutation and refresh
  policy.
- The workspace settings panel replaces fifteen internal element references and
  imperative entry-file option, profile-value, archive-label, template
  visibility, modal, and nested GitHub-review coordination. It also removes four
  coordinator request methods and owns destructive confirmation while leaving
  navigation, catalog refresh, save-as-template, GitHub synchronization, and
  global toast policy in the application coordinator.
- The shared client HTTP adapter replaces ten copies of response-status and API
  error parsing plus four repeated JSON request constructions. This keeps
  request-owning Lit components small without introducing another dependency.
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
  modal configuration, and the coordinator mutation method while leaving
  evidence availability, canonical project refresh, and toast policy in the
  application coordinator.
- The Library PDF upload control replaces two raw element references, four
  native file and drag bindings, coordinator-owned drag presentation, input
  reset and disabling, duplicate busy state, batch execution, upload transport,
  response validation, partial-failure handling, and retry routing. Its
  companion status replaces imperative progress, outcome-row, error,
  duplicate-action, and retry rendering and owns the ephemeral failed-file
  retry selection. Canonical Library refreshes, duplicate-source navigation,
  and toast policy remain in the application coordinator.
- The Library reference-import control replaces two raw file-input references,
  native change bindings, file reads, transport methods, input reset, and
  duplicate-submit state with one typed refresh-pending boundary. Canonical
  Library refresh and toast policy remain in the application coordinator.
- The Library tools menu replaces three raw element references, three native
  bindings, archive-file DOM reads and reset, and scattered archived-button
  presentation, and now owns archive restore transport, local failure and busy
  state, and refresh acknowledgment. Citation-network opening, canonical
  Library refreshes, and toast policy remain in the application coordinator. The
  coordinator reads the component's canonical archived visibility when loading
  the Library.
- The web source panels replace three internal element references, submit
  binding, URL reset, comparison heading selection, and diff-hunk rendering
  plus the coordinator's capture and comparison requests and response guard.
  Library refreshes and toast policy remain in the application coordinator.
- The project annotation form replaces thirteen internal element references,
  four direct toolbar and citation bindings, imperative composer visibility,
  citation and tool presentation, PDF-option and captured-selection updates,
  status rendering, submitter detection, editing identity, selected-tool state,
  last-stroke undo state, and coordinator note-update transport. It also
  replaces highlight create and extension endpoint selection, transport,
  Valibot response validation, fragment selection, and form/undo-state updates.
  It leaves selection and overlap derivation, viewer draft clearing, manuscript
  linking, canonical refreshes, and toast policy in the application coordinator.
- The Library PDF annotation forms replace seventeen internal element
  references, three submit bindings, cancel and selected-markup action bindings,
  composer visibility updates, DOM-based value collection, and the coordinator's
  duplicate highlight-rectangle and editing-identity fields. They also replace
  seven coordinator highlight, page-note, and selected-markup persistence,
  resolution, and overlap-classification methods, owning stable annotation
  targets, pending state, and retryable local failures. The markup layer's
  interaction state and drawing geometry remain separate from coordinator-
  owned Library refresh, PDF draft and selection clearing, inspector policy,
  and toasts.
- The Library PDF annotation toolbar replaces twelve internal element
  references, tool, input, undo, export, and inspector bindings, and imperative
  active-tool, width-label, availability, count, and expanded-state updates. It
  also owns the guidance associated with each tool plus newest-page-drawing
  derivation and stable undo deletion, removing the coordinator undo-resolution
  and request adapter. It also removes the coordinator annotated-export method
  and installed-app helper by owning file-share and download mechanics from a
  stable artifact target. Gestures remain in the markup layer; canonical
  refresh, inspector policy, and toast presentation remain in the application
  coordinator.
- The Library PDF inspector replaces four shell element references, the direct
  close binding, artifact dataset comparisons, and repeated visibility, status,
  expansion, and details mutations while leaving interactions in the markup
  layer and mutations, refreshes, and close policy in the application
  coordinator.
- The Library PDF annotation list replaces five imperative highlight and markup
  render helpers plus their per-card handlers with one delegated typed action
  stream. It also removes the generic coordinator markup-deletion request by
  owning deletion initiated from a saved markup card. The application
  coordinator retains PDF navigation, project citation and research-share
  workflows, canonical refreshes, and notification policy.
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
  It durably saves the final normalized points only when the active drawing
  pointer finishes. No separate state owner duplicates drawing pointer, point,
  or shape-manipulation state. Note dragging likewise keeps its start
  coordinates, movement threshold, native-default suppression, normalized
  preview position, note identity, pointer identity, completion result,
  transient DOM update, durable move request, pending state, and retryable
  rollback inside the layer. Tool mode, saved-resource selection, note
  composition or editing, and open-card state now live in the same layer,
  eliminating the separate annotation state machine, coordinator-owned
  transitions, coordinator note-move adapter, and coordinator drawing-save
  adapter. The application coordinator retains inspector policy, canonical
  refreshes, and notifications. A prospective note placement similarly remains
  layer-local until a stationary pointer release, when the annotation forms own
  its durable save.
- The Library PDF project-use block replaces its imperative renderer and four
  one-off DOM-construction helpers, then absorbs its remaining canonical
  reference and project-link lookup projection. The application coordinator
  supplies snapshots and retains snapshot application, project-PDF refreshes,
  and notification policy.
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
  references and owns their text and target-tooltip presentation, including
  bounded line counting and file, line-range, caret, and selection wording from
  canonical inputs. The application coordinator retains Yjs authoring-target
  resolution, editor highlighting, assistant refresh, collaboration and offline-
  save policy, and the save-status values those workflows select.
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
  visibility mutations, resource labelling, PDF-mode presentation, and five
  coordinator title helpers. It composes the existing dynamic resource tabs and
  overflow overview from canonical tab and resource inputs while emitting their
  typed intents. The application coordinator retains active-context state,
  authorized Library loading, resource closure, route synchronization, content
  rendering, and resource-panel scroll restoration.
- The workspace surface switcher replaces two button references, native action
  bindings, and ARIA-state mutations. The application coordinator retains
  responsive surface visibility and URL synchronization.
- The workspace layout control replaces the raw select reference and
  coordinator-owned normalization and local-storage access. It owns the
  four-option template, selected value, workspace-scoped resilient persistence,
  and typed layout changes while the coordinator retains surface mutation, PDF
  activation, resize notification, and URL synchronization.
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
  helpers, and DOM-based application selection collection. It now also owns PDF
  extraction, provider preview and acceptance requests, response validation,
  its refinement state machine, request supersession, local busy and retryable
  error state, PDF-metadata persistence, and typed refresh and notice outcomes.
  The application coordinator retains canonical refreshes and toast policy.
- The Library reference PDF rows replace two imperative row render helpers and
  per-artifact open, rights, and secondary-refinement handlers while leaving
  PDF presentation and canonical refresh policy in the application coordinator. A
  secondary refinement intent delegates directly to the owning metadata editor.
- The Library reference research rows compose attached PDFs with private notes,
  highlights, and immutable web captures; own share, revoke, download,
  comparison, pin, diagnostic, and recapture presentation; own share, revoke,
  and project-pin transport plus canonical workspace-response validation; and
  emit typed intents or completed mutation outcomes. Capture and comparison
  intents delegate to the owning web components; the application coordinator
  retains snapshot application, refreshes, and notification policy.
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
  completion-kind discriminator. The application coordinator retains canonical
  project and Library reference sets, context detection, private-Library linking,
  Yjs edits, and caret restoration.
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
