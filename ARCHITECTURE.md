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
  predicates merely for consistency. At the GitHub user boundary, schemas own
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
  identity, and Durable Object mutations stay explicit.
- Read bounded external response bodies through stateless, request-local
  helpers that enforce both declared and observed byte limits. Keep byte
  ceilings, errors, response-shape validation, and domain mapping explicit at
  each provider boundary; never retain response I/O in module state.
- Model external scholarly works as typed sets of stable identifiers. Prefer DOI when present, but do not make DOI a prerequisite for discovery or review.
- Do not place executable browser code inline in Worker-rendered HTML. Client behavior should live in typed TypeScript modules before it is served to browsers.
- Use XState only for bounded event-driven browser workflows whose mutually
  exclusive states, asynchronous lifecycle, or guarded transitions would
  otherwise span several independent fields. Keep route values, persisted
  domain data, Yjs state, and compact pure reducers in their existing
  authorities; XState is not a global application store.
- Keep application appearance behind shared semantic color tokens. Light and dark modes may vary token values, but components must not grow separate theme-specific palettes.
- Keep the interface design system thin and source-local under `src/ui/`: foundations, visual primitives, shared state contracts, typed icons, and small markup helpers only. Domain components compose it without moving application behavior or state into a second UI architecture.
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
  to its interaction and whose outward effects are typed outcomes.
- Let the project-map Lit workspace own its authorized knowledge-search request,
  response validation, and idle, result, and error lifecycle because those
  states also determine whether the graph overview is visible. Let it parse and
  route kind-qualified resource keys through one exhaustive typed navigation
  binding. Keep graph derivation, canonical resource lookup, and navigation
  effects in the application coordinator.
- Let the bounded workspace-layout control own its four-option presentation,
  normalization, selected value, workspace-scoped local persistence, and typed
  change outcome. Keep surface mutation, PDF activation, resize notification,
  and URL synchronization in the application coordinator.
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
  local request finalizers. Keep canonical Library loading and shared toast
  presentation behind its typed callbacks.
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
  request scope, the single browser snapshot projection, and standalone Library
  route lookup plus archive-aware focused-reference restoration and missing-
  reference feedback. Keep cross-feature PDF and
  context navigation, history mutation, project snapshot application, refresh timing, and notification
  presentation in their authorities behind narrow typed callbacks.
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
  canonical workspace inputs. Bind its entry trigger and request canonical
  inputs, catalog refresh, save-as-template, and GitHub refresh through one
  typed workspace boundary instead of exposing local action events.
- Let the project catalog and starting-point Lit owners bind their server-
  rendered entry triggers. The starting-point owner also owns loading-state
  entry, post-load focus, and local load-failure presentation around the
  catalog owner's canonical refresh. Let the project catalog owner fetch and
  validate its authorized summaries, retain the one browser catalog projection,
  and synchronize the compact switcher from that state. Other workflows consume
  its read-only catalog; keep canonical route navigation outside it.
- Let the GitHub sync-menu Lit component bind the workspace-settings review,
  own online and active-review refresh policy, route Check/Pull/Push/Settings
  actions, and refresh both canonical project data after Pull and menu status
  after every completed mutation. Keep canonical project fetching in its
  existing authority.
- Route same-origin JSON writes and non-success response handling through the
  shared client HTTP adapter. Validate the bounded `{ error: string }` response
  contract with Valibot there instead of repeating parsing and fallback policy
  in each Lit component or application workflow.
- Let the bounded Preview status owner derive composed-versus-isolated file
  labels and combined composition and renderer issue summaries from canonical
  preview inputs. Let the light-DOM workspace Preview own lazy renderer loading,
  stale-render rejection, rendered or escaped-source presentation, renderer
  diagnostics, isolated-file heading-number mapping, authorized local-image
  resolution, publication composition and active-file preview derivation from
  supplied canonical project files, synchronized Preview status and source-map
  sibling projection, transient DOM navigation, interactive-click classification,
  source-offset extraction, and routing of its source, citation, and nested
  diagnostic-selection intents through one typed navigation boundary. Keep
  canonical project-file and Yjs source authority, source-map translation, cross-
  panel projection, publication resolution, citation navigation, and resulting
  transitions in the application coordinator.
