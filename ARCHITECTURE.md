# Architecture

This file stores cross-cutting rules that apply to the whole repo and to projects cloned from it.

Use this file for global constraints. Use feature specs under `specs/` for domain-specific behavior and contracts.

## Global Rules

- Keep the template lightweight, reusable, easy to clone, and easy to prune.
- Treat repo documentation as living context that should evolve with the code.
- Treat architectural decisions as explicit records, not implicit tribal knowledge.
- Treat specs and ADRs as the durable source of truth for expected behavior and architectural intent. Code, including AI-generated code, is only acceptable when it matches those documents or updates them intentionally in the same change set.
- Add or update an ADR in `docs/adrs/` whenever a change introduces or changes a lasting architectural constraint, selects between credible architectural alternatives, or replaces an earlier decision. Keep drafts in `docs/adrs/proposed/`, approved-but-not-yet-implemented decisions in `docs/adrs/accepted/`, and implemented decisions in `docs/adrs/implemented/`.
- Create or update the relevant feature spec in `specs/` in the same change set whenever feature behavior, contracts, workflows, or regression guardrails change.
- Add or update a template update pack in `.template/updates/` in the same change set whenever a reusable template maintenance change should be portable to downstream projects.
- Keep the quality gate green before considering a change ready.
- Keep workflow writes explicit. New generated output, local state, cache, archive, or tool-artifact paths should be documented in the same change that introduces them.
- Use pinned Valibot schemas selectively at external and persisted-data trust
  boundaries when one schema replaces duplicated structural types and runtime
  predicates. Keep authorization, cross-record invariants, canonicalization,
  and stateful business rules in explicit domain functions; do not migrate
  predicates merely for consistency. Do not retain or schema-wrap validators
  for values produced and consumed entirely inside one typed process without a
  real unknown-data consumer. At the GitHub user boundary, schemas own
  external identity, installation, repository, and branch response structure;
  bounded reads, pagination, OAuth policy, and domain error mapping stay explicit.
  At the GitHub App repository boundary, schemas own repository, ref, commit,
  tree-entry, created-object, and blob response structure; subtree policy,
  Markdown and byte bounds, LFS handling, optimistic concurrency, and stable
  integration errors stay explicit. At its Octokit-authenticated transport,
  schemas also own installation-token and bounded provider-error envelopes while
  HTTP status mapping and response-size policy stay explicit. At GitHub import,
  Pull, and Publish command boundaries, schemas own local request structure and
  primitive bounds while authorization, preview freshness, conflict coverage,
  remote identity, and reconciliation stay explicit. At the owner-library
  private-PDF mutation boundary, schemas own highlight, imported-highlight
  envelope, note, drawing, point, style, position, and reading-state structure;
  imported-candidate semantics, owner authorization, and Durable Object domain
  bounds stay explicit. At the adjacent metadata-review boundary, schemas own
  reviewed PDF fields, artifact ids, fingerprints, provider choices, selected
  fields, and batch envelopes while normalized-DOI, unique-provider, and
  disjoint-field invariants remain explicit. At workspace lifecycle command boundaries, schemas own
  settings, duplicate-title, milestone, and revision-seed structure and scalar
  bounds; authorization, canonical title trimming, catalog fan-out, revision
  identity, and Durable Object mutations stay explicit. At review catalog
  command boundaries, schemas own creation, settings, membership, and project-
  link request structure; authorization, immutable-profile policy, identity
  normalization, catalog projection, and project access stay explicit. At
  review-study decision boundaries, schemas own screening, final-inclusion,
  adjudication, duplicate-resolution, quality-answer, extraction-value, and
  reassessment-completion structure; revision concurrency, evidence parsing and
  authorization, and study mutation stay explicit. At the persisted reference-
  library boundary, schemas own Crossref metadata, web-source rows, immutable
  web-snapshot rows, and string-array maps; record-versus-array identity and
  cross-record Library invariants stay explicit. Preserve the legacy snapshot
  number fields' type-only acceptance; capture-time semantic checks remain with
  the writing authority.
- Reuse the dependency-free unknown-value guard when a handwritten trust
  boundary only needs the shared plain-record rule: a non-null object that is
  not an array. Do not duplicate that semantic locally or introduce a schema
  solely to replace it.
- Keep reference-library domain contracts capability-scoped below
  `src/domain/reference-library/`. Treat `src/domain/reference-library.ts` as an
  incremental compatibility facade, not the default import for new consumers.
  Narrow capability modules must not import that facade or depend on API,
  browser-component, Durable Object, or Cloudflare runtime authorities.
- Keep Durable Object classes as stable RPC, authorization, migration, and
  transaction facades while moving cohesive persistence lifecycles into
  adjacent capability services. A delegated service may own SQL and mapping for
  its bounded lifecycle, but it must not hide or relocate a multi-resource
  transaction.
- Keep normalized PDF analysis mechanics behind
  `src/lib/pdf-analysis/index.ts`. The core may depend on pure domain contracts
  but must not import PDF.js, browser globals, API handlers, client UI,
  Durable Objects, queues, storage, or Cloudflare runtime types. Adapters own
  document loading, text/canvas normalization, lifecycle, and delivery.
- Validate the server-rendered workspace/Library browser bootstrap as one
  Valibot contract before constructing the application. The contract owns the
  bounded workspace id, non-empty bounded identity email, and explicit
  `workspace`/`library` mode, and returns the derived project API base and
  workspace-mode flag consumed by composition; malformed or missing bootstrap
  values must fail initialization instead of silently selecting another mode.
- Read bounded external response bodies through stateless, request-local
  helpers that enforce both declared and observed byte limits. Keep byte
  ceilings, errors, response-shape validation, and domain mapping explicit at
  each provider boundary; never retain response I/O in module state. Share pure
  scholarly-provider text bounding and markup/entity cleanup while keeping
  provider-specific type, date, and error mapping local.
- Model external scholarly works as typed sets of stable identifiers. Prefer DOI when present, but do not make DOI a prerequisite for discovery or review.
- Treat parsed PDF bibliography entries as immutable, fingerprint-qualified
  review inputs. Revalidate the candidate inside the owner-library authority;
  only exact DOI identity may be reused automatically, while bibliographic
  similarity remains a researcher-visible suggestion. Persist rejection as a
  review decision, not as negative citation evidence.
- Do not place executable browser code inline in Worker-rendered HTML. Client behavior should live in typed TypeScript modules before it is served to browsers.
- Keep the authenticated browser entry as a module-private composition root,
  not a one-instance application class. Derive immutable bootstrap mode once,
  construct shared services once, invoke one ordered Lit startup entry directly,
  and attach fail-visible reporting through the shared unknown-error normalizer
  to that promise; cohesive reactive lifecycle belongs in the bounded Lit
  owners. Because bootstrap validation already reads the browser
  document, do not retain a later unreachable document-availability branch.
- Use XState only for bounded event-driven browser workflows whose mutually
  exclusive states, asynchronous lifecycle, or guarded transitions would
  otherwise span several independent fields. Keep route values, persisted
  domain data, Yjs state, and compact pure reducers in their existing
  authorities; XState is not a global application store.
- Keep application appearance behind shared semantic color tokens. Light and
  dark modes may vary token values, but components must not grow separate
  theme-specific palettes. Let one bounded light-DOM Lit control own the
  System/Light/Dark template, normalization, browser-local persistence, and
  root theme plus `color-scheme` projection without application startup wiring.
- Keep the interface design system thin and source-local under `src/ui/`: foundations, visual primitives, shared state contracts, typed icons, and small markup helpers only. Domain components compose it without moving application behavior or state into a second UI architecture.
- Incubate reusable capabilities as source-local modules first. Create a private
  workspace package only for two independently built consumers with a justified
  runtime, dependency, build, or release boundary; tests, fixtures, examples,
  spikes, and compatibility facades are not consumers. Public publication also
  requires an external adopter, versioned compatibility policy, package and
  security documentation, a release owner, and a separate release ADR.
- Use pinned Lit for bounded reactive browser components that own a cohesive
  local template, presentation state, presentation copy derived solely from
  component state and canonical inputs, and typed intent events. Keep network
  workflows in a component only when their complete request lifecycle and
  response validation serve that component's local interaction. Keep Yjs
  state, persisted domain data, project refresh, cross-feature navigation, and
  cross-feature coordination in the existing application authorities. A bounded
  component may navigate only to a canonical href supplied through its own
  authorized inputs or validated request result; do not
  wrap static server-rendered markup mechanically or turn Lit into the
  application shell. Keep Yjs and cross-feature XState actors in application
  authorities; a component may own an actor whose full lifecycle is confined
  to its interaction and whose outward effects are typed outcomes. Let
  light-DOM components share one Lit host for render-root selection. Reactive
  owners extend its normal first-connection server-markup cleanup or synchronous
  first-render specialization; passive owners retain server markup. Non-rendering
  presenters extend the normal owner's controller specialization for empty
  rendering and typed sibling lookup. Reactive owners use the shared host's
  fail-fast typed descendant lookup instead of repeating local query-and-error
  helpers. Keep domain bindings, effects, and
  reconnect work in the concrete components.
- Let the project-map Lit workspace own its authorized knowledge-search request,
  response validation, and idle, result, and error lifecycle because those
  states also determine whether the graph overview is visible. Let it parse and
  route kind-qualified resource keys through one exhaustive typed navigation
  binding. Keep graph derivation, canonical resource lookup, and navigation
  effects in the application coordinator.
- Let the bounded workspace-layout control own its four-option presentation,
  normalization, selected value, workspace-scoped local persistence, and typed
  change outcome. Let the same Lit owner resolve the workspace root controls and
  own rail collapse and resizing, authoring/context pane resizing, keyboard and
  pointer interactions, ARIA values, browser-local width persistence, and PDF
  relayout. One atomic application lifecycle binds the workspace root,
  canonical Context owner, and surface switcher's complete route lifecycle;
  it publishes workspace readiness only after those bindings complete. Consume
  the viewer owned by that Context. Let internal, restored, and route-driven selection apply the
  workspace's visibility-driving layout and dispatch resize notification before
  that outcome. Let the workspace surface switcher's route binding consume the
  live Context owner, activate an available PDF through that owner when needed,
  and replace the canonical URL. During workspace route restoration,
  apply the persisted layout first and let an explicit URL layout override it.
- Let the workspace surface switcher's route binding own Write/Map route
  effects. Every Write outcome activates Authoring without a second navigation
  event, focuses the supplied authoring target, and replaces the canonical URL;
  Map outcomes only replace the URL. Supply the project, Context, and authoring
  owners plus layout, rail, and source directly under their canonical
  application-registry names, with route enablement as the only separate
  configuration, so route state and effects are not duplicated as coordinator
  callback or alias adapters.
- Let that route binding also consume project-rail navigation outcomes and
  replace the canonical URL. Keep rail presentation, collapse, and geometry in
  their existing owners.
- Let the bounded Library discovery search own its provider request, response
  validation, duplicate-submit guard, and status lifecycle. Route only its
  validated result list to the sibling results component. Let that result owner
  project validated metadata to CSL JSON and own its import transport, local
  save progress, retryable failures, and refresh-pending state. Keep canonical
  Library refresh and toast policy in the application coordinator.
- Let bounded Library reference-link controls share their project-link and
  unlink transport, canonical workspace-response validation, and completed
  mutation outcome. Keep canonical snapshot application, project-PDF refresh,
  Library rerendering, and notification policy in the application coordinator.
- Let the reference-Library Lit workspace own child mutation refresh
  completion, success/failure notice selection, alternate metadata refresh, and
  local request finalizers. Metadata completion refreshes its own canonical
  Library before invoking one bound project refresh; do not route that Library
  refresh back through the application. Keep shared toast presentation behind
  its typed callback.
- Let the reference Library filter Lit owner derive dynamic type choices,
  filtered and sorted reference results, and visible-versus-total counts from
  the canonical Library snapshot, its local filter state, and canonical
  project-reference inputs. Let a composed light-DOM Library workspace
  synchronize that projection with the reference list, citation network, and
  unidentified-PDF queue; own filter-driven rerendering and focused-reference
  reveal; delegate child lifecycle controls; and route its summary, personal-
  field, metadata, PDF, research, citation-network, and unidentified-PDF child
  outcomes, including project reference and research mutation completion. Let
  it also own canonical Library loading, response validation, archive-aware
  request scope, the single browser snapshot projection, and derivation of its
  project-reference and research-share inputs from the canonical project
  snapshot. Start workspace or standalone mode through one boundary that binds
  workspace identity, optional project API scope, canonical feature owners,
  citation-network configuration, PDF-upload status ownership, and standalone
  browser history atomically. It owns standalone Library route lookup; root, addressed-reference,
  and private-PDF history writes; active-page replacement; browser-history
  restoration subscription and teardown; archive-aware focused-reference
  restoration; and missing-reference feedback. Direct publication-
  management navigation also stays inside this owner for Library activation,
  canonical refresh, archive-aware focus, and successful route intent. General
  Context publication-list management binds this owner directly, without an
  application-level callback adapter. Private-PDF project mutation outcomes
  likewise bind directly to its apply-project-notice lifecycle.
  Library entry likewise sequences context activation, optional standalone
  route entry, and canonical refresh through the same typed boundary. On the
  standalone application path, the owner also binds browser history, projects
  the Context-only shell and private connection state through the directly
  supplied workspace-surface and connection-status owners, opens the Library,
  and restores the current route without a shell adapter.
  Library-originated project mutations pass through one owned apply-project-
  notice lifecycle; delegate canonical project snapshot acceptance to the
  project-file owner. It also resolves duplicate-PDF upload reveals through
  archive visibility, canonical refresh, owned filter/list focus, and missing-
  source feedback. Bind the context, project-file, web-comparison, route, and
  toast owners once so cross-feature PDF navigation, snapshot application,
  refresh timing, comparison, and notifications remain in their authorities
  without parallel callback adapters.
