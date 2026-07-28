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
presentation state, element references, and DOM events can leave the browser
composition root. Components emit typed intent or completion events; the
application coordinator retains cross-feature network workflows, canonical
project refresh, cross-feature navigation, Yjs and XState actors, and persisted
domain state. A component may own a bounded request workflow when its complete
lifecycle, payload, validation, progress, and result serve only that component's
local interaction. It may navigate only to a canonical href supplied through
its own authorized inputs or validated request result.

Light-DOM components share one Lit base for first-connection server-markup
cleanup and render-root selection. Non-rendering presenters extend its
controller specialization for empty rendering and typed sibling lookup.
Concrete components retain every domain binding, reconnect action, and effect.
After those ownership extractions, keep the remaining one-instance browser
composition as module-private constants plus one directly invoked Lit startup
promise; do not retain a class, function, or single-use binding wrapper that
adds no encapsulation over module scope. Let the Valibot bootstrap boundary return its derived project API
base and workspace-mode flag, and do not repeat a document-availability guard
after browser bootstrap has already required that document. The fail-visible
startup rejection uses the same unknown-error normalizer as bounded request
owners instead of repeating its fallback branch.

Keep layout interaction in the workspace-layout Lit owner when its policy
depends on canonical component state. It binds the workspace root and Context
owner directly for rail and pane sizing and context-specific persistence, and
consumes the PDF viewer owned by that Context for relayout. One atomic workspace binding establishes its
complete selection, collapse, and resize lifecycle instead of exposing a
supporting non-element manager.

The adopted components own bounded presentation:

- The appearance preference control progressively enhances its server-rendered
  fallback and owns the System, Light, and Dark template, normalization,
  browser-local restoration and persistence, storage-failure tolerance, and
  document-root theme and `color-scheme` projection without application
  startup wiring.
- The import panel owns connected and disconnected account presentation,
  reactive account actions, local field values, account/repository/branch
  discovery requests, validation, stale-request guards, option rendering, form
  submission, readiness, import preview and creation requests, account
  disconnection, preview/status rendering, native dialog lifecycle with an
  automatic connection refresh on open, and typed
  Cancel intent plus canonical successful-result navigation.
- The workspace sync menu owns repository status, relationship tone, Pull and
  Push availability, its bounded read-only connection and status refresh
  lifecycle, interval, validation and stale-request guard, typed Check, Pull,
  Push, and Settings intents, online and active-review refresh policy, settings
  mirroring and preview routing, and completed-mutation refresh coordination.
  The settings owner's atomic workspace binding establishes the menu's
  reciprocal settings owner, coalesced project-refresh service, and ambient
  refresh policy. The menu invokes those owners for settings and preview entry
  and post-Pull project refresh without a second application bind or callback
  projection. The broader settings application entry also installs the
  workspace catalog's trigger and switcher, the project-creation and reciprocal
  template-save lifecycle, and the sharing panel's API and trigger from their
  canonical owners.
- The workspace sync review owns Pull and Publish requests and diff rendering,
  conflict choices, commit-message input, disconnect confirmation, response
  validation, readiness, progress, and one typed completed-mutation event.
- The new-project starting-point browser owns template and existing-project
  groups, template-catalog and existing-project preview requests, project
  creation, personal-template deletion, response validation, post-delete
  catalog refresh, the fetched catalog, optimistic hidden-template state, the
  delayed commit and Undo lifecycle, the derived visible-template view, local
  selection and preview state, bounded preview rendering, local dismissal and
  import handoff, and canonical successful-result navigation. One application
  entry binds the GitHub-import, LaTeX-import, template-save, and toast owners
  atomically with its server-rendered entry trigger and canonical project-
  catalog source, and installs the template-save dialog's reciprocal API,
  source, and toast binding. It owns loading-state
  entry, post-load focus, load-failure presentation, and one-shot browser create
  intent parsing and query cleanup around a typed catalog-
  refresh callback. Every successful refresh reports its derived visible-
  template view through the same template-change outcome used by optimistic
  deletion and Undo, keeping replacement consumers synchronized.
- The workspace sharing panel owns member and capability-link requests,
  response validation and presentation, invitation input and submission,
  clipboard interaction, native parent-dialog lifecycle, and typed notices. It
  binds its sibling trigger and toast owner directly.
- The workspace catalog panel owns project filtering, result and empty-state
  rendering, metadata labels, filter focus reset, and native parent-dialog
  lifecycle. It owns the stable `/api/workspaces` catalog route and atomically
  binds current-project identity, compact switcher, and server-rendered entry
  trigger once. It also owns catalog
  fetch and response validation, retains the one browser catalog projection,
  synchronizes the compact workspace switcher, exposes a read-only catalog to
  settings and template workflows, and derives the single authorized offline
  project row from restored snapshot identity, title, and save time. The
  coordinator retains canonical route navigation.
- The project history panel owns timeline, comparison controls, busy and error
  states, revision cards, inspectors, and typed revision-operation intents.
- The project history dialog composes the server-rendered modal and reactive
  history panel and owns its XState actor, modal lifecycle, timeline and
  operation requests, response validation, confirmations, request generations,
  stale-response rejection, busy and error state, canonical successful branch
  navigation, post-restore reload, and typed notice outcomes. Its modal close
  lifecycle is internal and emits no unused external event. It binds its sibling
  trigger and toast owner directly after the trigger's atomic workspace binding
  configures that relationship.
- The project history trigger owns the monotonic presented revision and its
  badge, emits one typed open intent, and routes revision-dependent collaborator
  data, highlight refresh, offline scheduling, and active-candidate refresh
  through bound owners. Its workspace binding supplies itself and the global
  toast to the history dialog and consumes the offline owner directly.
  Collaboration retains server revision authority; the application coordinator
  retains toast presentation and non-history browser navigation policy.
- Reused writing-workflow panels own research-question and reviewer-response
  Markdown-to-item adaptation, counts, empty states, action labels, reviewer-
  response letter derivation and browser download. They bind project-file and
  notice capabilities directly, own canonical path and template choice, and
  route opening and source selection through the project-file owner.
- The assistant result panel owns validated-table previews, clarity input,
  transient revision choices and their captured passage, source-revision,
  evidence, provider-continuation, or table-target context, table generation and
  returned-shape validation, clarity, ideation, and phrasing provider requests,
  reference-discovery query formulation and registry transport, validated cards,
  the shared CSL import adapter, duplicate-submit gating, local save progress and
  retryable failures, refresh-pending state, and complete typed continuation,
  selection, insertion, and canonical-refresh outcomes. Its reference cards use
  the same stateless Lit template and save-state vocabulary as Library discovery
  without sharing request lifecycle state.
- The assistant-generation presenter routes all registered operations across
  the typed task, result, and candidate-list owners from coordinator-supplied
  canonical generation inputs. It owns the browser-local assistant XState
  actor, busy and decision availability, source-staleness transitions, status
  presentation, task and model-settings subscriptions, evidence selection and
  focus guidance, generation routing, clarity continuation, captured-table
  validation and portable spacing, promoted-revision persistence sequencing,
  candidate-review event handling, generated-candidate refresh-before-open,
  and completed-decision refresh, recovery, notice selection, and workflow
  completion. Candidate persistence remains in its list owner and provider construction derives from validated model-settings state. It derives canonical candidate, project-PDF, project snapshot,
  Library-refresh, assistant-tab, and no-evidence notice routes from the
  context-resource presenter already supplied by its workflow binding instead
  of exposing a parallel resource stage or nullable lifecycle state; the same
  atomic binding stores the derived routes instead of repeating them across its task,
  result, and candidate workflow bindings. One production application entry
  atomically installs the API base, collaboration stability, authoring and
  workflow owners, candidate panels, interactive result, model and task
  controls, and evidence selection. Narrow authoring and workflow rebinding
  remain available without making production startup assemble partial stages.
  Bind the remaining Insert-menu, Context,
  Research-rail, toast, and canonical refresh owners directly instead of a
  workflow callback bag. Bind the Context owner directly for assistant activation and decision
  re-presentation. Bind the canonical project-file, editor-status, and history
  owners once as authoring sources, with collaboration stability as a separate
  non-DOM service, instead of projecting file identity,
  manuscript text, target range, source revision, and stability through getter
  adapters; derive scoped and insertion passages, generation
  input, availability, target presentation, captured-table validation, and
  snapshot availability inside the presenter. The context-resource presenter
  delegates candidate review presentation with only candidate identity,
  canonical snapshot, and scroll position; the assistant presenter supplies
  its owned decision, revision, and stability state. The application coordinator retains
  authorized Yjs mutation, editor selection, remembered authoring selection,
  canonical refresh execution, context-state mutation, and notice presentation
  through narrow typed callbacks.
- The project map panel owns provenance-lane rendering, measured SVG connector
  geometry, responsive relayout, focus and hover emphasis, and a typed resource
  selection intent.
- The project map workspace composes search, provenance-map, and typed-connection
  panels; owns resource and link totals, search-versus-overview presentation,
  mode visibility, focus entry, kind-qualified resource-key parsing, and one
  exhaustive typed resource-navigation binding. It derives the knowledge graph
  from resolved canonical workspace inputs and exposes one workspace-
  presentation boundary to the application coordinator.