- Keep the DOI publication-intake XState actor, preview and acceptance
  requests, stale-response guards, local status, and focus lifecycle inside the
  bounded intake Lit component. Let that component also derive the active PDF's
  linked references from canonical publications and publication-PDF links. Hold
  acceptance pending until the application coordinator acknowledges canonical
  snapshot refresh, then emit only the publication DOI or reference-navigation
  intent.
- Keep the browser shell's required-element lookup in one typed registry whose
  return shape is inferred from its constructors. Do not duplicate that shape
  in a manually synchronized application interface.
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
  failure presentation. Let the import panel close its own dialog and navigate
  to the validated successful response's canonical workspace href. Let the sync
  menu likewise own its bounded connection
  and status refresh interval, validation, stale-request guard, and primary
  presentation, then emit one state event for the settings mirror. Let the
  detailed sync review own its Pull, Publish, and disconnect requests because
  their validation, payloads, progress, and results are local to that review.
  Emit completed synchronization mutations so the application coordinator can
  refresh canonical project and cross-component status state; retain page-level
  refresh pause policy, project refresh, and navigation in the coordinator.
  Delegate GitHub App JWT signing and private-key handling to pinned
  `@octokit/auth-app`, but keep installation-token exchange bounded and
  request-scoped. Do not retain request-bound installation authentication
  promises in Worker module state. Share only the stateless bounded stream and
  JSON reader between GitHub App and user clients; keep their size ceilings and
  public error semantics explicit at each client boundary.
- Import LaTeX archives only through a bounded, authenticated Worker workflow
  that separates non-mutating inspection from reviewed project creation. Keep
  Markdown canonical; never retain TeX as a second editable authority or
  execute uploaded TeX. Let the bounded Lit import panel own dialog dismissal
  and navigation to the successful response's canonical workspace href.
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
  It owns file/folder create and rename transport, file deletion transport,
  content-bearing workflow-file creation, shared response validation,
  created-path verification, duplicate-submit gating, and retryable local
  failures. It also owns the supporting-file hidden projection, six-second
  delayed deletion, Undo restoration, failed-commit restoration, and deletion
  notices. It routes its sibling file-action, tree, upload-completion, and save
  streams through typed workflow callbacks. From one canonical snapshot it also
  owns active-file identity, entry fallback, hidden-file selection eligibility,
  active file/folder resolution for dialogs, active-file deletion eligibility,
  and relative image insertion projection. It projects the visible file
  collection and active/entry state into the project tree, Insert menu, source
  completion, and file menu. It also materializes that same visible collection
  with snapshot or live collaborative content for Preview, manuscript-map, and
  collaborator-selection consumers through a coordinator-supplied content
  resolver. Emit or return the
  validated workspace snapshot or created stable file. Keep workflow-template
  selection and navigation, collaborative caret capture, Yjs insertion and
  active-text binding, Yjs document authority, canonical snapshot authority,
  cross-feature rendering, and
  the global toast outlet in the workspace coordinator.
- Let the editor Insert menu own the scholarly syntax templates it displays and
  route template and relative-include choices through one typed binding. Keep
  passage-aware link adaptation, collaborative selection resolution, and Yjs
  edits in the workspace coordinator.
- Let the project-image upload control own file-input state, sequential upload
  transport, response validation, duplicate-submit gating, and retryable local
  status. Emit only the final validated workspace snapshot and completion
  message. Let the project-file dialog project a selected tree asset into
  relative Markdown image syntax and a completion message from the canonical
  active file. Route image-upload and project-tree mutation completions through
  the project-file owner's one canonical snapshot, preview, and notice binding.
  Keep Yjs insertion, caret and focus, snapshot
  application, cross-feature rendering, and the toast outlet in the workspace
  coordinator. Let the project-tree panel own image deletion as part of its
  local row lifecycle.