- Keep resource-card lookup, scrolling, and focus inside the Lit component that
  renders those cards. Let the Library reference-list owner route a PDF
  refinement intent to the metadata editor in the same reference row. The
  application coordinator should receive cross-feature navigation and mutation
  outcomes, not traverse feature-owned DOM.
- Load canonical workspace snapshots through one typed browser client that owns
  access-revocation status policy, response parsing, the existing domain guard,
  and optional Yjs anchor reprojection. Keep offline fallback, snapshot
  application, rendering, collaboration transitions, and notification policy
  in the application coordinator.
- Let the workspace-settings Lit component own project settings persistence,
  archive/restore, duplication, permanent-deletion confirmation and request
  lifecycles, their canonical successful-result navigation, local busy and
  failure state, and its current title, archived state, visible entry-file
  choices, publication defaults, and template eligibility derived from
  canonical workspace inputs. Bind its entry trigger, workspace identity, and
  catalog, project-file, template-save, GitHub, and sharing owners through one
  typed application boundary. That boundary installs the catalog's trigger and
  switcher lifecycle, the project-creation and reciprocal template-save
  lifecycle, the sharing panel's API and trigger lifecycle, and the settings
  panel and GitHub sync menu's mutual lifecycle, including the
  coalesced project-refresh service and ambient refresh policy, rather than
  requiring sibling application binds.
  The component reads owner projections and invokes their refresh or open
  operations directly instead of accepting parallel callbacks.
- Let the project catalog and starting-point Lit owners bind their server-
  rendered entry triggers. The starting-point owner also owns loading-state
  entry, post-load focus, local load-failure presentation, and the one-shot
  browser create intent with canonical query cleanup around the catalog owner's
  canonical refresh. Bind the read-only workspace-catalog owner once so
  trigger, settings, save-template refreshes, and internal template mutations
  read the same live projection without a parallel getter callback. Let the
  project catalog owner retain its stable `/api/workspaces` route and receive
  current-project identity, compact switcher, and server-rendered trigger
  atomically from the workspace-settings application boundary, fetch and validate its
  authorized summaries, retain the one browser catalog projection, and
  synchronize the switcher from that state. Let it derive the single authorized
  offline project row from a restored snapshot identity, title, and save time.
  Other workflows consume its read-only catalog; keep canonical route
  navigation outside it.
- Let the template-save Lit dialog bind the starting-point browser as its typed
  template source, the toast owner, and its project API atomically so it cannot
  enter a partially configured production state. The dialog owns pre-open and
  post-save refreshes, replacement-option synchronization, and successful-save
  notification timing; the starting-point browser retains canonical catalog and
  hidden-template authority. One starting-point application binding also
  installs that reciprocal template-save binding. Bind the starting-point browser's GitHub-import,
  LaTeX-import, template-save, and toast owners atomically with its
  server-rendered trigger and canonical project-catalog source so import
  handoff, replacement synchronization, and deferred-deletion notices do not
  require parallel application callbacks or permit a partially wired browser.
- Let the workspace rail-tabs Lit owner apply each internal or workflow-driven
  rail selection to its active tab and controlled panel before reporting the
  selected mode through one typed navigation callback. Keep URL synchronization,
  responsive rail layout, collapse, and guide rendering in their existing
  coordinators.
- Let the authoring-mode-tabs Lit owner likewise apply internal or workflow-
  driven Write/Map selection to its active tab and controlled surfaces before
  reporting the selected mode. Keep editor focus and URL synchronization in the
  application coordinator.
- Let the GitHub sync-menu Lit component bind the workspace-settings review,
  own online and active-review refresh policy, route Check/Pull/Push/Settings
  actions, and refresh both canonical project data after Pull and menu status
  after every completed mutation. Bind the canonical workspace-settings owner
  and coalesced project-refresh service directly instead of projecting a
  callback bag through the application. Let the menu subscribe to online,
  focus, and visible-document browser transitions when ambient workspace
  refresh is enabled and remove those subscriptions on disconnect. Keep
  canonical project fetching and collaboration reconnect in their existing
  authorities.
- Route same-origin JSON writes and non-success response handling through the
  shared client HTTP adapter. Validate the bounded `{ error: string }` response
  contract with Valibot there instead of repeating parsing and fallback policy
  in each Lit component or application workflow.
- Let the bounded Preview status owner derive composed-versus-isolated file
  labels and combined composition and renderer issue summaries from canonical
  preview inputs. Let the light-DOM workspace Preview own lazy renderer loading,
  stale-render rejection, rendered or escaped-source presentation, renderer
  diagnostics, isolated-file heading-number mapping, and authorized local-image
  resolution. Bind the canonical Yjs document, project-file owner, and
  hidden-asset owner once; let Preview read the canonical snapshot from the
  project-file owner and derive its live source,
  bibliography, resolved anchors, publication composition, active-file preview,
  and subscribe once to document-wide Yjs updates with disconnect teardown so
  every collaborative file change schedules one canonical project render. Let
  it also derive
  synchronized status and source-map sibling projection, manuscript-map and
  live export-statistics companion
  projection, and available-outcome projection of a supplied anchor-resolved
  workspace into research companions from the same project render outcome,
  transient DOM navigation, interactive-click classification,
  source-offset extraction, and routing of its source, citation, and nested
  diagnostic-selection intents directly through the sync, Context, and
  project-file owners already supplied by its project binding. Do not repeat
  those owners in a second navigation callback bag or repeat the project
  snapshot as a separate callback. Keep
  canonical project-file, snapshot, and Yjs authority, publication resolution,
  and resulting transitions in the project-file application lifecycle.
- Let the bounded Preview synchronization control own explicit Preview-to-source
  offset capture, composition-map resolution, file-qualified focus intent, and
  source-viewport centering alongside its directional actions and source
  listeners. Install that complete source lifecycle through the workspace
  Preview's atomic project binding rather than a separate application setup
  stage. Let the workspace Preview derive source-to-Preview eligibility
  from its bound active file, snapshot, context, layout, and sync owner, then
  reveal the nearest mapped DOM range itself. Keep file activation, authoring
  mode, caret, and source-focus policy in the application coordinator.
- Keep the DOI publication-intake XState actor, preview and acceptance
  requests, stale-response guards, local status, and focus lifecycle inside the
  bounded intake Lit component. Let that component also derive the active PDF's
  linked references from canonical publications and publication-PDF links. Hold
  acceptance pending until the application coordinator acknowledges canonical
  snapshot refresh, then emit only the publication DOI or reference-navigation
  intent.
- Keep the browser shell's required-element lookup in one typed registry whose
  return shape is inferred from its constructors. Do not duplicate that shape
  in a manually synchronized application interface. Treat the registry's value
  imports as the registration edge for every collected custom element; the
  application entry imports only registration-only elements absent from that
  registry and must not repeat side-effect imports for collected owners.
- Keep duplicated `.github/skills/` content and vendored
  `.codex/skills/**/references/` material outside the Prettier baseline.
  Continue formatting project-owned skill entrypoints, specs, ADRs, and docs.
- Cache successful Prettier checks by file content under ignored
  `.cache/prettier`; do not trust file timestamps or restore this local cache in
  remote CI.

## Kirjolab Product Architecture

- Synchronize GitHub-backed projects only through explicit, previewed Import,
  Pull, and Publish operations over one repository-scoped GitHub App binding.
  Confine every operation to its configured subtree, retain a three-way sync
  base, apply pulls through existing Yjs texts, and publish reviewed changes as
  one non-forced direct commit by default; never synchronize content in the
  background. Allow bounded automatic status checks to advance only the commit
  checkpoint when the remote tracked snapshot exactly matches the retained
  base; never let them create previews, alter the retained base or project
  revision, or mutate either content authority.
  Keep import creation, bound-workspace synchronization, and their shared
  transport/error contracts in separate server modules; callers depend only on
  the phase they invoke.
  Keep opaque Import, Pull, and Publish preview identities and confirmation
  working state inside their owning Lit panels. Let the GitHub import panel own
  its read-only connection, installation, repository, and branch discovery
  lifecycle plus stale-request protection, import preview and creation requests,
  account disconnection, Valibot response validation, and local progress and
  failure presentation. Opening the panel starts that connection refresh as one
  component lifecycle. On its first connected lifecycle it also consumes
  successful OAuth/install query results, opens itself after its light-DOM
  template is ready, and removes the one-shot query without application startup
  wiring. Let the import panel close its own dialog and navigate to the validated
  successful response's canonical workspace href. Let the sync
  menu likewise own its bounded connection
  and status refresh interval, validation, stale-request guard, and primary
  presentation, then emit one state event for the settings mirror. Let the
  menu invoke the already-bound settings owner directly for settings and preview
  entry instead of accepting a duplicate open-settings callback. Let the
  detailed sync review own its Pull, Publish, and disconnect requests because
  their validation, payloads, progress, and results are local to that review.
  Keep Pull previews, Publish previews, and Publish confirmation results in the
  shared Valibot response-contract boundary; do not add local generic record
  predicates for individual GitHub responses.
  Emit completed synchronization mutations so the application coordinator can
  refresh canonical project and cross-component status state; retain page-level
  refresh pause policy, project refresh, and navigation in the coordinator.
  Delegate GitHub App JWT signing to pinned `@octokit/auth-app`. Normalize
  GitHub's PKCS#1 App keys to PKCS#8 with Worker-supported `node:crypto` before
  signing because Octokit's Web Crypto path accepts only PKCS#8; keep
  installation-token exchange bounded and request-scoped. Do not retain
  request-bound installation authentication promises in Worker module state.
  Share only the stateless bounded stream and JSON reader between GitHub App
  and user clients; keep their size ceilings and public error semantics
  explicit at each client boundary.
- Import LaTeX archives only through a bounded, authenticated Worker workflow
  that separates non-mutating inspection from reviewed project creation. Keep
  Markdown canonical; never retain TeX as a second editable authority or
  execute uploaded TeX. Let the bounded Lit import panel own dialog dismissal
  and navigation to the successful response's canonical workspace href. Keep
  constructor and reopened-dialog state aligned through one local reset
  operation rather than duplicated initialization lists.
- Preserve explicit TikZ source as canonical fenced Markdown. Do not render it
  until a separately approved isolated server boundary can compile it and its
  SVG output can pass inert-SVG validation.
- Express small editable graphics through versioned, bounded native Markdown
  directives and render them as derived sanitized preview SVG. Expand the typed
  vocabulary explicitly; never imply TikZ compatibility or approximate
  unsupported imported figures.
- Treat portable project Markdown and stable shared-library records as the
  canonical authored artifacts. Keep BibTeX as bounded derived interchange and
  export, not a second project-local metadata authority or an ordinary project
  editing surface.
- Preserve standalone `::: comment` blocks in canonical project Markdown while
  treating their contents as inert in composition, semantic analysis, preview,
  path rewrites, statistics, and publication outputs. Keep attributed
  collaborative comments as separate durable resources.
- Compose each paper from one persisted effective entry file through bounded,
  project-relative `::include[path]` directives. Resolve an omitted entry once
  by preferring root `main.md` and then the first normalized Markdown path;
  never infer composition by concatenating file order. Keep supporting Markdown
  files user-named and preserve authored heading levels.
- Give project files stable identities independent of mutable paths. Persist
  the file tree, all collaborative file texts, and their revision in one
  project-scoped `DocumentRoom`; qualify manuscript, evidence, and model
  anchors by file identity.