- The candidate review panel resolves the active candidate id against the
  canonical workspace snapshot and owns before/after and provenance rendering,
  evidence-link availability, local revision and claim-draft applicability,
  live collaboration and workflow decision availability,
  decision gating, encoded apply and reject transport, retryable same-candidate
  failure state, progress, local scroll state, decision-specific completion
  wording, and typed decision-start, completed-decision, and evidence-navigation
  outcomes. The assistant-generation presenter retains assistant workflow
  transitions, binds the Context owner directly, activates or re-presents the
  assistant Context after decisions, and refreshes its own availability. The
  coordinator retains canonical refresh and notification policy. The server
  remains authoritative for mutation safety.
- The publication context panel resolves the active publication id and owns
  scholarly metadata, linked-paper and project-PDF option derivation and
  rendering from canonical reference inputs, citation readiness, local scroll
  state, and explicit project-PDF link and unlink transport, duplicate-submit
  gating, pending and retryable failure state, and one typed workspace binding
  for citation, paper-navigation, and completed-relationship outcomes.
- The context resource presenter selects and synchronizes the publication,
  candidate, project-PDF, private-Library PDF, or shared-reference PDF owner from
  one canonical context projection. It composes the tab strip and derives the
  active resource owner before presenting that resource, then retains that
  derived selection for layout, citation, PDF, and assistant consumers instead
  of making the coordinator search canonical tabs again. It also retains the
  resolved active private-Library artifact for page routing, selection capture,
  and saved-markup projection instead of making the coordinator search the
  Library catalog again. It derives authorization identity sets for
  those resource kinds from canonical project, Library, and linked-PDF inputs.
  It also resolves source and Preview citation keys against its bound project,
  routes a unique linked PDF and locator page or publication, and dispatches
  grouped and missing-citation notices through its existing workspace binding;
  tab reconciliation remains coordinator navigation policy. When restoring a
  supplied context route, it activates a safe Preview baseline, resolves fixed
  contexts or the matching canonical publication, project PDF, private-Library
  PDF, linked reference PDF, or candidate, emits the typed open effect, and
  returns to Preview with a notice after failures. URL parsing remains in the
  bounded route adapters, while workspace and standalone-Library owners supply
  history effects through structural bindings. It also resolves the
  PDF-only layout's active-or-first authorized project/private PDF choice and
  empty state through the same catalogs and route effects while layout state
  remains application policy. Project, private-Library, and linked-reference
  PDF opens no longer round-trip through application methods: the presenter
  prepares canonical context, sequences workspace or standalone-Library route
  effects, and loads the active viewer, while the Library workspace supplies
  concrete standalone URL mutation. Project-map
  navigation reuses those catalog lookups,
  while annotation edit/open intents resolve to the canonical annotation and
  its project PDF and active note intents resolve to bounded notice text from
  canonical project shares. Typed publication-paper choices dispatch through those same
  project, private-Library, and shared-reference PDF routes. It derives
  active-publication citation readiness and resolves explicit active-publication
  or sole-linked project-PDF citation intents to a key and optional page locator
  while leaving Yjs syntax insertion to the coordinator. It resolves citation keys and sole-linked-PDF page
  locators against the same canonical project catalog and emits the matching
  project-PDF or publication open effect. It restores resource scroll and captures fixed/resource
  scroll plus supplied viewer page and focused-annotation state into the
  canonical context, projects page changes into canonical PDF context and
  page-local private markup state, and applies workspace and standalone-Library
  replacement through its bound route owners without directly mutating browser
  history,
  supplies citation and intake context, switches the project-annotation versus
  private-inspector presentation, owns private-PDF inspector context,
  artifact-change markup reset, toolbar counts and export target, page-local
  saved-markup and newest-drawing undo projection, and synchronized tool,
  inspector open/close, highlight/note draft composition and clearing, and
  highlight, note, and markup edit/selection presentation across the markup
  layer, inspector, and toolbar. It binds their private-PDF action and outcome
  streams and owns local completion presentation, private-highlight citation
  readiness feedback, saved-highlight artifact lookup and post-navigation
  inspector status, collision-safe project-reference preparation, and
  validated link transport. Its route binding consumes the canonical Yjs
  document, collaboration and refresh capabilities, plus project-file,
  editor-status, history-trigger, citation-control, Library, and toast owners
  directly instead of receiving a parallel callback coordinator. Its private-
  PDF project binding likewise consumes API scope plus editor-status and
  reference-Library owners directly for caret readiness, snapshot acceptance,
  markup completion, and artifact opening instead of wrapping those effects or
  its own PDF navigation in callbacks. It
  delegates Yjs citation insertion and passage navigation to their bound owners
  and applies viewer-only draft clearing, text-
  selection, and private-markup selection effects directly through the viewer
  installed by its atomic project-knowledge binding and synchronizes the bounded
  evidence, annotation, publication, claim, comment, and candidate owners from
  the canonical workspace snapshot. From its canonical project-file, Library,
  editor-status, assistant, surface-route, and workspace-layout owners plus the
  nullable project API base, it derives candidate presentation from
  the already-bound assistant rather than accepting a duplicate presenter
  binding, reconciles authorization, and owns
  complete workspace-resource presentation, assistant-availability refresh,
  and incidental route synchronization. Standalone-Library mode derives from
  the absent project API base instead of crossing the binding separately. Let
  it also project coordinator-resolved
  evidence links, claim links, comments, and project-map inputs across those
  composed owners after Preview rendering while the coordinator retains render
  timing. Let it configure the project-map
  workspace and bind annotation, claim, candidate, note, PDF, and publication
  routes across its composed Lit owners as part of the atomic project-knowledge
  lifecycle. Project-file, workspace-switcher, sharing-panel, Preview, and
  canonical Library destination owners are supplied together under their
  application-registry names, and the presenter owns the Preview context switch
  before section scrolling. Let it also
  configure the manuscript-comment, project-evidence, claim-list, publication
  list/context, private-PDF inspector, annotation toolbar, and markup owners.
  Bind annotation intake/workflow, comments, evidence, claims, publications,
  project-map navigation, the PDF viewer, and private-PDF mutation and markup
  streams together as one project-knowledge lifecycle so shared authoring,
  mutation, citation, paper, map, viewer, and private-PDF routes are installed
  atomically, and own annotation-form cleanup and selection,
  edit and PDF routes, fragment-removal refresh sequencing, child-specific
  mutation failure copy, and notice dispatch. Bind that complete lifecycle
  against the same project API and canonical Library owner. Route comment, claim, evidence,
  publication, citation, paper, and private-PDF intents among those composed
  owners. Bind publication-list management directly to the reference-Library
  workspace; bind private-PDF project mutation outcomes directly to the same workspace's
  canonical apply-project lifecycle, deriving the inspector route from that
  already-bound workspace instead of adapting or binding either route in the
  application coordinator. Bind
  canonical project refresh, authoring state, passage navigation, citation
  insertion, and notice presentation once through the resource-route owner
  binding. Project, Library,
  and linked-reference PDF catalogs are not repeated on that coordinator; the
  presenter consumes the first two from its canonical context source and the
  latter from its owned loading state without feeding it back through the
  context source. The presenter
  validates synchronization and a current passage before delegating claim or
  annotation link transport to the composed owner. For incoming links it
  resolves the stored Yjs anchor, rejects stale targets, distinguishes exact
  from changed text, and selects the notice. Keep canonical Yjs document and
  selection effects, revision and collaboration authority, mutation
  consequences, canonical refresh transport, Library management, and the
  notification outlet in the application coordinator. Through a
  narrow viewer binding it derives
  authorized active-PDF loads, synchronizes project annotations and private
  highlights, rejects stale completions, retains rendered context and project-
  PDF identities, opens the viewer, restores resource scroll, and presents
  active-resource failures. It also routes captured selections to the private-
  highlight composer or project-annotation form from those retained identities,
  delegating project-selection persistence through the viewer binding. The
  resource presentation also owns bound linked-reference PDF catalog loading,
  validation, storage, authorization projection, and optional downstream
  presentation. The coordinator retains canonical snapshot acceptance, Library
  refresh and load timing, active-page gestures, private markup drafts, Yjs
  citation insertion, workspace-route synchronization, navigation transitions,
  remaining viewer effects, and notification policy.
- The knowledge search panel owns query capture, empty, result, and error
  presentation, and typed search and resource-selection intents. Its enclosing
  project-map workspace owns the authorized search request, response validation,
  and search lifecycle because the same state controls graph-overview visibility.
- The claim list panel owns the Claims collection shell and count, claim,
  evidence-link, passage-link, grounding selection, create availability,
  canonical snapshot projection, live passage-resolution presentation,
  grounding-choice focus, empty-state, action presentation, confirmed deletion
  and claim-passage-link transport, duplicate-delete gating, local pending and
  retryable failure state, the nested claim editor's create/edit lifecycle, and
  one typed workspace binding for completed mutation and navigation outcomes plus
  a separate assistant evidence-selection binding. It also owns addressed-card
  reveal and optional focus.
  The coordinator supplies browser-local evidence selection and the link
  workflow's Yjs-validated typed passage input.