- Let the project-tree panel own encoded empty-folder and image deletion
  transport and response validation plus optimistic row hiding, the six-second
  Undo window, delayed commit scheduling, restoration, and failure notices. It
  exposes hidden image identities so Preview does not resolve an asset during
  its grace window and returns validated snapshots for coordinator application.
  Bind those outcomes through the project-file owner beside upload and
  supporting-file mutation completion. Keep canonical snapshot application,
  cross-feature rendering, and the global toast outlet in the workspace
  coordinator.
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
  Let it own Cancel and close itself before handing either import choice to the
  coordinator, and let it navigate to the validated project-creation response's
  canonical workspace href. The
  template-save Lit dialog owns promotion requests, response validation, and
  local busy and error presentation. The application coordinator retains import
  workflows, replacement-option synchronization, post-promotion catalog
  refresh, and the toast outlet through typed component bindings.
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
- Parse standard and scientific-writing Markdown through a pinned unified/remark browser pipeline; keep its syntax tree and HTML derived.
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
  response.
  Let a bounded assistant-generation Lit presenter own the browser-local XState
  actor and route all registered operations across the typed task, result, and
  candidate-list owners. It derives operation-local request context from
  coordinator-supplied canonical manuscript, target, stability, snapshot, and
  revision inputs plus assistant-owned task, evidence, and validated model-
  settings state. It owns workflow transitions, busy and decision availability,
  source-staleness transitions, status presentation, model-settings and task
  subscriptions, evidence selection and focus guidance, generation routing,
  clarity continuation, captured-table validation and portable spacing,
  promoted-revision persistence sequencing, candidate decision state, and
  candidate-review event subscriptions. Candidate persistence remains inside
  the candidate-list owner. Keep canonical workspace and Library refresh,
  context and PDF navigation, toast policy, authorized Yjs mutation, editor
  selection, and remembered authoring selection in the coordinator through
  narrow typed callbacks.
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
  through one callback boundary while the application coordinator retains
  canonical Library refresh and toast policy.
- Model each web source as one stable owner-library identity with append-only,
  timestamped captures. Retrieve only bounded public HTTP(S) content through
  manually validated redirects, store raw/readable representations privately
  as inert R2 objects, and make projects pin an exact capture rather than a
  mutable latest URL.
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
  through an explicit bounded provider request. Accept an external expansion
  candidate only after a fingerprint-verified provider refetch, then create or
  reuse its library identity and extracted citation assertion atomically. A
  project id narrows the private projection but never grants library access.
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
  navigation, post-restore reload, its sibling trigger, and notice forwarding.
  The application coordinator supplies only global toast policy through typed
  configuration.
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
  Validate responses there, bind its sibling trigger, and forward user-facing
  notices through typed configuration; keep the application coordinator
  responsible only for global toast presentation.
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
  timers, strict control routing, binary-update application, queue flushing,
  reset cleanup, and reload sequencing behind a typed socket authority around
  that session. Keep editor-selection preservation, canonical revision effects,
  resource refresh, and UI projection in the application coordinator through
  explicit callbacks.
- Keep a validated, identity-and-workspace-scoped browser copy of the latest
  authorized snapshot, full Yjs document state, and acknowledged server state
  vector so existing Markdown files remain editable offline. Reconstruct only
  the state-vector delta on restart, send it after the normal server-led sync,
  and clear local copies on reset and hosted logout. Validate the persisted
  record shape, schema version, ArrayBuffer state fields, and 16 MiB bounds with
  one inferred Valibot schema, then keep identity and workspace matching
  explicit. Keep record loading, snapshot validation, server-vector decoding,
  Yjs restoration, anchor reprojection, and corrupt-record eviction in the
  offline persistence authority. Keep collaboration queue recovery and UI
  projection in their existing owners.
- Cache only authenticated canonical editor navigation and the allowlisted
  authoring shell for offline fallback. Never service-worker-cache dashboard,
  review, or Library data, project/library APIs, WebSockets, exports, model
  requests, or private PDF bytes.
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
- Let the bounded writing-workflow panel derive and download the reviewer-
  response letter from its supplied canonical matrix. Route open, source-range,
  and resulting-notice actions through one typed binding shared by both workflow
  panels. Keep workflow-file creation, source navigation, and toast policy in
  the application coordinator.