- Let the project-file dialog derive resource availability, initial path, and
  stable mutation target from its operation and canonical file/folder inputs.
  Let it own and expose the shared coalesced project-refresh coordinator because
  every accepted refresh applies through that same project-file authority.
  Bind its project API, canonical presentation owners, and narrow layout
  capability atomically rather than staging those production inputs
  independently. Let that binding install the Context/editor and settings/
  catalog application roots before its Preview, History, manuscript-map, and
  layout lifecycles, and configure the owned project-image upload transport from
  the same API authority. Let the same entry prepare the offline shell, start
  standalone Library mode when selected, or continue through the ordered
  project-workspace startup; the browser composition root only awaits that
  owner.
  It owns file/folder create and rename transport, file deletion transport,
  content-bearing workflow-file lookup, existing-file selection and focus,
  lazy creation and created-file Guide navigation, shared response validation, created-path verification,
  duplicate-submit gating, and retryable local failures. It also owns the
  supporting-file hidden projection, six-second
  delayed deletion, Undo restoration, failed-commit restoration, and deletion
  notices. For create-and-include, it retains the one-shot insertion
  continuation across its dialog lifecycle, derives the project-relative
  directive from the active and created paths, invokes it after applying the
  validated snapshot, selects an ordinary newly created file itself, and
  supplies only the derived included state and message through its typed
  workflow callback. It commits validated file, folder, tree, deletion, and
  upload snapshots to its own canonical projection and requests Preview
  rendering through its existing project-refresh binding. That binding consumes
  the canonical source, bibliography, catalog, connection, Context, history,
  and Preview owners directly; collaboration and offline persistence remain
  explicit non-DOM services, and the asset base derives from the configured API
  base. Its one presentation
  binding also supplies the assistant, editor, Preview, route, and notice
  owners. File activation sequences assistant availability, Preview reset and
  rendering, and canonical route replacement directly; project presentation
  applies the active file to editor status without an application callback bag.
  From one canonical snapshot it also
  owns active-file identity, entry fallback, hidden-file selection eligibility,
  canonical selection validation and activation routing, active file/folder
  resolution for dialogs, active-file deletion eligibility, and relative image
  insertion projection. It also owns authoring-range activation: resolve an
  omitted file to the entry file, select it, enter Write mode, and normalize the
  requested range through bound authoring capabilities. The accepted cross-
  feature mutation path likewise refreshes reference PDFs, presents Context,
  and requests Preview through that bound authority after applying the
  validated snapshot. It also owns explicit
  authoring and range reveal operations that reuse that activation path before
  scrolling through a narrow editor capability. Tree, workflow, save, deletion,
  Undo, route, and cross-feature selections all use that single activation path.
  The owner retains its latest projection inputs, reprojects
  the selected file with an explicit editor-reset signal, and then emits one
  argument-free cross-feature activation effect; the coordinator must not call
  back into the file owner to reconstruct activation. It projects the visible file
  collection and active/entry state into the project tree, Insert menu, source
  completion, and file menu, then supplies the canonical active file and
  snapshot through one presentation callback for Yjs/editor binding instead of
  returning presentation state to the coordinator. It also materializes that same visible collection
  with snapshot or live collaborative content for Preview, manuscript-map, and
  collaborator-selection consumers from the bound collaboration session. The
  session is the canonical owner of both the Yjs document and readiness state;
  the project-file owner derives each canonical text key and live-content readiness; consumers request the derived collection
  without repeating those rules. Let the owner
  accept either a response or snapshot from generic project mutations, validate
  it through the canonical workspace contract, install its projection, and
  await one argument-free post-accept effect. Keep workflow-template selection,
  collaborative caret capture and continuation construction, Yjs insertion and
  the global toast outlet in the workspace coordinator. Use one atomic
  application binding for the API base, workspace mode, presentation owners,
  collaboration session, and offline lifecycle; source, bibliography,
  revision, Preview, and Context capabilities arrive through those owners. The
  same project-file application binding installs Preview's canonical Yjs
  project lifecycle and the revision trigger's workspace lifecycle, so neither
  reciprocal project companion requires a second composition-root setup call.
  From its API base and bound collaboration session, it
  reads the session-owned Yjs document and readiness and owns validated snapshot transport without an
  application loader callback. It derives initial load from absence of its canonical snapshot, owns
  bootstrap-versus-refresh presentation, installs the snapshot, presents
  Context, schedules offline persistence, and refreshes linked PDFs in order.
  The same binding lets it request offline restoration, recover collaboration
  state and availability, set revision and the authorized catalog row, install
  and present the snapshot, project connection status, and render Preview. An
  offline-restored projection therefore makes the next network load a normal
  refresh without a separate bootstrap flag. The owner also sequences workspace
  opening across offline restoration, catalog refresh, and canonical project
  refresh. It locks the source and bibliography before restoration or network
  work; connection-state projection remains the only authority that unlocks
  them. It distinguishes missing first-use data from usable restored state,
  clears offline data when access is revoked, and otherwise projects an offline
  collaboration fallback through the bound authorities. The project-file owner is the
  single browser projection and read source for the accepted snapshot; the
  coordinator must not retain a duplicate copy. After application binding, let
  that owner start the project workspace in dependency order: open or restore
  the project, restore its UI route, begin ambient GitHub status refresh,
  connect collaboration, then honor the one-shot browser creation request.
  Complete that project application boundary by installing the workspace-layout
  and surface-route lifecycle last, so its root-readiness publication observes
  every preceding project binding.
- Let the editor-status Lit owner bind the active source, companion
  bibliography, source-completion workspace, and browser-local indentation
  controller atomically as one application
  authoring lifecycle. Install that reciprocal editor lifecycle through the
  Context application entry after its assistant companion and before Context
  presentation and routes, then bind the active Yjs
  text to the source editor,
  derive that text from the selected project-file identity and entry-file
  contract,
  retain per-file undo history, synchronize external text changes, and render
  local plus collaborator presence from a once-bound presence owner and
  subscribe directly to its selection changes. Switching
  active files must release the prior text observer and editor listeners before
  binding the next text. Bind the canonical application element registry
  directly for authoring-mode, assistant, citation, Context, highlight, toast,
  and collaborator-selection capabilities; pass the non-DOM collaboration
  socket separately instead of translating either boundary through aliases.
  Let the owner expose the active manuscript projection,
  apply bounded active-text insertions and replacements, focus the active
  source, and select their resulting range so those edits share its undo
  history. Bind source completion before indentation so a visible suggestion
  retains Tab acceptance; let Vim Normal and Visual modes retain their own
  keyboard authority while Insert mode shares ordinary indentation. Bind the
  remaining source interaction listeners after the Yjs textarea adapter
  so it captures the updated relative target, schedules collaboration presence,
  and refreshes assistant availability itself. Completion listeners remain
  responsible only for completion presentation. The coordinator must not retain a duplicate active Y.Text. The owner
  may preserve an insertion point as a
  Yjs-relative position across an asynchronous authoring workflow and must
  reject it after the active text changes. Before remote updates, let the same
  owner capture and
  restore Yjs-relative selections for the active source and those companions.
  Keep mutation decisions, cross-file path
  projection, assistant consequences, collaboration policy, and offline-save
  policy in the workspace coordinator. Let editor status derive the initial
  `source` and companion `bibliography` Y.Text values from its bound document;
  the coordinator must not cache or pass those derivable values.
- Let the editor Insert menu own the scholarly syntax templates it displays and
  route template and relative-include choices through its bound editor and
  notice owners without a one-use wrapper object. Let editor status expose the live insertion target from its
  owned source, caret, and passage state instead of constructing that projection
  in the application coordinator. The menu
  projects passage-aware links, selection ranges, image-template insertions,
  and immediate relative-include directives from that target. Route the derived
  insertion and preserved asynchronous
  insertion point through the editor-status owner. Let the project-file dialog
  derive the eventual create-and-include directive from its active and created
  paths, then delegate insertion and completion notice directly to the bound
  editor and toast owners.
- Let the source citation control own citation-at-caret interpretation,
  citation insertion syntax projection, local insertion errors, and completion
  copy from a resolved authoring caret. Route navigation through the Context
  owner and send one nullable insertion plus completion message to the editor-
  status owner through the editor's existing authoring binding. Let that editor
  owner apply the Yjs mutation, activate Write after success, and present the
  completion or local error. Keep publication resolution in Context.
- Let the project-image upload control own file-input state, sequential upload
  transport, response validation, duplicate-submit gating, and retryable local
  status. Emit only the final validated workspace snapshot and completion
  message. Let the project-file dialog project a selected tree asset into
  relative Markdown image syntax and a completion message from the canonical
  active file. Route image-upload and project-tree mutation completions through
  the project-file owner's canonical snapshot, Preview, editor, and notice
  bindings. Keep broader cross-feature rendering in the workspace coordinator.
  Let the project-tree panel own image deletion as part of its
  local row lifecycle.
- Let the project-tree panel own encoded empty-folder and image deletion
  transport and response validation plus optimistic row hiding, the six-second
  Undo window, delayed commit scheduling, restoration, and failure notices. It
  exposes hidden image identities so Preview does not resolve an asset during
  its grace window and returns validated snapshots for project-file-owner application.
  Bind those outcomes through the project-file owner beside upload and
  supporting-file mutation completion. Keep broader cross-feature rendering
  and the global toast outlet in the workspace coordinator.
- Store project image metadata beside the durable file tree and keep its bytes
  as bounded, inert R2 objects under the reserved `figures/` path. Do not put
  uploaded image bytes in Yjs. Accept SVG only as validated UTF-8 image content
  without active or external-resource constructs, and serve it under a
  no-script, no-network sandbox policy.
- Let the Preview DOM adapter resolve safe relative Markdown image targets
  through canonical file/source-map and authorized asset inputs. Keep hidden
  deletion state and workspace authorization in the application coordinator.
- Let the compact workspace-switcher Lit owner navigate only through canonical
  hrefs from its coordinator-supplied authorized catalog. Ignore empty, active,
  or non-catalog selections instead of reconstructing routes in the application
  coordinator.
- Represent reusable project templates as versioned sanitized seeds containing
  only Markdown files, folders, portable BibTeX, and publication settings.
  Store personal templates in a separate owner-keyed authority; never use a
  hidden project, the workspace catalog, or a complete revision seed. Template
  instantiation is an independent copy with no live inheritance. Let an
  authorized researcher also instantiate a one-off project from an existing
  project's current sanitized seed without persisting that seed as a personal
  template.
- Keep template-catalog loading, existing-project preview loading, project
  creation, personal-template deletion, fetched catalog state, optimistic
  hidden-template state, the six-second delayed commit and Undo lifecycle, and
  the derived visible-template view inside the starting-point Lit component.
  Let every successful template-catalog refresh report that visible view through
  the component's typed template-change binding so replacement consumers cannot
  drift from the fetched or post-delete catalog.
  Let it own Cancel and close itself before handing either import choice to the
  coordinator, and let it navigate to the validated project-creation response's
  canonical workspace href. The
  template-save Lit dialog owns promotion requests, response validation,
  create-or-replace outcome wording, and its loading-to-ready/error lifecycle.
  The workspace-settings Lit owner closes
  before handing the current project title to that workflow. The starting-point
  owner supplies the template catalog and the toast owner supplies successful
  promotion notices directly; the application coordinator retains only import
  workflow connections.
- Require every composition result to retain source-map spans back to file
  identity, source range, output range, and include chain. Reject unsafe paths,
  cycles, missing files, and resource-limit violations with navigable
  diagnostics.
- Derive every publication target from one versioned, source-mapped export
  intermediate. Markdown, cited BibTeX, LaTeX, PDF, statistics, and archives
  must not independently resolve includes or citation reachability.
- Treat authored Markdown headings as the only visible publication titles.
  Project-settings titles may identify artifacts and PDF metadata but must not
  be injected into PDF or LaTeX body content.
- Pin export schemas, maintained templates, PDF rendering, and ZIP encoding at
  reproducible boundaries. Keep Markdown canonical; generated LaTeX and PDF
  are publication targets and never write back into authored files.
- Do not execute arbitrary authored TeX inside the hosted Worker. The bounded
  default PDF renderer may consume the shared intermediate; a future custom
  TeX engine requires a separately isolated, resource-bounded execution
  boundary and mapped diagnostics.
- Count publication words from composed prose under a named, testable rule and
  expose totals by file and heading. Use the same rule for revision word
  deltas, and disclose excluded syntax rather than implying a universal
  publisher policy.
- Treat parsed syntax, previews, Yjs updates, indexes, and model candidates as supporting representations.
- Parse standard and scientific-writing Markdown through the pinned, browser-safe Scholarmark entry with its bounded BibTeX parser; do not install the optional Citation.js adapter, and keep syntax trees and HTML derived.
- Keep live preview local and pure JavaScript; do not add request-per-edit Worker rendering without measured revision, network, and CPU evidence.
- Escape authored raw HTML and sanitize the final preview tree after all syntax plugins; allow only the elements, properties, and URL protocols required by the scientific-writing vocabulary before inserting output into the DOM.
- Return a restrictive Content Security Policy on application HTML as an independent browser-execution boundary; do not permit inline or evaluated scripts.
- Coordinate each collaborative composed project through its own SQLite-backed Durable Object.
- Coordinate every review through three independent SQLite-backed authorities:
  an identity-scoped `ReviewCatalog` for discoverable summaries and private
  storage locators, a review-scoped `ReviewAccess` for membership, lifecycle,
  and project-link history, and a `ReviewStudy` for the structured workflow and
  its monotonic revision. Give each review a stable UUID that is independent of
  workspace identity; never expose its storage locator as public catalog data.
- Keep review, project, and owner-private Library authorization independent. A
  project-review link grants access to neither endpoint, and project-backed
  evidence or publication requires both review membership and access to the
  selected linked project.
- Represent project-review relationships as many-to-many soft links with
  stable identity, actor, creation time, and `active` or `unlinked` state.
  Unlinking or deleting a project must not delete the live review or previously
  materialized project artifacts; deleting a review is a separate owner action
  that atomically tombstones access before cross-object cleanup, unlinks active
  relationships, removes its study and collaborator catalog authority, and
  retains a hidden owner catalog locator plus bounded access tombstone as a
  durable retry handle, without rewriting retained project history.
- Keep `/review/{reviewId}` and `/api/reviews/{reviewId}` canonical. Treat
  `/review/{workspaceId}` and `/api/workspaces/{workspaceId}/review-study` as
  bounded legacy adapters: atomically assign one stable review UUID, seed
  membership once from the then-current project members, create the explicit
  project link, and retain the existing workspace storage key behind the
  catalog locator instead of moving review data. Later project membership
  changes must not alter the independently seeded review membership.