- The manuscript comment panel owns composer body and status state plus comment,
  anchor-status, empty-state, action presentation, and open-comment count
  derivation with typed open intents. Through one coordinator-bound typed
  workspace contract, it owns create and re-anchor action routing and transport,
  collaboration-stability and selection gating, action-specific feedback, body
  reset, local retryable failure state, self-contained resolution transport,
  duplicate-resolution gating, and typed passage-navigation and completed-
  mutation outcomes. The coordinator supplies one read-only authoring snapshot
  through the enclosing resource presenter, which owns mutation refresh
  sequencing, success/fallback notice selection, passage navigation, and notice
  routing through its one canonical route. The coordinator retains Yjs selection resolution, revision and collaboration authority, canonical refresh execution, navigation, and notification presentation.
- The project publication list owns the References collection shell and count,
  reference metadata, alias and DOI labels, empty-state, and action
  presentation. It also owns DOI-enrichment transport, duplicate-submit
  gating, pending and retryable failure state, and one typed binding for open,
  manage, and completed-enrichment outcomes. It reads publications and
  project-reference links directly from the canonical workspace snapshot input.
- The model candidate list owns revision and claim-draft summaries, empty-state,
  revision and claim-draft provider requests, typed creation transport, fixed
  adapter and prompt-version derivation, operation-specific response validation,
  and a typed review-opening intent. The coordinator retains authorized target
  and evidence derivation, canonical refresh, context navigation, workflow state,
  and decisions.
- The context-tab overview owns overflow visibility, counts, tab summaries, and
  typed activate and close intents. It shares one bounded action contract and
  dataset parser with the resource-tab strip.
- The composed context tab strip owns fixed-tab presentation and keyboard
  focus, delegates resource and overview presentation, and derives fixed and
  canonical resource titles, visibility, resource labels, PDF-mode state, and
  fixed-panel scroll capture and restoration from each canonical tab update for
  all controlled context panels. It also routes fixed-tab and delegated
  resource/overview activate and close intents through one typed navigation
  boundary.
- The context resource-tab strip owns resource tab and close-action markup,
  active-state presentation, panel associations, and typed activate and close
  intents while retaining a semantic event name distinct from the overview.
- The project evidence panel owns project-PDF and annotation grouping, counts,
  expanded state, grounding selection, live passage-resolution presentation,
  grounding-choice focus, stroke controls, project-PDF file input, validation
  and import transport, guarded legacy PDF and annotation removal transport,
  highlight-fragment update and deletion transport, trimmed-quote validation,
  annotation-passage-link transport from a coordinator-validated typed passage,
  duplicate-mutation gates, pending and retryable failure state, and typed
  workspace navigation, mutation, notice, and completed outcomes plus a separate
  assistant evidence-selection binding. It projects its PDFs,
  annotations, claim-evidence links, passage links, and publication-PDF links
  directly from the canonical workspace snapshot plus browser-local evidence
  selection, and owns addressed annotation-card reveal.
- The project tree panel owns path filtering, sorted folder, file, and image
  rows, active and entry presentation, the workspace quick-open shortcut and
  selection, action menus, listener teardown, encoded empty-folder and image
  deletion transport, response validation, optimistic hiding, delayed commit
  scheduling, Undo restoration, failure notices, and typed file, folder, image,
  and quick-open intents. It exposes hidden image identities to Preview and
  returns validated snapshots through the project-file owner's shared mutation
  binding. The coordinator retains snapshot application, cross-feature
  rendering, and the toast outlet; the project-file dialog owns supporting-file
  deletion and upload completion.
- The project image upload control owns the image file input, sequential upload
  transport, response validation, duplicate-submit gating, local progress and
  retryable failure state, and a typed completed outcome carrying the final
  validated workspace snapshot. The project-file dialog owns tree-image
  projection into relative Markdown syntax and a completion message, plus the
  upload and tree mutation outcome binding. The project-file owner retains the
  canonical snapshot needed to resolve its active file, requested folder,
  dialog inputs, deletion eligibility, and relative image projection. It also
  projects the visible file collection with snapshot or live collaborative
  content for Preview, manuscript-map, and collaborator-selection consumers
  from its bound collaboration session and session-owned Yjs document, deriving canonical
  text keys, readiness, and validated snapshot loading internally. The
  project-refresh binding consumes the canonical element-registry owners
  directly, owns and exposes the shared coalesced refresh coordinator, retains
  collaboration and offline persistence as explicit non-DOM services, and
  derives its asset base from the configured workspace API. Its atomic
  application entry also installs the Context/editor and settings/catalog roots
  before Preview, History, manuscript-map, and layout from the same registry.
  It then prepares the offline shell and owns the standalone-Library versus
  project-workspace startup branch, leaving one awaited Lit entry in the browser
  composition root. The
  offline service's browser factory derives its IndexedDB store and hosted-
  logout binding from identity, workspace, collaboration, and owner inputs so
  those browser policies do not remain in the composition root. The
  coordinator retains snapshot application, cross-feature rendering, Yjs
  insertion, caret and focus authority, and the toast outlet; the project-tree
  panel owns image deletion.
- The editor Insert menu owns scholarly-syntax choices and their displayed
  templates, relative include-file option rendering, empty state, and local menu
  closing. It binds the editor-status and notice owners directly without an
  intermediate binding object; editor status
  projects the live insertion target from its owned source, caret, and passage
  state instead of requiring coordinator callbacks. From that target it owns passage-aware link
  adaptation, template selection ranges, image-template and immediate relative-
  include insertion projection, and local completion notices. The application
  editor-status authoring lifecycle binds this menu and its canonical notice
  owner atomically instead of leaving a separate application setup stage. The
  coordinator retains editor focus, asynchronous cross-file include
  continuation, and the global toast outlet.
- The source completion list owns citation and include option presentation,
  one atomic workspace binding for the editor, citation-scope control, project
  acceptance owners, and API route, bound-editor change subscription plus citation and include context detection,
  candidate ranking and display adaptation, empty-state hiding, popup
  positioning, hover and keyboard selection, active-descendant state,
  selected-option scrolling, local Escape and blur dismissal, private-Library
  loading and response validation for that scope, and project acceptance.
  Relative includes are applied immediately. Private-Library citation
  acceptance binds the project-file, editor-status, insertion, and toast owners
  through the same lifecycle instead of adapting their operations in the application coordinator.
  acceptance preserves the collaborative range, requests project linking,
  delegates canonical snapshot application, resolves the range again, applies
  the citation through the editor insertion owner, and presents completion.
  The editor-status owner observes source interaction directly for authoring-
  selection, presence, and model-availability consequences. Its authoring
  binding consumes canonical element-registry owner names directly;
  the collaboration socket remains a separate non-DOM scheduling capability.
  The same atomic application binding installs the bounded Vim control against
  the canonical source and shell, the Insert menu against editor status and
  toast, and source completion against its API, scope, project, insertion, and
  notice owners.
  Its pure citation-completion domain adapter owns
  project and available unlinked Library candidate construction from canonical
  reference inputs, while the component owns project-relative include candidate
  construction from canonical files and the active file id.
  `WorkspaceApp` supplies narrow mutation, range, insertion, and notice
  capabilities while retaining canonical snapshot and Yjs authority.
- The manuscript map panel owns summary metrics, heading outline, structural
  cues, local editing-pass selection, editing cues, canonical composed-source
  derivation for the guide, research-diary and writing-workflow sibling
  projection, composition source-map translation, and file-qualified source-
  range selection through the project-file capability in its existing
  presentation binding. One application entry also binds the diary and both
  workflow siblings to that canonical project-file owner and the toast owner,
  so production cannot omit a workflow capability. The project-file
  application entry installs that reciprocal manuscript-map lifecycle beside
  its Preview and History companions.
- The Library discovery results panel owns provider, metadata, verification,
  metadata-to-CSL projection, import transport, duplicate-submit gating, local
  save progress and retryable failures, refresh-pending state, and a typed
  refresh outcome. It shares only result-card presentation with assistant
  discovery; transport, completion copy, and refresh policy remain local.
- The reference Library workspace composes its bounded discovery, import, PDF
  intake, metadata, personal-field, citation-network, web-source, archive, and
  unidentified-PDF owners. It owns their refresh completion, success/failure
  notice selection, alternate metadata refresh, local request finalizers,
  archive-aware canonical Library loading, response validation, and the single
  browser snapshot projection plus standalone route lookup and focused-reference
  restoration, including archive-aware recovery, duplicate-upload source reveal,
  and missing-reference feedback. Workspace identity, optional project API
  scope, canonical feature owners, citation-network configuration, and PDF-upload
  status ownership bind atomically,
  while delegating context activation, history repair, PDF viewer
  navigation, refresh timing, and shared notice presentation through typed callbacks.
- The citation network panel owns manual source and relationship choices, graph
  geometry, source and edge cards, assertion provenance and review controls,
  snowball candidates, and local candidate-save progress with typed record,
  expansion, review, and save intents.
- The citation network workspace composes that panel with its Reference trail
  shell and owns visibility, current-project filter state, loading, request
  generations, response validation, assertion recording and review, expansion,
  candidate acceptance, prompts, local progress and failures, the latest
  network and expansion snapshots, close behavior, reference synchronization,
  canonical bibliographic-title display projection, and typed notice or
  Library-refresh outcomes.
- The Preview context status and diagnostics panels derive file-mode and issue
  summaries from canonical preview and diagnostic inputs, and own
  unavailable-state presentation, composition and renderer diagnostic cards,
  source-map resolution, and typed source-range intents.