- Keep native-textarea infrastructure in a bounded browser adapter that owns
  Yjs synchronization and history, highlight and presence mirroring, completion
  geometry, relative selections, and optional keymap binding. The application
  coordinator retains document, workflow, and navigation authority.
- Let the editor-status Lit owner derive file, line-range, caret, and selection
  wording from coordinator-supplied canonical source and resolved target values.
  Keep Yjs relative-position resolution, editor highlighting, assistant refresh,
  collaboration interpretation, and offline-save policy in their authorities.
- Let the preview-synchronization Lit owner bind the native source viewport and
  inert highlight lines; own click, selection, and navigation-key follow
  behavior; derive the source offset nearest the viewport center; center the
  editor on a requested source offset; resolve composition-map offsets in both
  directions; derive explicit versus wide split-layout availability and the
  corresponding centered or selected source offset; and route sync through
  typed callbacks. Keep active file, context, and layout authority, Preview DOM
  navigation, caret placement, and focus policy in the application coordinator.
- Keep source-completion interaction in its bounded light-DOM component: bind
  editor change, keyboard, and blur behavior there; invoke one coordinator
  callback for authoring-selection, presence, and model-availability
  consequences; persist citation suggestion scope there; detect citation and
  include contexts from the bound editor there; rank
  and adapt candidates there, own empty-state hiding and popup positioning
  there, dismiss locally on Escape or editor blur, and invoke one typed
  acceptance binding with the selected candidate and its replacement context.
  Derive citation
  and project-relative include candidates there from coordinator-supplied
  canonical project files and reference links. Let the component load, validate,
  and cache its private-Library candidate input only when that local scope is
  active. The application coordinator retains active-file identity,
  collaborative edits, and private-Library linking mutations without caching
  menu candidates, loading state, or kind state.
- Implement optional editor keymaps as bounded textarea command adapters that
  emit ordinary input changes. Keep keymap preference browser-local, preserve
  IME and modified browser shortcuts, and never create a second document model.
- Keep collaborator selections ephemeral. Accept only bounded, versioned
  selection metadata for the current file revision, replace client identity
  with a server-assigned socket identity, and never persist selection state.
  Let the collaborator-selection Lit owner store, replace, remove, clear, and
  prune that browser-local remote selection collection and request overlay
  refresh through a typed callback. Keep WebSocket protocol, revision authority,
  local-author selection, and editor highlighting in the application
  coordinator.
- Keep manuscript comments outside canonical Markdown. Attribute them to stable
  workspace-person ids, anchor them with file-qualified Yjs relative positions,
  retain them in project history, and preserve resolved comments as resources.
- Let the manuscript comment Lit panel own create, re-anchor, and resolve
  transport, local status and retryable failure state, open-comment count
  derivation from its canonical collection, authoring-action routing, and
  completed mutation outcomes. Bind passage resolution, passage navigation, and
  completed mutations through one typed workspace boundary; keep Yjs selection
  stability checks and typed passage derivation in the coordinator, and route
  the derived count to the rail.
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
  only viewer-clearing, refresh, and notification effects to the coordinator,
  including no-match and completed-erasure status,
  plus citation availability from the active PDF and canonical publication-PDF
  links. Let it also commit its own toolbar tool state, resolve viewer-highlight
  activation to edit/reveal or erase behavior, and complete undo state and
  status after delegated mutation. Let the composer configure and project its nested publication-intake
  owner, acknowledge or reject intake after canonical refresh, and route linked
  or accepted publications through typed callbacks. Route completed note-save,
  tool, undo, erasure, citation, and link outcomes through one typed workflow binding while
  leaving viewer draft clearing, manuscript linking,
  canonical refreshes, and notifications in the application
  coordinator.