- Keep protocol revisions immutable, configure SLR and MLR source, search,
  stopping, credibility, and synthesis rules as structured profile data, keep
  the selected SLR or MLR profile immutable after review creation, and generate
  source-specific queries from one logical concept model. Require
  every post-freeze amendment to declare its rationale and affected stages or
  records, then retain explicit reassessment obligations without rewriting
  earlier protocol-bound events.
- Keep review screening decisions append-only and reviewer-attributed. Derive
  stage outcomes from the configured independent-review policy, blind pending
  peer decisions when requested, and resolve conflicts through separate
  adjudications instead of overwriting either judgment. Keep final inclusion as
  a separate append-only decision after full-text eligibility; only its current
  includes enter evidence and synthesis.
- Keep review quality answers and extracted values typed, revisioned, and
  pinned to the protocol and stable criterion ids/text. Require an explicitly
  selected active project link, review and project authorization, exact
  resource and selector identity, and quotation/location for present claims;
  require an explicit missingness reason when an extraction value is absent.
  Derive checklist scores and completeness instead of persisting them as
  authority. New evidence must never use a legacy unresolved selector.
- Derive review flow counts, source yields, RQ coverage, and evidence matrices
  from versioned analysis definitions over one exact retained review revision.
  Keep RQ findings append-only and require every declared appraisal or
  extraction contributor to retain exact evidence. Publish a reviewed
  synthesis only through an explicitly selected active project link and a
  revision-checked `review/{reviewId}/*.md` project artifact. Bind the
  materialization to project history with review, link, publication, protocol,
  and analysis identities and revisions, generator/schema identity, publisher,
  time, and digest; resolve `::review-artifact[...]` identically in preview and
  publication. Never let background review changes rewrite manuscript files or
  ordinary edits mutate a pinned artifact.
- Keep local-model review assistance browser-to-loopback. Store the operation,
  provider, model, prompt version, authorized source scope, result, and human
  disposition; model candidates remain inert until explicit acceptance.
- Keep each transient assistant result's captured passage, source revision,
  evidence, and continuation authority inside its Lit result owner. Emit that
  complete typed context with table, clarity, or revision intents. Let the same
  result owner perform table, clarity, ideation, and phrasing provider requests
  as well as reference-query formulation, registry discovery, response
  validation, and local reference import because those complete lifecycles serve
  its transient results. Let the candidate-list Lit owner perform revision and
  claim-draft provider requests, persist their typed candidates, derive fixed
  adapter and prompt-version fields, and validate the operation-specific
  response. Assistant and Library discovery owners share one stateless Lit
  result-card template for provider, metadata, verification-link, and save-state
  presentation while retaining their independent request and refresh policy.
  Let a bounded assistant-generation Lit presenter own the browser-local XState
  actor and route all registered operations across the typed task, result, and
  candidate-list owners. It derives operation-local request context from
  coordinator-supplied canonical manuscript, target, stability, snapshot, and
  revision inputs plus assistant-owned task, evidence, and validated model-
  settings state. It owns workflow transitions, busy and decision availability,
  source-staleness transitions, status presentation, model-settings and task
  subscriptions, evidence selection and focus guidance, generation routing,
  clarity continuation, captured-table validation and portable spacing,
  promoted-revision persistence sequencing, candidate decision state,
  candidate-review event subscriptions, generated-candidate refresh-before-
  open, and completed-decision refresh, recovery, notice selection, and
  workflow completion. Candidate persistence remains inside the candidate-list owner. Derive canonical
  candidate, project-PDF, project snapshot, Library-refresh, assistant-tab, and
  no-evidence notice routes from the context-resource presenter already supplied
  by the assistant workflow binding, and store those derived routes in that same
  atomic binding instead of maintaining parallel nullable lifecycle state or installing a parallel resource
  stage or repeating routes across task, result, and candidate workflows. Use
  one atomic application binding for the API base, collaboration stability,
  authoring and workflow owners, candidate panels, interactive result, model
  and task controls, and evidence selection so production startup cannot expose
  a partially wired assistant surface. Bind all remaining application-owned
  generation inputs directly from the Insert-menu,
  Context, Research-rail, toast, and canonical refresh owners instead of a
  workflow callback bag. Bind the Context owner directly;
  the presenter owns assistant-context activation and decision-state
  re-presentation plus its resulting availability refresh. Bind canonical file
  identity, manuscript text, target range, and source revision directly through
  the project-file, editor-status, and history owners; keep collaboration
  stability as an explicit non-DOM service rather than translating these
  sources through aliases or getter adapters;
  let the presenter derive scoped and insertion passages, generation input,
  availability, target presentation, and captured-table validity from those
  same sources, including snapshot availability from its canonical project
  route. Let it also present candidate review from its owned decision and
  authoring state when the Context owner supplies only candidate identity,
  canonical snapshot, and restored scroll position. Keep
  authorized Yjs mutation, editor selection, remembered authoring selection,
  canonical refresh execution, context-state mutation, and notice presentation
  in the application coordinator through narrow typed callbacks.
  Let the candidate-review Lit owner resolve the active candidate id against
  the canonical workspace snapshot and derive evidence availability and local
  applicability from candidate, evidence-version, source-revision,
  anchor-resolution, document-stability, and busy inputs; gate decisions; own
  encoded apply/reject transport, retryable same-candidate failures, and
  decision-specific completion wording; and emit typed start and completed
  outcomes. The server independently revalidates every
  canonical mutation. Keep cross-feature workflow transitions, canonical
  refresh, tab movement, and toast policy in the coordinator.
  Let reference-discovery cards use the shared CSL projection and import adapter
  while owning duplicate-submit gating, local retryable failures, and refresh-
  pending state; retain canonical Library refresh and cross-panel workflow status
  in the coordinator.
- Route an approved assistant table through the editor insertion owner as an
  explicit passage replacement. That owner derives the replacement and final
  caret range through its existing insertion capability; the workspace
  coordinator retains the canonical Yjs transaction and editor focus.
- Keep browser-local assistant evidence selection, count or limit status, and
  reconciliation against canonical annotations and claims plus ordered
  annotation-or-claim model-evidence projection inside the Lit workflow-status
  owner, including the annotation-only item and version subsets required by
  claim drafting, operation-specific target and evidence requirement
  validation, synchronization guidance, and generation-start copy.
  Retain the canonical collections supplied during reconciliation for later
  projection. The coordinator supplies resolved target availability, document
  stability, and result-specific status; it must not parse selected keys,
  re-filter projected evidence, duplicate requirement or start wording, keep a
  parallel selected-key set, or re-supply the same collections for projection.
- Keep assistant claim-relation normalization, rhetorical-purpose resolution,
  structured-table parsing, and non-throwing table readiness inside the Lit
  task owner that stores those raw fields. The coordinator consumes typed task
  projections when dispatching model operations and must not re-parse them.
- Keep operation-specific generation readiness inside that task owner. The
  coordinator supplies canonical stability, evidence counts, target
  availability, provider availability, and workflow activity; it must not
  duplicate the operation policy that combines those inputs.
- Back up reviews independently of projects. Owner backup schema v3 stores each
  review's catalog record and locator, access state, complete active and
  unlinked project-link ledger, revision seed, and a bounded canonical
  content-addressed R2 payload for the allowlisted relational ReviewStudy
  authority. Restore drills hydrate and verify isolated `ReviewCatalog`,
  `ReviewAccess`, and `ReviewStudy` identities, compare payload and unblinded-
  authority digests plus exact revisions, and never address canonical review
  objects. Derive history, interchange files, PRISMA flow, and the deterministic
  review package from one revision-pinned authority snapshot; retain explicit
  compatibility for project-associated v2 and legacy v1 owner manifests.
- Keep owner-backup schemas, deterministic projection and key derivation, and
  versioned manifest validation as separate domain modules behind the stable
  `backups.ts` facade. Validation may depend on schema types, but projection
  helpers must not depend on compatibility validation or coordinator state.
  Owner manifests, review payloads, and recovery comparison share the same
  code-point-ordered canonical JSON primitive and SHA-256 text encoding.
- Keep review JSON/history, tabular interchange, PRISMA rendering, and ZIP
  assembly as separate format modules behind one stable review-export facade.
  Every formatter consumes the same revision-pinned authority; formatters do
  not depend on package assembly or API routing.
- Coordinate each personal reference library through a separate SQLite-backed
  Durable Object keyed by verified owner identity. Stable source identity must
  not depend on a DOI, title, filename, or project citation alias.
- Give each stable UUID-backed source a separate unique, immutable,
  author-facing reference key. Derive the key once from available author,
  year, and title metadata; never change it during later enrichment.
- Keep bibliographic provenance per field. Import and metadata services may
  suggest and deduplicate records, but source-type requirements must remain
  explicit and missing values must never be fabricated.
- Reconcile Library records only after the owner chooses a canonical record
  from a strong DOI or title-year-first-author match. Move owner-private
  dependents atomically inside the Library Durable Object, preserve canonical
  values and field provenance, and block deletion of a record that still owns
  project links, web-capture history, or research shares. Never coordinate a
  distributed project rewrite from the merge transaction.
- Create a provisional `misc` library record when a PDF is uploaded, deriving
  only its title from the filename and attaching the private artifact in the
  same library transaction. Let researchers enrich metadata later.
- Let the project publication Lit list own DOI-enrichment transport, stable
  encoded publication targets, duplicate-submit gating, retryable local
  failures, and its publication and project-reference projection from the
  canonical workspace snapshot. Route enrichment, Library management, and
  context navigation through one typed binding while keeping canonical
  workspace refresh and notification policy in the application coordinator.
- Keep bounded PDF batch execution, upload transport and response guards,
  partial-failure progress, ephemeral retries, duplicate-submit gating, and
  refresh-pending state in the Lit upload control. The companion status owns
  presentation; the application coordinator retains canonical Library refresh,
  duplicate-source navigation, and toast policy.
- Keep legacy unattached-PDF selection, identification transport,
  duplicate-submit gating, local progress and retryable failures, and
  refresh-pending state in the Lit identification queue. Let that queue derive
  the unattached subset and reference choices from the canonical Library
  snapshot. The application coordinator retains canonical Library refresh and
  toast policy.
- Extract PDF metadata only as bounded, browser-local suggestions. Apply
  canonical library changes per field after the library authority verifies the
  artifact/reference relationship; never change the immutable reference key.
- Project reviewed metadata alternatives beneath their corresponding canonical
  editor inputs, but keep manual save, PDF acceptance, and provider acceptance
  as explicit provenance-preserving operations.
- Keep the browser-local metadata-refinement actor, PDF extraction, provider
  preview and acceptance requests, response guards, stale-response rejection,
  manual bibliographic persistence, busy state, and retryable errors in the Lit
  metadata editor. Emit only canonical-refresh and notice outcomes to the
  application coordinator.
- Keep private tag, collection, reading-state, note, and archive mutations,
  destructive confirmation, duplicate-submit gating, and retryable error state
  in the Lit personal-fields block. Emit only a successful canonical-refresh
  outcome to the application coordinator.
- Keep owner-library PDF rights persistence, value validation,
  duplicate-submit gating, and retryable error state in the Lit PDF rows. Keep
  PDF opening, cross-component metadata refinement, and canonical Library
  refresh policy in the application coordinator.
- Keep provider-preview reuse bounded, short-lived, owner-scoped, and ephemeral
  in Reference Library Durable Object memory. Never let cached preview data
  bypass acceptance-time provider refetch or fingerprint verification.
- Enrich DOI-backed library records only through a non-mutating provider preview
  and fingerprint-verified refetch. Group records by normalized DOI before
  field review, never mix different works, and apply selections from one or
  more providers in one atomic library update with provenance per field.
- Keep library PDFs, web captures, notes, highlights, tags, and reading state
  owner-private by default. A project citation receives only its local alias
  and bibliographic snapshot; sharing any additional resource must be a
  separate explicit, rights-checked action pinned into a project revision.
- Let the owner open the private Library at `/library` without resolving a
  workspace. Standalone library bootstrap must not create or load project
  state, connect collaboration, or expose project linkage and sharing actions.
- Let the owner read a private library PDF through a kind-qualified private
  context tab and the owner-private stream. Opening, navigation, and selection
  do not mutate state; only an explicit save may create or geometrically extend
  a page-and-quote highlight in the owner library. Private capture may not expose project
  evidence controls, import, share, or cite the artifact.
- Treat CSL JSON and portable library ZIPs as bounded interchange adapters,
  not canonical storage. Metadata archives omit private binary artifacts unless
  a future explicit rights-aware contract says otherwise.
- Keep BibTeX and CSL JSON file selection, file reads, import transport,
  duplicate-submit gating, local error state, and refresh-pending state in the
  Lit reference-import control. Keep canonical Library refresh and toast policy
  in the application coordinator.
- Keep portable-archive selection and restore transport, duplicate-submit
  gating, local error state, and refresh-pending state in the Lit Library tools
  menu. Let it apply archived-reference visibility locally and emit only the
  need for canonical refresh. Let the composed reference Library workspace
  encompass discovery, import, PDF upload/status, web capture, tools, filters,
  results, citation network, and unidentified-PDF controls; route their outcomes
  directly through its bound feature owners while retaining canonical Library
  refresh and toast policy in those authorities.