- The workspace Preview owns its light-DOM article and diagnostics surface,
  lazy Markdown-runtime loading, stale-render rejection, rendered or escaped-
  source presentation, renderer diagnostics, isolated-file heading-number
  projection, and authorized local-image resolution. Its bound project sources
  expose the canonical Yjs document, snapshot, project-file owner, and hidden-
  asset owner once. Preview owns one document-wide Yjs update subscription with
  disconnect teardown, replacing coordinator text observers and duplicate local
  render requests. It derives live source and bibliography, resolved anchors,
  publication composition, active-file preview, synchronized status and
  source-map sibling projection, manuscript-map content and live export-statistics
  companion projection, and available-outcome projection of a supplied
  anchor-resolved workspace into research companions from the same project
  render outcome, authorized local-image resolution, viewport-relative source-span
  lookup, centering, transient target emphasis, anchor scrolling, interactive-
  click classification, source-offset extraction, and typed source or citation
  intents. It routes those intents and its nested diagnostics panel's source-
  range selections directly through the sync, Context, and project-file owners
  already present in its project binding; no duplicate navigation callback bag
  remains. It also reads the canonical project snapshot from that project-file
  owner instead of accepting a parallel snapshot callback. The coordinator
  retains canonical project-file and Yjs source authority, Yjs anchor
  resolution, source-map translation, publication resolution, citation
  navigation, and the resulting transitions.
- The preview navigation control owns browser-local top-navigation visibility,
  storage restoration, toggle and restore presentation, active-context
  availability, and focus handoff between its spatially separated controls.
- The publication intake panel owns DOI and citation-key input, reviewed
  metadata, active-PDF linked-reference projection and rows, its XState workflow
  actor, preview and acceptance requests, response validation, stale-response
  guards, status, busy state, focus transitions, and typed refresh-pending
  acceptance and reference-opening outcomes consumed by its annotation-form
  parent.
- The LaTeX import panel owns archive, title, and root input, bounded client
  validation, converted-file and diagnostic review, preview identity, busy and
  status presentation, native dialog lifecycle, authenticated preview and
  creation request lifecycles, Valibot response validation, local dismissal,
  and navigation to the successful response's canonical workspace href. One
  local state reset establishes both construction and reopened-dialog defaults.
- The GitHub import and detailed sync-review panels own their opaque preview
  identities and confirmation working state. The import panel additionally
  owns its read-only connection and repository-picker discovery lifecycle plus
  import preview, creation, and account-disconnection requests because their
  payloads, validation, progress, and results are local to that component. The
  import panel consumes successful OAuth/install query results once from its
  connected lifecycle, opens itself after its template is ready, removes the
  one-shot query without application startup wiring, closes its own dialog, and
  owns successful-result navigation. The
  sync menu owns its read-only connection and status request lifecycle because
  its interval, validation, stale-request protection, and primary result
  presentation are local to that component. The sync review owns its Pull,
  Publish, and disconnect request lifecycle for the same reason, while the
  shared Valibot contract boundary validates its serialized preview and Publish
  confirmation results. It emits only completed mutations; the sync menu's
  explicit workspace binding owns refresh
  pause policy, preview entry points, canonical project refresh after Pull, and
  status refresh after every mutation. The application coordinator retains the
  settings view and canonical project-fetch implementation.
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
  phrasing purpose, structured-table inputs and their typed normalization,
  parsing, operation-specific generation readiness from canonical availability
  inputs, operation-specific copy and visibility, target-preview wording and
  truncation from canonical target inputs, and typed change and generation
  intents.
- The PDF highlight import panel owns detection, empty, mixed-source, error,
  saved-highlight overlap filtering, review, selection, private-note, stable
  encoded import transport, duplicate-submit suppression, retryable failure,
  busy and completion presentation, plus its explicit artifact and reference
  context. It ignores stale asynchronous results after that identity changes
  and emits only a typed completed-import outcome.
- The project file dialog owns file and folder operation copy, initial path,
  active operation mode and stable mutation target, focus, cancellation,
  atomically bound project API, canonical presentation owners, and narrow
  layout capability, including project-image upload transport configuration
  from that API authority,
  create and rename transport, file deletion transport, content-bearing
  workflow-file lookup, existing-file selection and focus, lazy creation and
  created-file Guide navigation, shared
  response validation, created-path verification, duplicate-submit gating, local
  busy and retryable failure state, applies the validated workspace through its
  shared mutation binding, and presents completion through its bound toast
  owner. For create-and-include it retains the one-shot insertion
  continuation across open, retry, success, and cancellation and derives the
  project-relative directive from the active and created paths. It also owns
  supporting-file optimistic hiding, the
  deletion grace period, Undo and failed-commit restoration, and exposes the
  hidden-file projection. Its presentation binding fans one canonical snapshot,
  visible file collection, and active/entry state into the project tree, Insert
  menu, source completion, file-action menu, image upload, source, authoring
  mode, and rail tabs. It owns project-range activation across file or entry
  fallback, Write-mode entry, normalized editor selection, explicit authoring
  and range reveal, image insertion, and quick-open sequencing directly through
  those owners. The workspace-layout control remains the narrow rail-collapse
  capability and is installed last by the project-file application entry so its
  readiness publication follows every preceding project binding. The same
  presentation binding supplies the assistant, editor, Preview, route, and
  notice owners. File activation retains
  the latest projection inputs, reprojects the canonical snapshot with an
  explicit editor-reset signal, then refreshes assistant availability, resets
  and renders Preview, and replaces the canonical route directly. The owner also
  accepts response-or-snapshot project mutation results, validates and installs
  the canonical workspace, and awaits one argument-free post-accept effect. The
  owner also uses one atomic application entry for its API base, workspace
  mode, presentation owners, collaboration session, and offline lifecycle,
  thereby binding snapshot transport, source, bibliography, revision, Preview,
  Context, catalog, and connection capabilities once. That application entry
  also installs the reciprocal Preview project binding and History trigger
  workspace binding from the same canonical Yjs, API, owner, and offline
  capabilities;
  it derives initial load from absent snapshot state and owns bootstrap-versus-
  refresh presentation, snapshot installation, Context presentation, offline
  scheduling, and linked-PDF refresh order. Through the same binding it owns
  restored collaboration state, revision, catalog, snapshot, Context,
  connection, and Preview projection. It also owns offline-first workspace
  opening, initial source and bibliography locking, catalog and project refresh
  failure policy, revoked-access cleanup, and restored-offline fallback. The
  same Lit owner sequences route restoration, ambient GitHub refresh,
  collaboration connection, and the one-shot browser creation request after
  project opening. The connection owner remains the only unlock authority. The coordinator retains workflow-template selection, active
  Y.Text/editor authority, Yjs editing, transport construction, and the notification outlet.
  The project-file owner retains and exposes the single accepted browser
  snapshot instead of the coordinator storing a duplicate.
  The dialog owns active-file identity, entry fallback, and hidden-file
  selection eligibility.
- Reused project-file action components own the rail and editor-menu action
  presentation, entry-file delete availability, and one typed create, include,
  rename, delete, folder-create, or image-upload intent contract.
- The project template save dialog owns replacement choices, local name and
  description values, loading and replacement copy, focus, cancellation,
  the supplied template-loader lifecycle and retryable load errors, promotion
  requests, response validation, local busy and error state, and the bounded
  create-or-replace outcome notice handed directly to its bound toast owner. It
  binds its project API, canonical template source, and toast owner atomically
  instead of exposing partial configuration stages.
- The workspace settings panel dismisses itself and hands its current project
  title directly to the template-save workflow.
- The project starting-point browser owns project title, template and existing
  project choices, catalog loading, project-preview loading, project creation,
  personal-template deletion, response validation, post-delete catalog refresh,
  optimistic hiding, delayed commit, Undo restoration, failure notices, preview
  and loading state, create readiness and status, local cancel and pre-handoff
  dismissal, canonical successful-result navigation, and a typed import
  binding.
  It also owns
  its native parent-dialog opening, closing, focus containment, listener
  teardown, and return-focus lifecycle. It binds the workspace-catalog owner
  directly and reads its live catalog instead of accepting a parallel catalog
  getter.
- The Library discovery search owns query inputs, publication-type choices,
  provider requests and response validation, duplicate-submit gating, progress
  and result-count copy, and typed validated-result events.
- The workspace settings panel owns title, entry-file and publication-profile
  values, their view derivation from the canonical workspace catalog, snapshot,
  hidden-file set, and workspace identity, settings persistence,
  archive/restore, duplication and permanent deletion requests, destructive
  confirmation, local busy and error state, archive and template visibility,
  modal lifecycle, the nested GitHub-sync presentation boundary, canonical
  post-request navigation, and its sibling entry trigger. Its typed workspace
  boundary binds the catalog, project-file, template-save, GitHub, and sharing
  owners; its application entry installs the catalog and sharing sibling
  lifecycles, and the panel reads their live projections and invokes their
  operations directly.
- One shared client HTTP adapter owns same-origin JSON serialization, supported
  write methods, non-success parsing, Valibot validation of the bounded API
  error contract, and caught-value fallback messages used by request-owning
  components and the application coordinator.