- Refine tablet highlight strokes through bounded normalized geometry and quotation updates; preserve annotation/stroke identity and imported PDF immutability.
- Retain the active manuscript caret or selection as Yjs-relative positions, render that local target after editor blur, and resolve it before any contextual insertion or replacement.
- Keep standalone private PDF locations routable in browser history. Parse and
  write their canonical Library root, addressed-reference, artifact, and page
  locations through one pure route adapter; keep history mutation,
  authorization checks, navigation, and notices in the application coordinator.
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
  typed callback. Keep PDF viewer state, navigation, canonical snapshot
  application, refreshes, and toast policy in that coordinator.
- Let the PDF highlight import panel own bounded client-side detection,
  saved-highlight overlap filtering, reviewed candidate state, stable encoded
  import transport, duplicate-submit gating, and retryable local failures. Keep
  canonical Library refresh and completion toast policy in the application
  coordinator.
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
- Treat authoring and research context as the two primary workspace surfaces.
  Route responsive surface and Write/Map selection through narrow typed Lit
  navigation bindings while retaining visibility and URL authority in the
  workspace coordinator.
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
  Keep canonical context state, authorization, Library loading, content
  rendering, route synchronization, and transitions outside it.
- Let a separate resource-context Lit presenter coordinate the active
  publication, candidate, project-PDF, private-Library PDF, and shared-reference
  PDF presentation from those canonical inputs. It owns the composed canonical
  tab-strip projection, derives and retains the active resource selection for
  sibling consumers before selecting the owning panel, retains the resolved
  active private-Library artifact for page routing, capture, and saved-markup
  projection, restores resource scroll,
  projects supplied viewer state back into canonical
  fixed-tab scroll, resource scroll, PDF page, and focused-annotation state;
  projects page changes into canonical PDF context and page-local private
  markup state while returning route identities to the coordinator;
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
  presentation. Let it also derive the authorized publication, project-PDF,
  private-or-linked PDF, and candidate identity sets from canonical resource
  catalogs and resolve a supplied resource route to the matching canonical
  publication, project PDF, private-Library PDF, linked reference PDF, or
  candidate. Let it also resolve citation keys case-insensitively and choose
  the sole linked project PDF for a supported page locator, otherwise opening
  publication context. Route the resulting typed open intent through the application
  coordinator, which retains tab reconciliation, canonical context state,
  history mutation, navigation transitions, and load timing. Let the presenter
  own private-highlight citation readiness feedback,
  collision-safe project-reference preparation, and validated link transport,
  returning only the text-
  selection, selected-highlight, and draft-selection cleanup effects that
  remain viewer-owned, and
  synchronize the bounded evidence, annotation, publication, claim, comment,
  and candidate owners from one canonical workspace snapshot. Through a narrow
  viewer binding it derives the authorized active PDF load, synchronizes project
  annotations and private highlights, rejects stale completions, retains the
  rendered context and project-PDF identities, opens the viewer, restores
  resource scroll, presents active-resource failures, and routes captured
  selections to the private-highlight composer or project-annotation form from
  those retained identities. Keep tab state, canonical snapshot acceptance,
  Yjs citation insertion, cross-resource navigation, routing, project-selection
  persistence, remaining viewer gestures, and the shared notification outlet
  in the application coordinator through narrow callbacks.
  Let the presenter also own linked-reference PDF catalog loading, validation,
  storage, and authorization projection. Keep refresh timing and downstream
  rendering consequences in the application coordinator.
- Project bounded, reconstructible editor UI selections into query parameters
  only after validating stable ids against authorized snapshots.
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
  typed bindings on their Lit owners. Keep responsive surface application and
  global toast presentation in the workspace coordinator.
- Allow the ancillary project rail to resize only on desktop, persist its
  bounded width as a cross-project browser-local preference, and contract its
  effective maximum before either primary document surface loses its readable
  minimum. Allow independent browser-local collapse with an editor-hosted
  restoration action. Keep rail geometry out of URLs and collaborative state.
- Route rail-tab and manuscript-map range navigation through typed bindings on
  their Lit owners. Let the manuscript-map owner derive its composed guide
  source plus research-diary, research-question, and reviewer-response sibling
  projections from one canonical file set. Let it retain that composition's
  source map and translate guide selections into file-qualified editor ranges.
  Keep URL synchronization, workflow-file creation, and the resulting editor
  focus effect in the workspace coordinator.
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