- Model each web source as one stable owner-library identity with append-only,
  timestamped captures. Retrieve only bounded public HTTP(S) content through
  manually validated redirects, store raw/readable representations privately
  as inert R2 objects, and make projects pin an exact capture rather than a
  mutable latest URL. Validate capture registration as a strict single-key
  Valibot request contract with a non-empty, bounded URL before normalization.
- Treat web-capture comparison as neutral readable-text change data. Never
  render fetched markup, silently move a project pin, or infer authority or
  correctness from a capture or diff.
- Let the web-source capture and comparison Lit components own their request
  lifecycles, Valibot-backed comparison-response guard, duplicate-submit state,
  and local progress or failure presentation. Keep canonical Library refresh
  and toast policy in the application coordinator.
- Store source-to-source citations as owner-library assertions between stable
  reference identities, with direction, polarity, evidence state, source,
  retrieval time, method, confidence, and review. Derive conflicts without
  overwriting assertions; keep manuscript `cites` links separate.
- Derive the bounded citation network from relational assertions, pair every
  graph with an accessible provenance list, and expand a DOI-backed source only
  through an explicit bounded provider request. Use Crossref work references
  for backward rounds and DOI-backed Semantic Scholar citations for forward
  rounds. Accept an external expansion candidate only after a direction-aware,
  fingerprint-verified provider refetch, then create or reuse its library
  identity and correctly directed extracted citation assertion atomically. A
  project id narrows the private projection but never grants library access.
- Keep graph domain contracts renderer-neutral and graph actions available as
  ordinary DOM controls or lists. The citation network may use its lazy-loaded
  Cytoscape runtime for derived layout, viewport interaction, hit testing, and
  visual selection, but those concerns and node positions never become
  canonical graph state. Keep the project map's resource actions in native DOM
  and its measured connectors in dependency-free SVG.
- Let the citation-network Lit workspace own loading, project filtering,
  request generations, response guards, manual assertion and review mutations,
  expansion and candidate acceptance, local progress, and retryable failures.
  Let it derive human-facing node titles from canonical bibliographic records,
  and emit only notice and canonical Library-refresh outcomes to the
  application coordinator.
- Retain immutable project-wide logical revisions separately from the
  manuscript concurrency revision. Each history snapshot must atomically
  preserve the exact Yjs state, stable file tree, aliases, pinned source and
  research snapshots, PDFs, annotations, claims, and their relationships.
- Coalesce rapid manuscript updates into one short-lived untagged working
  checkpoint. Naming a milestone freezes that snapshot; explicit resource and
  project operations always create distinct history revisions.
- Keep historical views read-only and milestone names immutable. Restoring an
  older snapshot must create a new head, preserve the intervening timeline,
  and reset connected browsers before their newer CRDT state can merge back
  into the restored document.
- Compare project revisions by stable file and binary identity. Treat path
  changes as renames, compose `main.md` at both endpoints, and report neutral
  additions/removals without interpreting correctness.
- Keep the browser-local history actor, timeline and operation requests,
  response guards, confirmations, busy state, and stale-response rejection in
  the project-history Lit dialog. Let it own canonical successful branch
  navigation, post-restore reload, and notice forwarding. Let the History
  trigger's workspace binding configure that dialog with itself and the global
  toast owner while retaining revision and offline-save consequences, so the
  application coordinator does not initialize the sibling relationship or
  adapt offline scheduling.
- Treat project unlink, library archive, share revocation, and permanent owner
  deletion as distinct operations. Revocation is forward-only; deletion keeps
  only the tombstoned provenance needed by historical project revisions.
- Treat a read-only project URL as a revocable bearer capability. Persist its
  active secret and validation hash only in the locator access object so an
  authenticated owner can retrieve the same no-store URL later. Expose only
  the live composed Markdown, authored project source, and an on-demand
  rendering of the canonical PDF output, and keep member identity, private
  research, general APIs and exports, and
  mutation-capable collaboration channels behind authenticated workspace
  authorization.
- Treat an edit URL as a separate revocable bearer capability. Let it read and
  replace authored Markdown files through revision-checked, same-origin
  mutations, but do not expose membership, administration, private research,
  history, general APIs, or Yjs state. Its same-origin presence socket may
  exchange only validated, ephemeral caret and selection metadata, and must be
  disconnected when the capability rotates or is revoked.
- Keep authenticated member listing and invitation plus read-only and edit-link
  status, creation, and revocation inside the bounded sharing Lit component.
  Validate responses there and bind the sibling trigger and global toast owner
  directly, avoiding parallel trigger and notice adapters in the application
  coordinator.
- Keep public read-only viewers outside cross-origin embedder isolation so
  browser-native PDF extension frames can render their share-scoped,
  independently authorized same-origin PDF response. Keep authoring pages
  cross-origin isolated.
- Refresh open read-only project views through a bearer-authenticated,
  same-origin WebSocket that emits revision/reset notices only. Never send Yjs
  state, presence, selections, resource events, or accept client messages on a
  reader connection; disconnect readers when the capability rotates or is
  revoked.
- Evolve every SQLite-backed Durable Object through an ordered, named,
  append-only migration ledger. Apply each pending schema or data migration and
  its ledger record in one synchronous transaction; fail closed if applied
  version/name history changes.
- Verify Durable Object migration, transaction, RPC, and eviction contracts in
  an isolated real `workerd` runtime through the dedicated Cloudflare Vitest
  project. Node tests may cover shared pure logic but must not stand in for
  platform storage behavior.
- Return anticipated client conflicts from new or modified Durable Object RPC
  methods as typed, serializable result values. Reserve thrown RPC exceptions
  for unexpected or infrastructure failures so routine `4xx` responses do not
  pollute error telemetry or poison a reusable stub.
- Send collaboration frames through one guarded boundary that ignores closed
  sockets and confirmed disconnect races while rethrowing every other send
  failure.
- Serve browser scripts with explicit same-origin resource policies so module
  workers remain loadable without cross-origin fallback behavior.
- Discover workspaces through a separate SQLite-backed catalog per authenticated identity; never use one catalog as the collaboration atom for all documents.
- Use `/` as a bounded dashboard over authorized recent projects, owner-private
  Library records, and independent reviews. Opening it must not choose or
  create a workspace, restore manuscript state, or connect a collaboration
  socket. Catalog discovery may perform only the bounded, idempotent
  registration of existing legacy project-associated review data; it must not
  initialize a new review workflow.
- Keep `/editor/{id}` as the canonical browser identity for an editable
  project and `/api/workspaces/{id}` as its stable API identity. `/editor`
  redirects to the first active authorized catalog entry, using the compatible
  `demo` workspace by default. Redirect legacy `/workspaces/{id}` browser
  locations to `/editor/{id}` while preserving their query strings; do not
  rename workspace APIs or storage identities as a browser-navigation side
  effect.
- Address public read-only shares through opaque, persisted locators that map
  to validated workspace storage targets only after bearer-token verification;
  never require a browser workspace id to be globally routable.
- Establish collaboration through a server-led Yjs handshake: send current
  binary state before a versioned synchronization control message, and never
  send speculative browser state on connection open.
- Retain ordered browser updates until the document room acknowledges durable
  handling; after reconnect, replay only updates that were not acknowledged.
- Keep the browser collaboration XState actor, ordered update queue, Yjs server
  shadow, acknowledged server vector, and offline-delta reconstruction behind
  one typed session authority. Put WebSocket creation, reconnect and selection
  timers, online/offline browser subscriptions, protocol-aware endpoint
  derivation through its injected browser environment, strict control routing,
  binary-update application, queue flushing, reset cleanup, and reload
  sequencing behind a typed socket authority around that session. Let the same
  authority own the document-wide local-update subscription, offline-save
  scheduling, session-owned local-origin filtering and enqueueing, save-status
  selection, assistant invalidation, immediate flush, and explicit teardown.
  Construction binds both the canonical session document and the available
  online/offline browser lifecycle; independently callable unbound document or
  socket states are not exposed. Let the session create and store its opaque
  remote and offline update origins as one filtering policy rather than making
  the application construct tokens or supplying an ignored origin to each
  observer.
  Bind the canonical offline, refresh, editor, revision, presence, connection,
  project-file, assistant, and toast owners directly for editor-selection
  preservation, canonical revision effects, resource refresh, and UI projection
  instead of projecting an application callback protocol.
- Keep a validated, identity-and-workspace-scoped browser copy of the latest
  authorized snapshot, full Yjs document state, and acknowledged server state
  vector so existing Markdown files remain editable offline. Reconstruct only
  the state-vector delta on restart, send it after the normal server-led sync,
  and clear local copies on reset and hosted logout. Validate the persisted
  record shape, schema version, ArrayBuffer state fields, and 16 MiB bounds with
  one inferred Valibot schema, then keep identity and workspace matching
  explicit. Keep record loading, snapshot validation, server-vector decoding,
  Yjs restoration, anchor reprojection, and corrupt-record eviction in the
  offline persistence authority. Let one typed offline session bind the store,
  canonical collaboration and project-file owners, editor status, toast, and
  optional browser lifecycle once. Derive the document, offline origin,
  snapshot, server vector, availability, and synchronization state directly
  from those owners rather than accepting callback projections. Let the session
  own Yjs encoding, debounced scheduling and flush,
  restoration delegation, project-copy clearing, and combined IndexedDB/shell-
  cache cleanup. Let that session also own page-exit persistence and hosted-
  logout interception, cleanup, navigation, save/failure presentation through
  its bound editor-status and toast owners, and explicit listener teardown. The
  browser lifecycle is installed atomically with session construction rather
  than through a partial bind stage. Let the offline module's browser factory
  derive the IndexedDB-backed identity/workspace store and hosted-logout target
  so the composition root does not repeat browser persistence policy. Keep collaboration queue recovery and restored-state UI
  projection in their existing owners.
- Cache only authenticated canonical editor navigation and the allowlisted
  authoring shell for offline fallback. Never service-worker-cache dashboard,
  review, or Library data, project/library APIs, WebSockets, exports, model
  requests, or private PDF bytes. Let the application-version Lit owner combine
  the build-derived shell identity with the Worker version metadata returned by
  the no-store public health contract. Validate that response before presenting
  it, identify absent local metadata explicitly, and fail open to shell-only
  diagnostics. The same owner keeps service-worker registration, update refresh
  sequencing, workspace-navigation caching, and ready projection. Bind the
  offline-persistence and toast owners together during shell preparation so the
  control owns the pinned update notice, persistence-before-refresh sequence,
  reload action, and copy outcomes.
- Publish immutable browser runtimes under content-fingerprinted URLs. Derive
  the service-worker cache namespace from the built shell so a shell change
  installs a new cache generation and activation removes older Kirjolab shell
  caches.
- Materialize every causally new collaborative update into readable Markdown
  and bibliography text, but acknowledge duplicate or replayed Yjs state at the
  current revision without persistence, rebroadcast, or a revision increase.
- After synchronization, derive browser editor text from Yjs and its displayed
  revision from collaboration controls; REST resource refreshes must not write
  either value.
- Keep the native textarea as the only manuscript input surface. Derive syntax
  highlighting into an inert, text-identical presentation layer so styling
  cannot change canonical Markdown, selection offsets, or collaboration.
  Keep CodeMirror outside the production path: the reproducible parity spike
  demonstrates core editing mechanics but does not justify its approximately
  258 KB gzip cost or leave iPad, IME, forced-colors, and screen-reader parity
  implicit.
- Keep the bounded LaTeX converter authoritative for server-side archive import.
  The development-only `unified-latex` spike may inform a future replacement,
  but no parser may enter production unless its adapter retires equivalent
  lexical mechanics and preserves inert execution primitives, archive-local
  access, visible unsupported source, diagnostics, and output bounds.
- Let the bounded writing-workflow panel derive and download the reviewer-
  response letter from its supplied canonical matrix. Let the manuscript-map
  Lit owner atomically bind the diary and both workflow panels to their shared
  project-file and notice capabilities alongside its own project presentation.
  Install that reciprocal manuscript-map lifecycle through the project-file
  owner's existing application binding.
  Each panel owns its
  canonical path and template choice, delegates creation and created-file
  navigation to the project-file owner, and routes source ranges through that
  same owner. The diary summary likewise owns its dated template choice. Keep
  editor focus and global toast presentation in their existing authorities.
- Keep native-textarea infrastructure in a bounded browser adapter that owns
  Yjs synchronization and history, highlight and presence mirroring, completion
  geometry, relative-selection capture and validated resolution, atomic text-
  range splices, and optional keymap binding. The application coordinator
  retains document, workflow, and navigation authority; it supplies canonical
  ranges and consumes only resolved numeric ranges.
- Let the editor-status Lit owner retain the browser-local active authoring
  target as Yjs-relative positions and own file context, range selection,
  resolved target and caret, non-empty passage projection, temporary range
  preservation across asynchronous authoring operations, and file, line-range,
  caret, and selection wording. Reuse relative-position capture and resolution
  from the source-editor adapter. Apply bounded authoring text mutations,
  active-source focus, and resulting selection in this owner. Publish each
  resolved target directly to the bound citation, assistant, and Context
  authorities. Keep mutation decisions, downstream feature policy,
  collaboration interpretation, and offline-save policy in those authorities.
  Install the bounded Vim control against the same source and shell and bind
  the Insert menu against this editor and the canonical toast as part of that
  atomic authoring lifecycle; the application must not expose separate partial
  setup stages for either sibling.