- The reference Library filter panel owns query, type, reading,
  organization, project-linkage, completeness, and sort values, dynamic type
  choices, project-linkage derivation from canonical project-reference inputs,
  canonical filtering and sorting, result counts, reset behavior, and a typed
  filter-change intent.
- The composed reference Library workspace starts workspace or standalone mode
  through one boundary that establishes its workspace identity, optional project
  API scope, feature owners, nested component bindings, and standalone browser
  history before any conditional load. It owns canonical presentation
  synchronization across the filter, result list, citation network, and
  unidentified-PDF queue; filter-driven rerendering; focused-reference reveal;
  result settlement; derivation of project-reference and research-share inputs
  from canonical project and owned Library snapshots; nested network and
  identification lifecycle delegation; direct-reference activation, refresh,
  archive-aware focus, and successful-route sequencing; routing for summary,
  personal-field, metadata, PDF, research, network, identification, and
  standalone Library-route outcomes; and the apply-project-notice sequence for
  Library-originated project mutations. General Library entry also owns
  activation, optional standalone-route entry, and canonical refresh sequencing.
  Metadata completion refreshes the bound Library itself before requesting the
  remaining canonical project refresh, removing an application round trip.
  Standalone startup binds browser history, projects the Context-only shell and
  private connection state through the direct workspace-surface and connection-
  status owners, opens the Library, and restores the current route without an
  application-built shell adapter.
  It parses the current standalone route and owns root and addressed-reference
  root, addressed-reference, private-PDF, and active-page history mutation plus
  browser-history restoration subscription and lifecycle teardown. The
  workspace also binds the canonical project-file, context, route,
  web-comparison, and toast owners once, reads the live project snapshot
  directly, then owns Library
  refresh, linked-PDF refresh,
  authorization reconciliation, project and context presentation, settlement,
  and replace-route sequencing. It invokes PDF navigation, web comparison,
  project snapshot acceptance and refresh, and notice presentation through
  those owners without an application callback bag.
- The model provider settings panel owns connection, endpoint, model, and
  reasoning-effort values, browser-local persistence, Valibot-backed saved-value
  restoration with bounded per-field fallbacks, dynamic model choices,
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
  visibility and its local toggling, export links, and typed refresh, navigation,
  and filter outcomes.
- The web source panels own URL capture and reset state, capture and comparison
  requests, comparison-response validation, duplicate-submit guards, local
  progress and failure state, readable-text comparison presentation, and a
  typed captured outcome. Their capture API accepts only the strict Valibot-
  validated URL request shape before applying public-URL normalization.
- The project annotation form owns its complete composer: visibility,
  publication-intake composition, citation availability, highlight-tool and
  undo state and presentation, active annotation identity, visible-PDF choices,
  captured quotation fields, highlight creation and stroke-extension transport,
  Valibot response validation, optional note input and persistence, local save
  status and retryable failures, paint-versus-erase tool guidance and selection
  feedback derived from its local tool and canonical capture, citation
  availability derived from the active PDF and canonical publication-PDF
  links, same-PDF/page saved-stroke overlap classification, ordered removal
  routing, paint-versus-erase capture persistence, no-match and completed-
  erasure status, and typed completion outcomes shared by capture and note-save
  completion. The context-resource presenter applies the form's tool and draft-
  clearing effects through its bounded viewer, owns intake refresh plus
  completed-workflow refresh, optional manuscript-link, and notice sequencing,
  routes citation and evidence-panel intents across its composed Lit owners,
  validates supplied authoring state, and delegates passage-link transport to
  the appropriate child while canonical refresh execution and notice
  presentation remain application inputs.
  The form also owns local toolbar tool commits, viewer-highlight edit/reveal-
  versus-erase routing, completed undo-state presentation, nested publication-
  intake PDF projection, refresh acknowledgement, and one typed workflow binding
  for tool, undo, citation, and completion outcomes or intents. The presenter
  supplies intake API configuration, canonical publication lookup, navigation,
  and notification routes while the application coordinator supplies only
  resource refresh.
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
  annotation component composition, typed close intent, and nested project-
  mutation completion routing.
- The Library PDF annotation list owns saved private-highlight and markup cards,
  empty state, comments, share and citation availability, and typed navigation,
  edit, and cite intents. It also owns research-share and revoke transport,
  canonical workspace-response validation, completed mutation outcomes,
  saved-markup card deletion, stable encoded targets, list-wide pending
  suppression, retryable card-local failures, and a typed deletion outcome.
- The Library PDF markup layer owns saved and draft drawing SVG, note pins,
  tool, saved-resource selection, note-composition, and open-note-card state;
  page-local saved-drawing, note, and stable drawing-target projection from
  canonical artifact and markup inputs; live draft geometry updates; note
  movement and focus restoration; active interaction attributes; pointer normalization to page coordinates;
  coalesced-sample accumulation and deduplication;
  delayed pixel-space shape recognition and adjustment, recognition-timer
  cleanup, note-pin and drawing-stroke hit-testing, tool-aware pointer-down
  interpretation, raw host pointer-event routing, local pointer capture,
  note-placement press and note-drag thresholds, note-drag preview state,
  drawing activation and continuation, cancellation recovery, typed selection,
  stationary-note, interaction-status, and completed-mutation intents, local
  touch-versus-drawing and recognized-shape guidance, local note-card
  dismissal, completed note-move transport, stable encoded note
  targets, overlapping-move suppression, retryable local failures, and typed
  completed-move outcomes.
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
  filtering; remote selection replacement, departure, clearing, and stale-
  revision pruning; caret and range presentation; accessible excerpts; and
  missing-file fallbacks for remote editor presence. It reports selection
  changes through one typed overlay-refresh callback rather than a public DOM
  event protocol.
- The application toast owns message and action presentation, replacement
  timers, one-shot callback lifecycle, pinned fallback restoration, modal
  reparenting, popover visibility, and typed action and dismissal intents.
- The workspace switcher owns project option rendering, archived-current
  handling, selected state, focus entry, canonical-href resolution, and
  navigation for authorized catalog selections.
- The research diary summary owns missing and existing diary presentation,
  derived entry, question, and action counts, action copy, canonical dated
  template choice, and a direct project-file capability binding.
- The assistant workflow status owns operation-specific attribution and status
  copy, live status presentation, selected evidence keys, reconciliation
  against canonical annotations and claims, selection count and limit copy,
  ordered annotation-or-claim model-evidence projection from canonical
  collections retained during reconciliation, annotation-only claim-drafting
  subsets, evidence and connection actions, operation-specific target and
  evidence requirement validation,
  synchronization guidance, generation-start copy, and their typed intents.
- The workspace rail tabs own internal and workflow-driven selection, active-
  tab, controlled-panel, and open-comment-count presentation plus a typed
  navigation outcome.
- The authoring mode tabs own internal and workflow-driven Write and Map
  selection, active-state presentation, controlled editor, write-action, and
  map visibility, map focus entry through its composed workspace, plus a typed
  navigation outcome. The workspace surface switcher's route binding applies
  the Authoring surface and supplied editor focus before performing one URL
  replacement for Write outcomes; this cross-component policy stays outside
  the tab owner.
- The unidentified-PDF queue owns legacy unattached-artifact count, visibility,
  reference choices and artifact-subset derivation from the canonical Library
  snapshot, identification transport, duplicate-submit gating, local progress
  and retryable failures, refresh-pending state, and a typed refresh outcome.
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

Bounded components share one light-DOM host for render-root selection. Normal
reactive owners remove fallback markup before Lit connects, eager owners retain
the existing synchronous first-render contract, and passive coordination owners
leave server markup intact. The controller specialization builds on the normal
reactive owner and adds only empty rendering and typed sibling lookup. The
shared reactive base also owns fail-fast typed descendant lookup so individual
components do not duplicate query-and-error boilerplate.

## Consequences

**Positive:**

- The application coordinator addresses one typed presentation component
  instead of managing its internal elements independently.
- The sync menu removes eight internal elements plus their presentation updates
  from the application coordinator's registry. Its workspace binding also
  removes the coordinator's GitHub action listeners and three refresh-routing
  methods without hiding project-data or settings-view authority. It owns
  ambient online, focus, and visible-document refresh subscriptions plus
  teardown, reusing its existing throttling and review-aware suppression;
  collaboration reconnect remains outside it.
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
  methods while leaving only toast notices in the application coordinator. The
  dialog now owns validated successful branch navigation and post-restore
  reload directly and removes its unused close event.
- The writing-workflow panels replace five internal element references and two
  parallel imperative list renderers. The reviewer-response panel also replaces
  the coordinator's response-letter derivation and download helper. Their shared
  typed binding removes the public action union, dispatcher, and event. The
  panels now own workflow-template choice and route source navigation directly
  through the shared project-file owner, which performs content-bearing file
  creation and created-path verification. Global toast presentation remains in
  the toast owner.
- The assistant result panel replaces six imperative result renderers and their
  local event bindings. It also removes the coordinator's parallel transient-
  result discriminator and context cache by emitting the context retained with
  the visible result. The result owner performs table generation, shape
  validation, and serialization, clarity, ideation, and phrasing requests,
  reference-query formulation, registry discovery and validation, and local
  discovered-reference import. Workflow state, candidate-input derivation,
  canonical refresh, and cross-panel status remain in the application
  coordinator; approved table passage replacement routes through the editor
  insertion owner's existing typed mutation capability while the coordinator
  retains Yjs authority. The candidate list performs revision and claim-draft
  generation and persists those candidate resources.