- Let the connection-status Lit owner bind the collaboration workflow and
  authoring controls once, derive label/tone and source/companion editability,
  request assistant-availability refresh after each workflow transition, and
  combine restored offline presentation with pending-versus-saved wording.
  Establish that binding atomically when the collaboration socket receives the
  same session and canonical owners; do not expose a separate application setup
  phase for status projection. Derive the shared project-refresh coordinator
  from the canonical project-file owner already present in that owner set; do
  not pass a duplicate refresh capability through the composition root.
  Keep socket transport, collaboration-state transitions, Library-mode status,
  and other save transitions in their existing authorities.
- Let the preview-synchronization Lit owner bind the native source viewport and
  inert highlight lines; own click, selection, and navigation-key follow
  behavior; derive the source offset nearest the viewport center; center the
  editor on a requested source offset; resolve composition-map offsets in both
  directions; derive explicit versus wide split-layout availability and the
  corresponding centered or selected source offset; and delegate file focus
  and Preview synchronization through directly bound project-file and Preview
  owners. The workspace Preview installs this complete source binding with its
  project lifecycle. Keep active file, context, and layout authority, Preview DOM
  navigation, caret placement, and focus policy in the application coordinator.
- Keep source-completion interaction in its bounded light-DOM component: use
  one atomic workspace binding for the editor, citation-scope control, project
  acceptance owners, and API route; bind editor change, keyboard, and blur behavior there; invoke one coordinator
  callback for authoring-selection, presence, and model-availability
  consequences; persist citation suggestion scope there; detect citation and
  include contexts from the bound editor there; rank
  and adapt candidates there, own empty-state hiding and popup positioning
  there, dismiss locally on Escape or editor blur, and bind one typed project
  acceptance boundary. Derive citation
  and project-relative include candidates there from coordinator-supplied
  canonical project files and reference links. Let the component load, validate,
  and cache its private-Library candidate input only when that local scope is
  active. The completion owner applies relative includes immediately. For a
  private-Library citation it preserves the selected range through the editor
  owner, requests project linking, delegates canonical snapshot application,
  resolves the range again, applies the citation through the insertion owner,
  and presents completion. Bind the project-file, editor-status, insertion, and
  toast owners through that same workspace lifecycle so the application coordinator retains only active-file
  identity plus canonical snapshot and Yjs authority without parallel
  acceptance callbacks or cached completion state.
- Implement optional editor keymaps as bounded textarea command adapters that
  emit ordinary input changes. Keep keymap preference browser-local, preserve
  IME and modified browser shortcuts, and never create a second document model.
  Let the editor-status authoring lifecycle supply the canonical textarea and
  visual shell to that adapter.
- Keep collaborator selections ephemeral. Accept only bounded, versioned
  selection metadata for the current file revision, replace client identity
  with a server-assigned socket identity, and never persist selection state.
  Let the collaborator-selection Lit owner store, replace, remove, clear, and
  prune that browser-local remote selection collection and request overlay
  refresh through a typed callback. Let the project-history trigger own the
  monotonic presented revision and route revision-dependent collaborator data,
  highlight refresh, offline scheduling, and candidate refresh through bound
  owners. Keep WebSocket protocol, server revision authority, and local-author
  selection in the collaboration authorities.
- Keep manuscript comments outside canonical Markdown. Attribute them to stable
  workspace-person ids, anchor them with file-qualified Yjs relative positions,
  retain them in project history, and preserve resolved comments as resources.
- Let the manuscript comment Lit panel own create, re-anchor, and resolve
  transport, local status and retryable failure state, open-comment count
  derivation from its canonical collection, authoring-action routing,
  synchronization and selection gating, action-specific feedback, and completed
  mutation outcomes. Bind one read-only authoring snapshot, passage navigation,
  notification presentation, and completed mutations through the enclosing
  resource presenter's one canonical route boundary; keep Yjs selection
  resolution, revision and collaboration authority, canonical refresh, and
  cross-feature navigation in the coordinator, and route the derived count to
  the rail. Do not duplicate project, Library, or linked-reference PDF getters
  on that route boundary: the presenter consumes the first two catalogs from
  its canonical context source and the latter from owned linked-PDF state. Do
  not feed that owned catalog back through the context source.
- Store imported PDF bytes in R2 and keep annotations as separate scholarly resources.
- Combine PDF page/geometry identity with exact quote, prefix, and suffix selectors; never require mutation of the imported PDF.
- Normalize PDF selection rectangles to top-left page coordinates in zero-to-one space so highlights do not depend on viewport pixels.
- Model a mutable PDF highlight as one stable annotation with ordered, provenance-bearing selection strokes. Auto-save paint strokes, address undo and erasing by stroke identity, and keep claim-dependent annotation deletion guarded.
- Keep the shared PDF annotation composer's active editing identity, selected
  highlight tool, last undoable stroke, highlight creation and stroke-extension
  transport, Valibot response validation, optional note persistence, and local
  save status inside its Lit owner. Let it derive paint-versus-erase tool
  guidance and selection feedback from its local tool and canonical capture,
  classify saved annotation strokes that geometrically overlap that capture on
  the active PDF page, route their ordered removal through the typed workflow
  binding, own the paint-versus-erase capture persistence workflow, and return
  viewer-clearing and cross-owner effects to the context-resource presenter,
  which owns viewer, citation, evidence-panel routing, and validated manuscript-
  link delegation while receiving authoring state, refresh execution, and
  notification effects through its coordinator boundary. The presenter owns child project-mutation refresh sequencing,
  success/fallback notice selection, and propagation when no fallback exists,
  including no-match and completed-erasure status,
  plus citation availability from the active PDF and canonical publication-PDF
  links. Let it also commit its own toolbar tool state, resolve viewer-highlight
  activation to edit/reveal or erase behavior, and complete undo state and
  status after delegated mutation. Let the composer project its nested
  publication-intake owner and acknowledge or reject intake after canonical
  refresh. Let the context-resource presenter supply its API configuration,
  canonical publication lookup, navigation, and notification routes while the
  application coordinator supplies only resource refresh. Route completed note-
  save, tool, undo, erasure, citation, and link outcomes through one typed
  workflow binding while leaving canonical authoring-state derivation, refresh
  execution, and notification presentation in the application coordinator.
- Refine tablet highlight strokes through bounded normalized geometry and quotation updates; preserve annotation/stroke identity and imported PDF immutability.
- Prevent accidental coarse-pointer viewport zoom through standard
  `touch-action: manipulation` and touch-safe editable-control sizing. Do not
  disable user scaling in viewport metadata; preserve deliberate pinch zoom,
  browser accessibility controls, and explicit PDF gesture ownership.
- Retain the active manuscript caret or selection as Yjs-relative positions in
  the editor-status owner, render that local target after editor blur, and
  resolve it before any contextual insertion or replacement.
- Keep standalone private PDF locations routable in browser history. Parse and
  write their canonical Library root, addressed-reference, artifact, and page
  locations through one pure route adapter. Let the composed Library workspace
  own root, addressed-reference, private-PDF, and active-page history mutation,
  route lookup, and the browser-history restoration subscription while bound
  context, project-file, route, comparison, and toast owners supply
  authorization effects, cross-feature navigation, and notices.
  Coalesce selected PDF text into normalized visual-line rectangles, and export
  each saved highlight as one interoperable multi-quad PDF annotation without
  mutating source bytes.
- Merge overlapping private highlight saves at the owner-library authority and update private highlight comments or page-note bodies in place; preserve annotation identity and treat project shares as immutable snapshots.
- Let the Library PDF annotation forms own private-highlight and page-note
  create and update transport, stable encoded reference and annotation targets,
  selected-drawing style updates, selected-markup deletion, overlap
  classification, duplicate-submit gating, and retryable local failures. Keep
  canonical Library refresh, PDF draft and selection clearing, inspector
  guidance, and toast policy in the application coordinator.
- Let the Library PDF inspector own the projection and artifact-change reset
  lifecycle for its annotation forms, imported-highlight review, saved
  annotation list, and project-use block. Supply one canonical artifact,
  project, reference, and Library snapshot from the application coordinator;
  route nested project reference and research mutation completion through one
  typed callback. Let the composed context-resource presenter derive that
  inspector mutation route from its already-bound canonical reference-Library
  owner instead of requiring a separate application binding, and apply local
  draft-clearing, text-selection, and private-markup selection presentations
  directly through its bound viewer. Keep navigation, canonical snapshot
  application, refreshes, history, and toast policy in the coordinator.
- Run expensive, retriable private-artifact inspection behind a versioned Queue
  job contract containing owner, artifact, fingerprint, kind, and request time,
  never artifact bytes. Persist fingerprint-qualified lifecycle and bounded
  results in the owner Library Durable Object. Consumers must be idempotent,
  close managed-browser sessions, and expose only candidate data for explicit
  review. Supply the job's exact private R2 bytes to managed Chromium through
  request interception rather than a public or bearer-token artifact route.
  Keep each analysis kind's persisted state and result validation independent.
  PDF reference analysis must preserve a bounded raw citation and source page
  beside best-effort structured fields; it must not create bibliographic records
  or graph assertions without a later explicit review workflow.
- Let the PDF highlight import panel own automatic-analysis status polling,
  explicit failed-analysis retry, saved-highlight overlap filtering, reviewed
  candidate state, stable encoded import transport, duplicate-submit gating,
  and retryable local failures. Keep canonical Library refresh and completion
  toast policy in the application coordinator.
- Let the PDF reference analysis panel own its independent status polling,
  explicit failed-analysis retry, empty-state explanation, and bounded candidate
  presentation. Project DOI and source links from server-validated fields, and
  keep graph construction and candidate acceptance outside the reader panel.
- Keep private-PDF tool, selection, note-composition, open-card, and pointer-
  gesture state inside the bounded light-DOM markup layer that presents it.
  Let the layer derive its saved drawings, notes, and stable drawing target for
  the active page from canonical artifact and markup inputs.
  Bind raw host pointer events there and emit typed selection, stationary-note,
  interaction-status, and completed-mutation outcomes; let the layer own
  touch-versus-drawing and recognized-shape guidance while the coordinator
  routes that status to the inspector instead of replaying the gesture state
  machine.
  Let that layer persist completed note moves from its stable saved-note
  context, suppress overlapping moves, and restore canonical geometry after a
  retryable failure. Let the layer also persist completed drawings from its
  normalized stroke, active style, and stable artifact context, retaining a
  failed draft for explicit retry or discard. The annotation forms own page-
  note composition persistence; the application coordinator retains canonical
  refresh, inspector, and notification policy.
- Let the Library PDF annotation toolbar derive the newest drawing on the
  active page and own undo deletion through its stable reference and markup
  identities, including pending suppression and retryable local failure state.
  Let it also own annotated-PDF download and installed-app file-share mechanics
  from the stable artifact identity and filename. Keep canonical Library refresh
  and notification presentation in the application coordinator.
- Let the Library PDF annotation list own deletion initiated from a saved
  markup card, including its stable encoded target, single-request lock, and
  retryable card-local failure state. Let it and the Library research rows share
  project research-share, revoke, and web-capture pin transport plus canonical
  workspace-response validation. Keep snapshot application, canonical Library
  refresh, and toast policy in the application coordinator.
- Let the Library PDF project-use block resolve its active bibliographic record
  and matching project-reference alias from coordinator-supplied canonical
  snapshots. It owns unidentified, unlinked, and linked presentation plus
  project-reference transport; keep snapshot application, project-PDF refresh,
  and notification policy in the application coordinator.
- Keep citation style and locale as versioned project publication settings consumed by preview and export; never rewrite canonical Markdown or shared bibliographic records when they change.
- Resolve project submission layouts from bounded versioned presets; never execute uploaded TeX, scripts, remote assets, or arbitrary template paths in the export pipeline.
- Keep reference-library search, facets, and sorting as ephemeral local projections over the authorized private snapshot; never persist private search intent into project or collaboration state.
- Render only the active PDF page through the PDF.js display layer; keep its worker version matched with the pinned display dependency.
- Derive each active PDF load context through one pure projection over the
  active typed context tab and authorized project, Library, and shared-reference
  snapshots. Let the resource-context presenter apply that projection through
  its narrow viewer binding, including stale-load rejection, form selection,
  resource scroll, and active-resource failure presentation. Keep routing and
  viewer gestures in their existing browser authorities.
- Project standard PDF link geometry from the pinned PDF.js display data into the active-page interaction layer; keep internal destinations inside the reader and isolate external navigation.
- Expose scholarly entities through stable resource identities and typed relationships rather than citation keys or filenames alone.
- Give workspace people opaque stored identities independent of email. Derive
  project membership, shared-note provenance, and model-candidate evidence as
  typed hypermedia links without making the projection authoritative.
- Derive bounded workspace search and hypermedia projections from canonical state until scale measurements justify a persisted index. Host the project evidence map as a read-only authoring modality paired with ordinary resource actions; never make its visual layout authoritative or the only navigation model.
- Let the project-evidence Lit panel own guarded legacy project-PDF and
  annotation removal, including claim-evidence, passage-link, annotation, and
  explicit publication-link preconditions, confirmation, stable encoded
  targets, one shared duplicate-submit gate, and retryable local failures. Keep
  canonical refresh, PDF navigation, editor-dependent evidence mutations, form
  reset, and workspace notifications in the application coordinator.