- The project map panel replaces three internal element references, two
  coordinator fields, and imperative node, connector, resize, focus, and hover
  management while leaving graph derivation and resource navigation in the
  application coordinator.
- The project map workspace replaces six coordinator element references with
  one component reference, consolidates four child event subscriptions into
  one child event and one navigation binding, and owns graph/search fan-out,
  graph derivation, map entry focus, and resource-kind routing. The application
  coordinator retains Yjs anchor resolution, canonical resource lookup,
  navigation effects, editor visibility, and URL policy.
- The candidate review panel replaces thirteen internal element references and
  the coordinator's candidate-copy, status, evidence, and action renderers while
  also replacing candidate-decision availability branches, the apply/reject
  request, retryable local failure reconstruction, evidence-id collection, and
  revision/claim-draft applicability derivation. It leaves canonical inputs,
  refresh, tab movement, notification policy, and final PDF navigation in the
  application coordinator; the assistant-generation presenter owns workflow
  transitions and evidence-destination resolution.
- The publication context panel replaces eight internal element references and
  imperative metadata, paper-row, and link-form renderers plus two coordinator
  relationship-mutation methods. It also replaces the coordinator's parallel
  available-PDF and private-Library, shared-reference, and project paper-option
  mapper plus active-publication lookup while leaving canonical inputs,
  manuscript insertion, PDF navigation, refresh, and workspace notification
  policy in the application coordinator. Its typed workspace binding removes
  the final coordinator subscription and public publication-context action
  protocol.
- The knowledge search panel replaces three internal element references and
  imperative result-card rendering. Its project-map workspace also replaces the
  coordinator's authorized search fetch and response validation while leaving
  graph derivation and resource navigation in the application coordinator.
- The claim list panel replaces one internal list reference and five imperative
  claim render helpers. It also replaces the separate create-button reference,
  native binding, availability update, count reference, count mutation, and
  coordinator deletion, passage-link request, and canonical claim-projection
  methods. It now composes the claim dialog, removing its global registry entry,
  two coordinator subscriptions, create/edit routing, and the coordinator's
  dialog-opening method while leaving Yjs selection validation, evidence-
  selection state, canonical refresh, notification policy, passage navigation,
  and annotation navigation outside the component. Its separate workspace and
  assistant bindings remove the remaining coordinator and assistant
  subscriptions plus the public claim-list action protocol.
- The manuscript comment panel replaces three composer element references,
  submit binding, reset and saved-status updates, one internal list reference,
  its imperative card renderer, and all three coordinator comment request
  paths. Its bound authoring resolver also removes two coordinator event routes
  and the create/re-anchor orchestration methods. Its read-only authoring source
  subsequently removes synchronization, missing-selection, and source-revision
  request derivation from the coordinator binding. Composing that binding under
  the context-resource presenter later removes the comment owner from the global
  application element registry and consolidates comment, claim, evidence, and
  publication mutation, passage, and notice effects behind one canonical route.
  The presenter now consumes that authoring source for comments, claims, and
  evidence, validates synchronization and passage availability, and delegates
  link transport to the appropriate child. Yjs selection resolution, revision
  and collaboration authority, canonical refreshes, notification presentation,
  and passage-selection effects remain in the application coordinator. The
  presenter owns incoming anchor resolution plus stale, exact, and changed-text
  notice selection. Completing that workspace binding removes the final
  coordinator subscription and public manuscript-comment action protocol.
- The project publication list replaces one internal list reference and its
  imperative card renderer. It also replaces the separate count reference and
  mutation, the coordinator enrichment method, and the coordinator's
  two-field publication adapter while leaving context navigation, Library
  management, canonical refresh, and notification policy in the application
  coordinator. Its typed binding also removes the coordinator subscription and
  public publication-list action protocol.
- The model candidate list replaces one internal list reference and its
  imperative card renderer plus the coordinator's revision- and claim-candidate
  requests, response guards, and provider generation. It leaves authorized
  canonical target inputs, canonical candidate state, context navigation, and
  refresh in the application coordinator while the assistant-generation
  presenter owns applicability projection, workflow state, and decisions.
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
  owning deletion completion and optional notice intent. It leaves Yjs selection validation, PDF selection and undo coordination,
  grounding authority, PDF navigation, form synchronization, canonical refresh,
  and toast policy in the application coordinator. Separate typed workspace and
  assistant bindings remove two coordinator subscriptions, two assistant
  subscriptions, and the public project-evidence and claim-list action
  protocols.
- The project tree panel replaces three internal element references and the
  imperative filter, hierarchy, row, and action-menu renderers. Its companion
  image upload control also replaces the coordinator file-input listener and
  sequential upload request, while the tree replaces the empty-folder and image
  DELETE requests plus their optimistic hide, delayed commit, Undo, restoration,
  and failure lifecycle. File deletion, editor rebinding, validated snapshot
  application, image insertion, include insertion, cross-feature rendering, and
  the toast outlet remain in the application coordinator, with upload and tree
  mutation effects routed once through the project-file owner.
- The manuscript map panel replaces seven internal element references and the
  imperative metric, outline, structural-cue, and editing-cue renderers while
  removing its public selection event. It also removes coordinator-side guide
  composition fallback and diary, question, and reviewer-response projection.
  It also reuses its retained composition source map for file-qualified range
  navigation instead of making the coordinator compose the project again, and
  routes that range through the project-file owner without a second navigation
  callback. The project-file owner retains file creation and editor focus.
- The Library discovery results panel replaces its imperative result-card and
  save-button renderer while leaving provider requests and response validation
  in its search sibling. It owns CSL import and its local lifecycle while the
  application coordinator retains canonical Library refresh and toast policy.
- The reference Library workspace removes the coordinator's generic completion
  wrapper by converging child mutation outcomes and private-PDF markup outcomes
  through one refresh lifecycle. Canonical Library loading and the shared toast
  outlet remain in the application coordinator.
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
  refresh is acknowledged or rejected by its annotation-form parent.
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
  target-preview, and readiness updates. It also replaces coordinator adapters
  for claim-relation normalization, phrasing-purpose lookup, and structured
  table parsing plus operation-specific generation gating. The application
  coordinator retains canonical editor target, passage, scope, stability,
  evidence, provider, and workflow-state derivation, model requests, results,
  and status policy.
- The PDF highlight import panel replaces five internal element references,
  imperative candidate-card rendering, DOM-based review collection, and scan
  and import busy updates. It also replaces the coordinator's duplicate
  detection-artifact field, PDF inspection and duplicate filtering workflow,
  active-reader validation, import request, and import failure handling. The
  application coordinator retains canonical Library refresh and completion
  toast policy.
- The project-file action components replace seven button references, seven
  direct bindings, and coordinator-owned delete availability with two component
  references and one typed event protocol. The composed project-file dialog
  retains active-file identity, resource checks, dialogs, upload selection,
  mutation, deferred deletion, and toast routing.
- The project file dialog replaces seven internal element references and
  imperative file and folder operation configuration. Its completed outcome also
  removes the coordinator's duplicate operation-mode and folder-target fields
  and file/folder request helper, and its deletion method removes the file DELETE
  request. It now derives resource availability, initial paths, and stable
  mutation targets from its operation and canonical resource inputs while
  routing sibling file actions, tree actions, upload completions, and save
  completions through one typed workflow boundary. It also derives relative,
  safely delimited Markdown image syntax and normalized alt text when a tree
  asset is selected, and replaces coordinator fan-out to the project tree,
  Insert menu, source completion, and file-action menu with one typed
  presentation binding. Its pending insertion continuation also replaces two
  coordinator fields, the saved mode/path protocol, and the post-save include
  helper. Its workflow-file resolver also removes coordinator-side canonical
  path lookup, existing-file selection and focus, a separate creation helper,
  and created-file URL navigation.
  Its canonical selection method now routes tree, workflow, save, deletion,
  Undo, route, and cross-feature choices through one activation callback and
  removes stable file identity from save completion.
  Its canonical mutation method now applies validated file, folder, tree,
  deletion, and upload snapshots to its own projection and requests Preview
  rendering through its existing project-refresh binding, removing the
  coordinator's snapshot-return round trip.
  Accepted cross-feature mutations now also refresh reference PDFs, present
  Context, and request Preview through that same binding, removing a second
  post-acceptance coordinator callback.
  Its live-content binding now retains the coordinator-supplied readiness
  predicate beside the resolver, removing repeated collaboration-state inputs
  from Preview, manuscript-map, and collaborator projections.
  That binding consumes the collaboration session as the canonical owner of
  both the Yjs document and live-content readiness rather than duplicating
  document and session references inside the dialog.
  Snapshot presentation now ends by supplying the canonical active file and
  snapshot through one typed callback, removing the coordinator's
  return-and-reproject wrapper while leaving active Y.Text/editor binding there.
  Collaborative include-target capture and continuation construction,
  snapshot and active Y.Text/editor authority, Yjs insertion, cross-feature
  rendering, and the toast outlet remain in the application coordinator.