- Invalidate browser resource views with a server-owned control message and a
  coalesced authorized metadata refresh rather than replacing live editor
  state from a workspace snapshot.
- Centralize mutation-completion refresh notices in the application
  coordinator: await the shared coalesced resource refresh, then show the
  feature-specific success or refresh-failure message.
- Treat claims as stable, human-authored propositions; store their evidence and manuscript usage as typed links so editing or deleting a claim never mutates its source annotations or authored prose.
- Let the bounded claim dialog own its stable create/edit target, proposition,
  note, evidence selections and relations, mutation transport, duplicate-submit
  gating, and retryable local failures. Keep it nested inside the claim-list
  owner, which derives evidence availability, opens create/edit state from its
  canonical projection, and converts successful saves into its existing
  mutation outcome. Keep canonical refresh and toast policy in the application
  coordinator.
- Let the claim list own confirmed deletion transport, stable encoded claim
  targets, duplicate-submit gating, and retryable local failures. Given a
  coordinator-validated current passage, let it also own claim-passage link
  transport and its completed mutation outcome. Let it project its claims,
  annotations, evidence links, and passage links directly from the canonical
  workspace snapshot plus coordinator-supplied browser-local evidence selection.
  Route mutation and navigation outcomes through one typed workspace binding,
  and grounding choices through a separate typed assistant binding. Keep Yjs
  selection validation, canonical refresh, and workspace notification policy in
  the application coordinator.
- Let the project evidence panel own project-PDF file-input state, validation,
  import transport, guarded project-PDF and annotation removal transport, and
  highlight-fragment update and deletion transport, fragment-input validation,
  retryable local status, and deletion completion routing with optional user-
  notice intent. Given a coordinator-validated current passage,
  let it also own annotation-passage link transport and its completed mutation
  outcome. Let it project its PDFs, annotations, claim-evidence links, passage
  links, and publication-PDF links directly from the canonical workspace
  snapshot plus coordinator-supplied browser-local evidence selection. Keep
  workspace mutation and navigation outcomes in one typed binding, and route
  grounding choices through a separate typed assistant binding. Keep Yjs
  selection validation, PDF selection and undo coordination, canonical refresh,
  annotation-form synchronization, canonical refresh, and notification effects
  in the application coordinator behind that typed completion boundary.
- Let the context-resource presenter resolve single citation keys against its
  bound canonical project route, choose an unambiguous linked project PDF and
  locator page or publication context, and dispatch grouped or missing-citation
  notices through its existing workspace route. Keep canonical snapshot
  authority and context transitions in the application coordinator.
- Treat authoring and research context as the two primary workspace surfaces.
  Let their direct-child Lit switcher apply responsive surface selection and
  the parent workspace's visibility-driving state before reporting navigation
  through a narrow typed binding. Route Write/Map selection through its sibling
  Lit binding. Let the workspace coordinator turn every Write-mode outcome into
  one Authoring-surface transition, editor-focus update, and URL replacement.
  Retain cross-component policy and URL authority in that coordinator.
  Keep a permanent manuscript Preview in a keyboard-operable right-hand tab
  pane, and address publication, PDF, and model-candidate tabs by stable
  resource identity.
- Keep open context tabs, active and pinned state, preview scroll, and PDF
  reading position local to the browser and scoped to its authorized workspace.
  Never write routine reading navigation into Yjs, Durable Object resources, or
  collaboration control messages.
- Project any context-tab overview directly from the same local, authorized tab
  state. It may activate or close eligible tabs but must not introduce a second
  registry, persistence channel, or scholarly mutation path.
- Let the composed context-tab Lit owner derive fixed and resource titles from
  coordinator-supplied canonical tab, publication, project-PDF, private-Library,
  shared-reference, and candidate inputs. Let it also own controlled-panel
  visibility, Preview sibling-control availability, active resource labels, and
  private-versus-read-only PDF presentation, and restore supplied fixed-panel
  scroll positions during the same tab update. Route its fixed, resource-strip,
  and overflow-overview navigation intents through one typed callback boundary.
  Resource and overview presenters share one bounded action payload and dataset
  parser while retaining distinct semantic event names.
  Keep canonical context state, authorization, Library loading, content
  rendering, route synchronization, and transitions outside it.
- Let a separate resource-context Lit presenter coordinate the active
  publication, candidate, project-PDF, private-Library PDF, and shared-reference
  PDF presentation from those canonical inputs. It owns the composed canonical
  tab-strip projection, derives and retains the active resource selection for
  sibling consumers before selecting the owning panel, retains the resolved
  active private-Library artifact for page routing, capture, and saved-markup
  projection, owns the browser-local canonical context state and its open,
  activate, close, authorization-reconciliation, and PDF-location transitions,
  restores resource scroll, and projects bound viewer state back into canonical
  fixed-tab scroll, resource scroll, PDF page, and focused-annotation state. It
  binds project-knowledge, presentation, and route sources through one atomic
  application entry, including the canonical assistant, editor-status,
  Library, project-file, surface-route, and workspace-layout owners,
  deriving canonical project and Library sources from them instead of accepting
  a parallel source factory and effect callbacks. That entry also installs the
  assistant presenter's reciprocal authoring, workflow, resource-route, and API
  lifecycle from the same collaboration, refresh, and owner capabilities.
  Candidate presentation derives from that same assistant owner instead of a
  second presenter binding.
  Standalone-Library mode
  derives from the absence of a project API base rather than crossing the
  binding as a second mode flag. It
  also restores a routed fixed or resource context against those authorized
  catalogs and owns Preview fallback plus notice presentation when restoration
  fails. When PDF-only layout needs a resource, it preserves an active PDF or
  selects the first authorized project PDF and then private-Library PDF through
  its route binding, presenting the empty-state notice itself. It also owns
  project, private-Library, and linked-reference PDF context preparation,
  focused page/annotation projection, route-effect sequencing, and active load
  timing. URL parsing, concrete browser-history mutation, and layout state
  remain coordinator policy; the coordinator only connects those owners and
  supplies the nullable project API configuration. It projects page changes into canonical PDF
  context and page-local private markup state, then applies workspace and
  standalone-Library replacement through its bound route owners;
  coordinates project citation and intake context,
  switch the annotation versus private-inspector surface, synchronize the
  private-PDF inspector, markup reset, toolbar counts, and export target, and
  project page-local saved markup plus newest-drawing undo state from canonical
  Library inputs supplied by the coordinator. It also owns synchronized
  private-PDF tool, inspector-open, inspector-close, and draft-clearing
  presentation plus highlight/note draft composition and highlight, note, and
  markup edit/selection coordination across the markup layer, inspector, and
  toolbar. It binds and routes those siblings' private-PDF action and outcome
  streams, including local save, import, delete, export, and status completion
  presentation. It resolves saved-highlight artifact navigation from the bound
  canonical Library and completes the inspector status after the PDF opens.
  Let it also derive the authorized publication, project-PDF,
  private-or-linked PDF, and candidate identity sets from canonical resource
  catalogs and resolve a supplied resource route to the matching canonical
  publication, project PDF, private-Library PDF, linked reference PDF, or
  candidate. Let the presenter configure the project-map workspace and bind its
  annotation, claim, candidate, note, PDF, and publication routes across the Lit
  owners it already composes. Bind the project-file, workspace-switcher,
  sharing-panel, and Preview destination owners directly under their canonical
  application-registry names; let the presenter apply the Preview
  context switch before section scrolling. Let the same presenter
  resolve annotation edit/open intents to their canonical annotation
  and project PDF, and let it resolve active project-note shares to bounded
  notice text through the same canonical project catalog. Let it also resolve citation keys case-insensitively and choose
  the sole linked project PDF for a supported page locator, otherwise opening
  publication context. Let it dispatch the publication panel's typed project,
  private-Library, and shared-reference paper choices through the same route
  effects. Let it derive active-publication citation readiness and resolve
  explicit active-publication or sole-linked project-PDF citation intents to a
  citation key and optional page locator. Route the resulting typed open and
  citation-insertion intents through the directly bound citation-control and
  navigation owners. The presenter sequences bound context-source projection, pane
  restoration, surface activation, tab focus, route synchronization, and PDF
  load timing; the workspace surface and standalone Library route owners supply
  browser-history effects through one structural binding, and the coordinator
  supplies the underlying cross-surface and layout effects. Let the presenter
  own private-highlight citation readiness feedback,
  collision-safe project-reference preparation, and validated link transport.
  Use its route binding to consume the canonical Yjs document, collaboration
  and refresh capabilities, plus project-file, editor-status, history-trigger,
  citation-control, Library, and toast owners directly instead of projecting
  them through application callback adapters. Include the private-PDF project
  API scope plus editor-status and reference-Library owners in the atomic
  project-knowledge lifecycle so caret
  readiness, project snapshot acceptance, markup completion, and artifact
  opening do not require another application callback bag or a self-callback.
  Let the presenter apply
  local text-selection, selected-highlight, and draft-selection cleanup effects
  through its viewer binding and
  synchronize the bounded evidence, annotation, publication, claim, comment,
  and candidate owners from one canonical workspace snapshot. From its bound
  canonical project, Library, API, assistant, and route sources, let it also
  reconcile authorization and own complete workspace-resource presentation,
  assistant-availability refresh, and incidental route synchronization. Let it
  also
  project coordinator-resolved evidence links, claim links, comments, and
  project-map inputs across those composed owners after Preview rendering while
  the coordinator retains render timing. Through the viewer installed by the
  same atomic project-knowledge binding it derives the authorized active PDF load, synchronizes project
  annotations and private highlights, rejects stale completions, retains the
  rendered context and project-PDF identities, opens the viewer, restores
  resource scroll, presents active-resource failures, and routes captured
  selections to the private-highlight composer or project-annotation form from
  those retained identities. The presenter binds the project-annotation form's
  intake and workflow atomically so the composed form cannot retain only half
  of its routes. It applies tool and draft-clearing effects through the bounded
  viewer, owns intake refresh plus completed-workflow refresh, optional passage-
  link, and notice sequencing, and routes citation, highlight removal, and
  highlight reveal to the Lit owners it already composes. The document-level
  presenter constructs the document-level PDF viewer during its atomic
  project-knowledge binding and binds itself directly for selection capture,
  highlight activation, page presentation, and private-highlight selection;
  the application must not construct or forward that viewer or repeat those
  four pass-through callbacks. Let it configure the manuscript-comment,
  project-evidence, claim-list, and publication list/context panels. Bind the
  project-annotation, manuscript-comment, project-evidence, claim-list, and
  publication list/context panels, project-map routes, the PDF viewer, and
  private-PDF mutation and markup streams atomically as one project-knowledge lifecycle so intake,
  workflow, authoring, mutation, citation, paper, map navigation, and private-
  PDF routes cannot be only partly installed;
  own
  annotation-form cleanup and selection, edit and PDF routes, fragment-removal
  refresh sequencing, child-specific mutation failure copy, and notice
  dispatch; bind the complete lifecycle against one project API and Library
  owner plus canonical project-file, workspace-switcher, sharing-panel, and
  Preview destinations; and route comment, claim, evidence, publication,
  citation, paper, and map intents across those owners. Derive canonical authoring state and delegate
  project refresh execution, passage navigation, citation insertion, Library
  refresh, and notice presentation through the directly bound owners. Let the presenter validate synchronization and a
  current passage before delegating claim or annotation link transport to its
  composed owner. For incoming links, let it resolve the stored Yjs anchor,
  reject stale targets, distinguish exact from changed text, and select the
  corresponding notice. Keep selection effects, revision and collaboration
  authority, mutation consequences, and cross-resource navigation in the
  application coordinator; their existing owners retain canonical refresh,
  Library, citation, passage-selection, and shared-notification effects.
  Keep tab state, canonical snapshot acceptance,
  Yjs citation syntax insertion, cross-resource navigation, routing, project-selection
  persistence, remaining viewer gestures, and the shared notification outlet
  in the application coordinator through narrow callbacks.
  Let the presenter also own bound linked-reference PDF catalog loading,
  validation, storage, authorization projection, and optional downstream
  resource presentation. Let the composed Library workspace bind the canonical
  project-file owner, context presenter, route owner, web-comparison owner, and
  toast owner once, then read the live project snapshot directly and own
  Library refresh, linked-PDF refresh,
  authorization reconciliation, project and context
  presentation, settlement, replace-route sequencing, snapshot acceptance,
  comparison dispatch, and mutation consequences without application adapters.
- Project bounded, reconstructible editor UI selections into query parameters
  only after validating stable ids against authorized snapshots.
  Keep default-file elision and active PDF-page and annotation projection beside
  parsing and serialization in the pure workspace route adapter. Let the
  bounded surface-navigation owner bind authorized file, rail, authoring-mode,
  context, layout, and surface state once; own route readiness, ordered
  restoration, canonical URL comparison, and push-versus-replace history
  writes; subscribe to browser-history restoration with lifecycle teardown; and
  delegate only file, context, and layout restoration effects.
  Push meaningful context-target navigation, replace incidental view and page
  changes, preserve unrelated query parameters, and keep drafts, scroll,
  selection, pane sizing, and inactive-tab session state out of URLs.