- The project template save dialog replaces seven internal element references
  and imperative replacement-option, value, status, focus, and cancellation
  handling while consuming the starting-point browser's visible template view.
  It also replaces the coordinator's promotion request and response guard. The
  dialog binds the starting-point browser once as a typed template source and
  binds the toast owner directly. It
  owns pre-open and post-save catalog refresh, replacement-option
  synchronization, and successful-save notification timing; the public saved
  event and application notice adapter are removed.
- The project starting-point browser replaces seven internal form and action
  element references, coordinator submit, selection-change, cancel, and import
  bindings, title and selection collection, readiness, loading, and error
  updates. It also replaces the coordinator's duplicate template array and
  hidden-ID set plus template-catalog, project-preview, and project-creation
  requests plus the personal-template delayed deletion and Undo lifecycle. The
  owner binds the canonical read-only workspace catalog once and derives it for
  trigger, settings, save-template refreshes, and internal mutation refreshes
  instead of requiring each caller to re-supply the same collection. The
  owner invokes the bound import workflows, replacement-option synchronization,
  and toast outlet directly; the public action event and application callback
  bag are removed.
- The Library discovery search replaces six internal element references and
  imperative form-value, submit-state, progress, count, empty, and error
  handling plus the provider request and response validation. The application
  coordinator routes validated results and retains import mutation and refresh
  policy.
- The workspace settings panel replaces fifteen internal element references and
  imperative entry-file option, profile-value, archive-label, template
  visibility, modal, and nested GitHub-review coordination. It derives that
  view directly from canonical workspace inputs, removes four coordinator
  request methods, and owns destructive confirmation plus canonical post-request
  navigation. Its typed workspace binding also removes two coordinator
  subscriptions, the public settings-action event, and the coordinator's
  open/outcome methods while leaving catalog refresh, save-as-template, GitHub
  synchronization, and global toast policy in the application coordinator.
- The shared client HTTP adapter replaces ten copies of response-status and API
  error parsing plus four repeated JSON request constructions. This keeps
  request-owning Lit components small without introducing another dependency.
- The reference Library filter panel replaces eight internal element references,
  seven control listeners, filter-value validation, dynamic type-option
  rendering, result-count updates, and coordinator-side canonical filtering.
  It derives linked-reference ids from canonical project-reference inputs; the
  application coordinator retains result-card composition and navigation.
- The composed reference Library workspace replaces four direct application
  registry entries, the coordinator's filter-change listener, sibling
  presentation fan-out, and direct result-settlement and reveal calls. The
  later ownership completion also replaces nine coordinator subscriptions and
  their child-event type imports with one callback configuration. It now
  encompasses the full Library surface and replaces another eight coordinator
  subscriptions, seven global registry entries, upload/status binding, archive
  state access, and web-capture delegation. The application coordinator
  supplies canonical snapshots and retains cross-feature navigation, refresh
  execution, comparison, and notifications. Project reference and research
  events remain internal to the composite and reach the coordinator through its
  existing typed callback configuration.
- The model provider settings panel replaces six internal element references,
  duplicate preference listeners and status synchronization, stored-value
  validation, and imperative model-option rendering. It also removes the
  coordinator's preference storage key, restore/save methods, record guard,
  preferences-host reference, and split open/focus coordination, and owns its
  browser-local discovery request, overlap guard, busy state,
  result selection, and failure status. The application coordinator retains
  cross-feature discovery availability, local persistence, generation request
  construction, generation workflows, and assistant status mirroring.
- The claim dialog replaces eight internal element references, one coordinator
  field, imperative evidence-option rendering, DOM-based selection collection,
  modal configuration, and the coordinator mutation method. Its claim-list
  owner now supplies evidence availability and canonical create/edit inputs;
  canonical project refresh and toast policy remain in the application
  coordinator.
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
  state, refresh acknowledgment, and archived-visibility mutation before
  requesting a canonical refresh. Citation-network opening, canonical
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
  It also composes the publication-intake owner, removing that nested element's
  global registry entry, coordinator listener and completion method, and direct
  lookup from the context presenter. Its typed workflow binding also replaces
  two coordinator subscriptions and the public annotation action and save event
  protocols while retaining cross-feature decisions in the coordinator.
  It now also replaces coordinator selection/overlap/save/erase orchestration,
  leaving viewer draft clearing, manuscript
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
- The Library PDF inspector also owns its annotation forms, imported-highlight
  review, saved annotation list, and project-use children. It projects one
  coordinator-supplied canonical context into those children and resets their
  local presentation state when the active artifact changes, replacing four
  global registry entries and the coordinator's direct child orchestration.
  It also replaces the coordinator's project reference and research event
  subscriptions with one typed mutation-completion binding. PDF viewer state,
  navigation, canonical snapshot application, refreshes, and notifications
  remain in the application coordinator.
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
  refreshes, active-page selection, toolbar coordination, and notifications.
  Page-local markup filtering now remains with the rendering owner. Note placement remains layer-local until a
  stationary pointer release; the layer then emits the complete typed draft for
  annotation-form persistence.
- The Library PDF project-use block replaces its imperative renderer and four
  one-off DOM-construction helpers, then absorbs its remaining canonical
  reference and project-link lookup projection. The application coordinator
  supplies snapshots and retains snapshot application, project-PDF refreshes,
  and notification policy.
- The collaborator selection list replaces imperative remote-presence rendering
  and consolidates the browser-local remote selection collection plus revision
  and file filtering for both the list and editor overlay. The application
  coordinator retains local-author selection, collaboration transport, revision
  authority, and editor-highlight placement.
- The application toast replaces action-element construction, coordinator timer
  state, popover visibility, modal reparenting, action callback state, and the
  persistent-update reminder field and bindings. The application coordinator
  supplies authorized effects and retains deferred-deletion authority, offline
  persistence, and notification policy.
- The workspace switcher replaces the final feature-level imperative option
  renderer plus its native change and focus coordination. It navigates through
  the selected authorized catalog entry's canonical href; the application
  coordinator retains catalog fetching and supplies the authorized entries.
- The research diary summary replaces three internal element references and
  coordinator-owned summary adaptation and copy plus its public open event. The
  application coordinator retains file lookup, creation, selection, and editor
  focus through a typed binding.
- The assistant workflow status replaces four internal element references,
  two native action bindings, operation-specific status copy, and attribution
  visibility. It also removes the coordinator's selected-evidence set and count
  formatting while exposing readonly keys for snapshot resolution and
  requirement validation. The application coordinator retains canonical target
  and stability derivation, evidence navigation, generation coordination,
  discovery-status mirroring, and result-specific status policy.
- The workspace rail tabs replace five internal element references, four
  native action bindings, four ARIA-selection mutations, and DOM-derived active
  mode plus their public change event. They route selection through a typed
  navigation binding; the workspace surface switcher's route binding consumes
  the outcome and replaces the canonical URL. The application coordinator
  retains guide rendering, collapse, and resize authority.
- The authoring mode tabs replace two internal element references, two native
  action bindings, two ARIA-state mutations, DOM-derived active mode, one
  write-action reference, three coordinator-owned visibility mutations, and
  its public mode-change event. Their navigation method applies the selected
  mode before reporting it through the typed binding, so internal clicks and
  external workflows share one state transition. The workspace surface
  switcher's route binding owns the cross-surface policy, applying Authoring and
  supplied editor focus for every Write outcome before one URL replacement.
- The editor status component replaces separate target and save-status element
  references and owns their text and target-tooltip presentation, including
  bounded line counting and file, line-range, caret, and selection wording. It
  also owns browser-local Yjs-relative target retention, active file context,
  range selection, resolved target/caret, non-empty passage projection, and
  temporary range preservation across asynchronous authoring operations. It
  owns the active Yjs-text/editor binding and teardown, per-file undo managers,
  external text synchronization, assistant-staleness observation, and local plus
  collaborator presence highlighting from a once-bound presence owner. Its
  document binding atomically installs the active source and companion
  bibliography as one authoring lifecycle, deriving their initial Y.Text values
  without coordinator-cached duplicates. It
  subscribes directly to remote-selection changes and publishes each resolved
  target to the bound citation, assistant, and Context authorities. It applies bounded
  authoring text insertions and replacements, resolves the active Y.Text from a
  project-file and entry-file identity, exposes its manuscript projection,
  focuses the active source, and selects the resulting range so derived edits
  remain in that undo history. Its source interaction listeners run after the
  Yjs textarea binding and own relative-target capture, collaboration-presence
  scheduling, and assistant-availability refresh; source completion no longer
  transports those unrelated consequences. The coordinator no longer retains a duplicate
  active-text field.
  It also preserves an insertion point as a Yjs-relative position across an
  asynchronous authoring workflow and invalidates it when the active text
  changes. It binds companion Yjs textareas such as the bibliography and,
  before a remote update, captures and then restores Yjs-relative selections
  for its active source and those companions. The
  application coordinator retains mutation decisions, cross-file path
  projection, while the typed collaboration socket owns protocol-aware endpoint
  derivation through its injected browser environment and the document-wide
  update subscription, offline-save scheduling, session-owned local-origin
  filtering and enqueueing, immediate flush, and teardown. It binds the
  canonical session document and available online/offline browser events during
  construction, eliminating a separately callable document-bind stage. The
  session creates and stores its opaque remote and offline origins as one
  filtering policy, so the application does not construct derivable tokens. The socket consumes canonical
  offline, refresh, editor, revision, presence, connection, project-file,
  assistant, and toast owners directly for local and remote update effects
  instead of maintaining a parallel application callback protocol. Socket
  construction derives refresh from the canonical project-file owner rather
  than accepting a duplicate coordinator argument from the composition root.
  Socket
  construction also installs the connection-status workflow binding from that
  same session and owner set, removing a partial application lifecycle stage.
- The connection status component replaces separate label and tone element
  references, binds the collaboration workflow and authoring controls once, and
  owns synchronized label/tone, source and companion editability, and assistant-
  availability refresh. On offline restore it combines that projection with
  pending-versus-saved wording through its bound editor-status owner. The
  collaboration session retains state interpretation. The collaboration socket
  installs this binding atomically from its canonical session and owners; the
  application coordinator retains Library-mode status and other save transitions.
- The Vim mode control replaces separate toggle and mode-status element
  references and owns browser-local enablement, mode presentation, modal key
  handling, pointer-selection transitions, and editor-listener teardown. The
  application coordinator only supplies the source editor and its shell.
- The application-version control replaces separate value and copy-action
  element references and owns version presentation plus Clipboard API and
  textarea fallback behavior. It derives the active version from the offline
  shell and owns service-worker registration, update refresh sequencing,
  workspace-navigation caching, ready projection, and fail-open behavior. The
  control binds the offline-persistence and toast owners together during shell
  preparation, owns the
  pinned update notice and persistence-before-refresh sequence, and presents
  copy outcomes through that toast owner. The application coordinator only
  connects those capabilities, and the public notice event is removed.
- The preview synchronization control replaces its container and two button
  references, owns Preview-context visibility, the current composition source
  map, bidirectional composition-offset resolution, native source-viewport
  centering and centered-offset derivation, native click, select, and
  navigation-key listeners, and explicit-versus-automatic routing through
  directly bound project-file and workspace-Preview owners. It also derives responsive automatic-sync availability and chooses
  the centered or selected source offset from coordinator-supplied active
  context and layout inputs. For Preview-to-source navigation it captures the
  centered Preview offset, resolves the file-qualified source location,
  delegates focus to the project-file owner, and centers the source viewport.
  The workspace Preview installs the source listeners and owners atomically
  with its project binding, so the application has no separate synchronization
  setup stage. The coordinator retains active-file, context, and layout authority plus file,
  mode, caret, and focus policy. The bound workspace Preview consumes those
  projections, asks the synchronization owner for eligible source offsets, and
  reveals its nearest mapped DOM range directly.
- The preview navigation control owns browser-local top-navigation visibility,
  stored restoration, toggle and restore presentation, ARIA and title copy,
  restricted-Preview availability, and focus handoff. The application
  coordinator supplies only whether Preview is the active workspace context.
- The context tab strip replaces five shell references, three native primary
  action bindings, fixed-tab ARIA mutations, coordinator-owned roving focus,
  the separate overflow-tab renderer, seven controlled-panel references,
  visibility mutations, Preview sibling-control presentation, resource
  labelling, PDF-mode presentation, and five coordinator title helpers. It
  composes the existing dynamic resource tabs and overflow overview from
  canonical tab and resource inputs, restores fixed-panel scroll directly from
  that input, and replaces three coordinator event subscriptions with one
  callback configuration. The enclosing context-resource presenter owns
  browser-local canonical context state, authorization reconciliation, resource
  closure, PDF location, resource-panel scroll restoration, tab presentation,
  focus, route-effect sequencing, surface activation, and active-PDF load
  timing. One atomic application entry binds its project-knowledge,
  presentation, and route sources, including the assistant, editor, layout,
  Library, project-file, and surface-route owners, and derives canonical
  context sources from their live state. The same entry installs the assistant
  presenter's reciprocal authoring, workflow, resource-route, and API binding
  followed by the editor owner's authoring and source-completion binding from
  the shared collaboration, refresh, socket, and owner capabilities. The
  application coordinator only connects the remaining owners and supplies immutable workspace-versus-Library mode and project API
  configuration; it does not retain a parallel source factory or effect
  adapters.
- The workspace surface switcher replaces two button references, native action
  bindings, ARIA-state mutations, and its public change event. It routes
  internal and workflow-driven selection through one navigation method, owns
  the direct parent workspace's visibility-driving active-surface projection,
  and reports typed navigation outcomes. Through one workspace-route binding it
  also owns route readiness, ordered file, rail, authoring-mode, context,
  layout, and surface restoration, canonical URL projection and comparison,
  push-versus-replace browser-history writes, and the browser-history
  restoration subscription with lifecycle teardown. It applies persisted
  layout before an explicit route layout during restoration. The application
  coordinator supplies the canonical project-file, Context, authoring-mode,
  layout, rail, and source owners directly from the application registry, with
  route enablement as separate configuration, instead of projecting their state
  and effects through callback or alias adapters. The same binding consumes authoring-mode
  outcomes, applies Authoring and supplied editor focus for Write, and replaces
  the canonical route for either mode.
- The workspace layout control replaces the raw select reference and
  coordinator-owned normalization and local-storage access. It owns the
  four-option template, selected value, workspace-scoped resilient persistence,
  workspace layout projection, rail collapse and resizing, authoring/context
  pane resizing, pointer and keyboard interaction, ARIA values, browser-local
  width persistence, PDF relayout, and resize notification for internal, restored,
  and route-driven navigation before routing the typed outcome through a
  binding. Its atomic application binding resolves the root controls, consumes
  the canonical Context owner plus that owner's PDF viewer, and installs the
  surface-navigation owner's complete workspace-route lifecycle before
  publishing workspace readiness, replacing the former non-element
  layout manager. That route binding consumes the
  layout outcome, activates an available PDF through the supplied Context owner
  for PDF-only mode, and replaces the canonical URL. Its public change
  event is removed.
- The workspace rail tabs derive their four controlled panel targets from the
  existing `aria-controls` contract and own active-panel visibility alongside
  tab selection and comment-count presentation. Their navigation method applies
  the selected mode before reporting it through the typed binding, so internal
  clicks and external workflows share one state transition. The workspace
  surface switcher's route binding owns route synchronization; the application
  coordinator retains responsive rail layout and guide rendering.
- The unidentified-PDF queue replaces two internal element references,
  imperative section, count, empty-state, card, and option rendering, and
  per-card action bindings. It also derives its legacy unattached-artifact
  subset from the canonical Library snapshot while leaving Library refreshes
  and toast policy in the application coordinator.
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
  The application coordinator retains canonical refreshes and toast policy. The
  direct bibliographic update endpoint validates the complete serialized field
  set and text bounds through one inferred Valibot request schema rather than a
  parallel key list and handwritten predicate.
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
  blur lifecycle, dismisses locally without an external intent, owns
  browser-local citation-scope persistence, rerenders locally when that scope
  changes, and invokes only a typed acceptance binding. Acceptance carries the
  component-selected candidate and replacement context, removing five coordinator caches and the
  completion-kind discriminator. It also replaces two coordinator context-
  detection and presentation methods plus both candidate projections. The
  component also replaces the coordinator's private-Library request, validation,
  and duplicate-load guard. The application coordinator supplies canonical
  project files and references; the completion owner binds project-file,
  editor-status, insertion, and toast owners directly for private-Library
  linking while canonical Yjs authority remains in editor status. The completion
  owner dismisses locally on acceptance and sends
  its selected explicit range through the editor insertion owner's existing
  typed mutation capability for replacement, focus, and caret application.
- The source citation control owns caret-context parsing and action
  availability. From the same resolved caret it owns canonical citation syntax
  projection, invalid-key and missing-caret copy, and insertion completion copy.
  Its workflow binds through editor status to the existing Context navigation,
  authoring-mode, and notice owners. Editor status applies the Yjs transaction,
  caret consequences, successful Write activation, and completion or error
  notice. Context retains publication resolution and grouped-citation policy.
- The existing PDF viewer owns its complete status presentation, including
  active-load failures and text-selection pointer routing reported by the
  bound context-resource presenter, without exposing its internal elements or
  four presentation adapters to `WorkspaceApp`. Its lower-level constructor
  remains callback-based for isolated viewer tests.
- The Preview DOM adapter owns direct article and viewport mechanics that do
  not need reactive templating: content assignment, source-span lookup,
  centering, transient emphasis, image lookup, and anchor scrolling. This
  keeps Lit focused on reactive presentation while still removing raw Preview
  elements from `WorkspaceApp`.
- The project-history dialog and workspace-sharing panel bind their sibling
  triggers and toast owner directly. This removes coordinator
  subscriptions and adapters while retaining global toast policy in the toast
  owner.
- The action-menu controller owns document-level outside-action dismissal,
  settings-menu containment, Escape ordering, focus restoration, and listener
  teardown for spatially separate native `details` menus.
- The browser shell resolves its native and Lit elements through one typed
  registry. TypeScript infers the returned registry shape from the validated
  constructors, replacing a separately maintained 86-field interface and
  keeping startup-only DOM lookup outside the application coordinator. Those
  constructor value imports are also the registration edge for collected
  custom elements; the application entry retains side-effect imports only for
  registration-only elements absent from the registry.
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

- GitHub and workspace-access contracts, authorization handling, canonical
  project fetching, and settings-view preparation remain outside presentation
  state.
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