- Keep adding a publication to working memory, citing it in canonical source,
  and connecting evidence to prose as distinct explicit actions. Opening,
  switching, pinning, or closing research context must not imply any of them.
- Keep external metadata preview non-mutating. Refetch and remap every selected
  provider on acceptance into the owner library with per-field provenance and
  no partial batch update; reuse stable likely-duplicate identity only after
  normalized identifier or reviewed bibliographic matching.
- Validate direct bibliographic metadata updates through one inferred Valibot
  request schema that owns the complete field set and title and abstract bounds;
  do not maintain a parallel field-name list and handwritten predicate.
- Persist publication-to-PDF associations as explicit library-owned links.
  Never infer the canonical association from citation aliases, titles,
  authors, or filenames; an unidentified PDF remains private intake until its
  source is reviewed.
- Let the publication-context Lit panel own explicit project PDF link and
  unlink transport, stable encoded link targets, duplicate-submit gating, and
  retryable local failures. Let it resolve the active publication id and derive
  available project PDFs plus ordered private-Library, shared-reference, and
  project paper options from canonical inputs. Route relationship completion,
  citation insertion, and paper navigation through one typed workspace binding;
  keep canonical refresh and workspace notifications in the application
  coordinator.
- Collapse the two-surface workspace to an explicit Authoring/Context switch
  when both surfaces cannot retain readable measures; preserve editor and
  per-context local state while either surface is hidden.
- Route workspace-layout changes and application-version copy notices through
  typed bindings on their Lit owners. Keep global toast presentation in the
  workspace coordinator.
- Allow the ancillary project rail to resize only on desktop, persist its
  bounded width as a cross-project browser-local preference, and contract its
  effective maximum before either primary document surface loses its readable
  minimum. Allow independent browser-local collapse with an editor-hosted
  restoration action. Let the workspace-layout Lit owner bind the canonical
  Context owner for context-specific pane persistence and consume that owner's
  PDF viewer for relayout instead of receiving a second application-owned
  capability. Its atomic
  workspace binding establishes collapse and resize listener lifecycles; a
  separate non-element manager is not exposed.
  Keep rail geometry out of URLs
  and collaborative state.
- Route rail-tab navigation through its Lit owner. Let the manuscript-map owner
  use the project-file capability already present in its project-presentation
  binding for range navigation, and derive its composed guide
  source plus research-diary, research-question, and reviewer-response sibling
  projections from one canonical file set. Let it retain that composition's
  source map and translate guide selections into file-qualified editor ranges.
  Keep general URL synchronization in the workspace coordinator; let the
  project-file dialog own source-range focus and reveal effects, workflow-file
  creation, existing-file focus, created-file Guide navigation, and Files-rail
  quick-open sequencing through its bound owners and narrow layout capability.
- Keep project-file quick open bounded to transient client-side path filtering
  over the authorized workspace snapshot. It may reveal the Files rail and
  select a file, but must not introduce a global command registry or persist
  its query in URLs, browser storage, or collaborative state.
- Let the project-map workspace derive its read-only knowledge graph from the
  resolved canonical workspace, current composed manuscript, and bibliography,
  then fan that graph out to its map and connection children. Keep Yjs anchor
  resolution, canonical snapshot authority, and resource-navigation effects in
  the workspace coordinator.
- Treat manuscript passage links as immutable, versioned selectors rather than
  permanent current offsets. Verify the source revision and exact range at
  creation, then capture Yjs relative positions, exact quote/context,
  original offsets, and the anchored revision.
- Resolve version 1 manuscript anchors only from valid, non-collapsed Yjs
  relative positions. Expose `resolved` or `stale` state; exact quote/context
  and original offsets remain provenance and must never act as runtime
  navigation fallback.
- Hydrate current resolutions for passage links, claim links, comments, and
  revision-candidate targets through one pure workspace-snapshot projection.
  Reuse it for synchronized refreshes, offline restore, and live preview so
  resource families cannot drift into different anchor-resolution behavior.
- Keep current navigation offsets inside a derived anchor resolution, not as
  top-level durable link properties. Conservatively backfill a valid legacy
  offset row once; keep an unconvertible row explicitly stale with null
  relative endpoints under the version 1 selector contract.
- Materialize every complete-document replacement as the smallest
  common-prefix/suffix `Y.Text` splice. Never delete and reinsert unchanged
  prefix or suffix content, because doing so destroys surviving Yjs anchor
  identities.
- Assign citation aliases only inside projects. Derive project bibliography
  from linked library snapshots, rewrite exact citation directives when an
  alias changes, and include only aliases cited by composed `main.md` in normal
  exports.
- Migrate legacy workspace BibTeX idempotently into the owner library and
  project reference links. Absence from a project never deletes owner research
  memory.
- Capture a model operation's source, selection, revision, and evidence as one
  immutable base before awaiting a provider; reject stale candidate creation
  and keep application as a separate revision-validated action.
- Define model-writing capabilities through one typed operation registry with
  operation-specific target, evidence, input, and output contracts. Resolve a
  visible non-empty selection exactly; otherwise expand the remembered caret
  deterministically to the requested sentence, paragraph, Markdown section, or
  insertion point, and preview that target before provider I/O.
- Keep clarity drilling as a bounded two-stage exchange: diagnose one ambiguity
  and ask one question, then use the researcher's answer to offer two to four
  typed rewrites. Persist only the chosen rewrite, through the ordinary targeted
  candidate review and stale-base checks.
- Keep ideation as three to five typed direction cards with complete bounded
  target drafts. Persist only a researcher-promoted draft through the ordinary
  candidate boundary; do not store discarded ideas or mutate prose from the
  exploratory response.
- Ship academic phrasing guidance only as a reviewed, versioned inventory
  derived from allowlisted CC0 or CC BY papers retrieved through designated
  corpus interfaces. Keep a machine-readable source ledger and attribution,
  require independent-source recurrence and similarity review, and pass only
  purpose-matched patterns to a typed local-model operation whose alternatives
  enter the ordinary targeted candidate boundary.
- Accept complex syntax requirements through typed operation-specific controls.
  For tables, validate bounded structured cells and requested dimensions, render
  portable GFM deterministically in the client, expose the exact syntax for
  review, and insert only against the unchanged captured target and revision.
- Separate model-assisted reference query formulation from bibliographic fact
  retrieval. Accept only bounded query text from the model; source titles,
  authors, publication metadata, and DOI identities from validated scholarly
  provider responses, label their origin, and require explicit Library import.
- Persist passage-revision candidates as a Yjs-relative target, bounded
  instruction, typed versioned evidence snapshots, provider/model identity, and
  replacement text. Never model a selected-passage operation as a proposed
  whole-document replacement, and splice only the verified target on apply.
- Persist claim-draft candidates separately from passage targets with one
  bounded proposition, optional note, researcher-selected evidence relation,
  typed annotation snapshots, and provider/model identity. Revalidate every
  evidence version on apply, then atomically create the ordinary claim and its
  evidence links; never let the model assign the scholarly relation or write a
  canonical claim directly.
- Keep local-model network access in the browser or the explicitly launched
  loopback companion so a hosted Worker never assumes it can reach localhost.
- Configure the companion with one fixed credential-free loopback upstream and
  one exact allowed browser origin. Bind it only to `127.0.0.1`, bound and
  validate both sides of the request, reject redirects, and never accept a
  browser-selected upstream.
- Supervise the configured companion alongside the local Worker under
  `npm run dev`, but strip all model-specific environment variables from the
  Worker child, disable Wrangler's automatic `.env` discovery, keep Worker
  secrets in `.dev.vars`, and stop the sibling process when either service
  exits.
- Keep the initial browser-direct model adapter on credential-free HTTP(S)
  loopback endpoints, reject redirects, bound its response before JSON parsing,
  and align the page connection policy with the same IPv4, localhost, and IPv6
  sources.
- Discover local model identifiers only from the completion endpoint's derived
  same-origin `/models` route, keep reasoning effort explicit, and constrain
  writing-operation output with task-specific JSON Schemas before mapping it
  into provider-neutral candidates.
- Keep browser-local model preference persistence, bounded Valibot restoration,
  and discovery requests plus their busy, result, and error state in the model
  settings component. Keep generation requests and cross-feature discovery
  availability in the application coordinator.
- Verify Cloudflare Access JWT signatures and claims inside the Worker for hosted identity; never trust caller-supplied identity headers alone.
- Authorize every workspace data representation, API operation, PDF stream, and WebSocket upgrade through explicit owner/member state.
- Authorize every library operation through its verified owner identity. Never
  let workspace membership imply access to the owner's private library;
  collaborators may read only active project-pinned snapshots.
- Require an exact same-origin `Origin` on every browser WebSocket upgrade in addition to identity and workspace authorization.
- Accept only bounded, valid binary document updates and the exact validated
  selection-metadata message from collaboration clients; keep identity,
  presence, revision, selection-clear, and other controls server-owned, and
  never persist or rebroadcast invalid input.
- Permit local authentication only on loopback hosts; a deployment left in local mode must fail closed.

## Tooling Baseline

- Local development and local CI target macOS as the supported host platform baseline.
- Node is pinned exactly through `package.json`, and npm is constrained to a compatible major there instead of an exact patch pin.
- The verification baseline is split into a fast gate and a browser gate so quick checks can return earlier without dropping full coverage.
- The repo-managed `pre-push` Git hook should run affected-file guardrails,
  Fallow for affected codebase inputs, and targeted Stryker checks for affected
  Node-testable sources. Mutation configuration changes should force-refresh
  the full incremental report so removed mutants cannot remain in the score.
  Passing hooks should report concise Fallow health and Stryker score/progress
  output; detailed advisory findings remain available through explicit commands.
- Formatting, Oxlint correctness checks, type checking, unit tests, and end-to-end tests are part of the baseline quality gate.
- Oxlint uses its default correctness rules and complements rather than replaces Prettier formatting and TypeScript type checking.
- Browser tests launch Wrangler with a fresh operating-system temporary persistence directory and remove it on shutdown. Test workspaces must never accumulate in the interactive development catalog.
- Local Agent CI must explicitly prewarm through one deterministic install step
  before parallel jobs receive isolated writable dependency views. Do not
  restore shared mutable dependency mounts or repo-local install locks.
- Keep Node Vitest responsible for fast pure-domain coverage and mutation
  feedback; keep the separate Workers Vitest project responsible for real
  Durable Object and SQLite integration behavior.
- Exclude browser-only orchestration from Node mutation testing only after its
  deterministic contracts are separated into mutation-tested modules; keep the
  browser binder covered by Playwright and the pre-push selector aligned with
  Stryker's exclusions.
- Fallow codebase diagnostics are advisory readability checks for production-code complexity and duplication plus project dependency hygiene and cleanup evidence. Unit and end-to-end test fixtures stay under formatting, linting, typechecking, and execution instead; Fallow does not replace the baseline quality gate.
- Affected-file guardrails should scope checks to changed files when the underlying tool supports it and fall back to project-level checks only when needed.
- Affected-file guardrails must route Worker-reachable non-client sources,
  Workers tests, and Workers configuration to the Workers-runtime suite, while
  keeping `*.workers.test.ts` out of the Node Vitest project.
- The fast quality gate should fail when Worker/view runtime files contain inline script blocks without a `src`, inline event-handler attributes, or `javascript:` URLs. External scripts must point to an explicit typed client build.
- Unit coverage for `src/` code should stay high enough that the coverage gate remains green.
- Local CI should validate the same baseline checks before non-documentation changes are proposed or merged.
- The baseline quality gate and local CI must execute the Workers-runtime test
  project; its direct command is only a targeted iteration shortcut.
- Targeted commands are useful while iterating, but `npm run quality:gate` and `npm run ci:local` remain the readiness baseline before proposing or landing non-documentation changes.
- `npm run diagnostics:codebase` is useful during review and refactoring, but passing or failing it is not a readiness baseline by itself.
- Documentation-only changes may skip `npm run ci:local` when they do not alter executable config, generated artifacts, package metadata, source code, or tests.
- Build typed browser code with esbuild into the existing ignored `.generated/` directory before Wrangler bundles the Worker.
- Regenerate committed Worker binding types with `npm run worker:types` whenever
  `wrangler.jsonc` bindings change. Generation, the fast quality gate, and
  production preflight must all disable Wrangler's automatic `.env` and
  `.dev.vars` discovery so machine-local values cannot enter the committed
  declaration or make its freshness environment-dependent.

## Capability Kits

- Put reusable partial-upgrade kits under `.capabilities/{capability-name}/`.
- Keep capability kits instructional and reviewable rather than fully automated by default.
- Each capability kit should include a README, a machine-readable manifest, any copyable files, package-manager recipes, and validation notes.
- Capability kits should preserve target-project conventions unless the kit explicitly documents a required constraint.

## Template Updates

- Put reusable maintenance update packs under `.template/updates/{update-id}/`.
- Keep update packs as reviewable plain files with metadata, a migration guide, and a focused patch.
- Use update packs for later changes to projects that already use this template or one of its capability kits.
- Do not treat update packs as source snapshots; preserve downstream project conventions and use the migration guide when the patch does not apply cleanly.

## Spec Conventions

- Put feature-level specs under `specs/{feature-domain}/spec.md`.
- Keep one spec per independently evolvable feature or domain.
- Update the relevant spec in the same change set whenever behavior, contracts, workflows, or guardrails change.
