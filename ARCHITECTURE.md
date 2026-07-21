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
- Model external scholarly works as typed sets of stable identifiers. Prefer DOI when present, but do not make DOI a prerequisite for discovery or review.
- Do not place executable browser code inline in Worker-rendered HTML. Client behavior should live in typed TypeScript modules before it is served to browsers.
- Use XState only for bounded event-driven browser workflows whose mutually
  exclusive states, asynchronous lifecycle, or guarded transitions would
  otherwise span several independent fields. Keep route values, persisted
  domain data, Yjs state, and compact pure reducers in their existing
  authorities; XState is not a global application store.
- Keep application appearance behind shared semantic color tokens. Light and dark modes may vary token values, but components must not grow separate theme-specific palettes.
- Keep the interface design system thin and source-local under `src/ui/`: foundations, visual primitives, shared state contracts, typed icons, and small markup helpers only. Domain components compose it without moving application behavior or state into a second UI architecture.
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
  one non-forced direct commit by default; never synchronize in the background.
- Import LaTeX archives only through a bounded, authenticated Worker workflow
  that separates non-mutating inspection from reviewed project creation. Keep
  Markdown canonical; never retain TeX as a second editable authority or
  execute uploaded TeX.
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
- Store project image metadata beside the durable file tree and keep its bytes
  as bounded, inert R2 objects under the reserved `figures/` path. Do not put
  uploaded image bytes in Yjs. Accept SVG only as validated UTF-8 image content
  without active or external-resource constructs, and serve it under a
  no-script, no-network sandbox policy.
- Represent reusable project templates as versioned sanitized seeds containing
  only Markdown files, folders, portable BibTeX, and publication settings.
  Store personal templates in a separate owner-keyed authority; never use a
  hidden project, the workspace catalog, or a complete revision seed. Template
  instantiation is an independent copy with no live inheritance.
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
- Extract PDF metadata only as bounded, browser-local suggestions. Apply
  canonical library changes per field after the library authority verifies the
  artifact/reference relationship; never change the immutable reference key.
- Project reviewed metadata alternatives beneath their corresponding canonical
  editor inputs, but keep manual save, PDF acceptance, and provider acceptance
  as explicit provenance-preserving operations.
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
- Model each web source as one stable owner-library identity with append-only,
  timestamped captures. Retrieve only bounded public HTTP(S) content through
  manually validated redirects, store raw/readable representations privately
  as inert R2 objects, and make projects pin an exact capture rather than a
  mutable latest URL.
- Treat web-capture comparison as neutral readable-text change data. Never
  render fetched markup, silently move a project pin, or infer authority or
  correctness from a capture or diff.
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
- Keep a validated, identity-and-workspace-scoped browser copy of the latest
  authorized snapshot, full Yjs document state, and acknowledged server state
  vector so existing Markdown files remain editable offline. Reconstruct only
  the state-vector delta on restart, send it after the normal server-led sync,
  and clear local copies on reset and hosted logout.
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
- Implement optional editor keymaps as bounded textarea command adapters that
  emit ordinary input changes. Keep keymap preference browser-local, preserve
  IME and modified browser shortcuts, and never create a second document model.
- Keep collaborator selections ephemeral. Accept only bounded, versioned
  selection metadata for the current file revision, replace client identity
  with a server-assigned socket identity, and never persist selection state.
- Keep manuscript comments outside canonical Markdown. Attribute them to stable
  workspace-person ids, anchor them with file-qualified Yjs relative positions,
  retain them in project history, and preserve resolved comments as resources.
- Store imported PDF bytes in R2 and keep annotations as separate scholarly resources.
- Combine PDF page/geometry identity with exact quote, prefix, and suffix selectors; never require mutation of the imported PDF.
- Normalize PDF selection rectangles to top-left page coordinates in zero-to-one space so highlights do not depend on viewport pixels.
- Model a mutable PDF highlight as one stable annotation with ordered, provenance-bearing selection strokes. Auto-save paint strokes, address undo and erasing by stroke identity, and keep claim-dependent annotation deletion guarded.
- Refine tablet highlight strokes through bounded normalized geometry and quotation updates; preserve annotation/stroke identity and imported PDF immutability.
- Retain the active manuscript caret or selection as Yjs-relative positions, render that local target after editor blur, and resolve it before any contextual insertion or replacement.
- Keep standalone private PDF locations routable in browser history, coalesce selected PDF text into normalized visual-line rectangles, and export each saved highlight as one interoperable multi-quad PDF annotation without mutating source bytes.
- Merge overlapping private highlight saves at the owner-library authority and update private highlight comments or page-note bodies in place; preserve annotation identity and treat project shares as immutable snapshots.
- Keep citation style and locale as versioned project publication settings consumed by preview and export; never rewrite canonical Markdown or shared bibliographic records when they change.
- Resolve project submission layouts from bounded versioned presets; never execute uploaded TeX, scripts, remote assets, or arbitrary template paths in the export pipeline.
- Keep reference-library search, facets, and sorting as ephemeral local projections over the authorized private snapshot; never persist private search intent into project or collaboration state.
- Render only the active PDF page through the PDF.js display layer; keep its worker version matched with the pinned display dependency.
- Expose scholarly entities through stable resource identities and typed relationships rather than citation keys or filenames alone.
- Give workspace people opaque stored identities independent of email. Derive
  project membership, shared-note provenance, and model-candidate evidence as
  typed hypermedia links without making the projection authoritative.
- Derive bounded workspace search and hypermedia projections from canonical state until scale measurements justify a persisted index. Host the project evidence map as a read-only authoring modality paired with ordinary resource actions; never make its visual layout authoritative or the only navigation model.
- Invalidate browser resource views with a server-owned control message and a
  coalesced authorized metadata refresh rather than replacing live editor
  state from a workspace snapshot.
- Treat claims as stable, human-authored propositions; store their evidence and manuscript usage as typed links so editing or deleting a claim never mutates its source annotations or authored prose.
- Treat authoring and research context as the two primary workspace surfaces.
  Keep a permanent manuscript Preview in a keyboard-operable right-hand tab
  pane, and address publication, PDF, and model-candidate tabs by stable
  resource identity.
- Keep open context tabs, active and pinned state, preview scroll, and PDF
  reading position local to the browser and scoped to its authorized workspace.
  Never write routine reading navigation into Yjs, Durable Object resources, or
  collaboration control messages.
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
- Collapse the two-surface workspace to an explicit Authoring/Context switch
  when both surfaces cannot retain readable measures; preserve editor and
  per-context local state while either surface is hidden.
- Treat manuscript passage links as immutable, versioned selectors rather than
  permanent current offsets. Verify the source revision and exact range at
  creation, then capture Yjs relative positions, exact quote/context,
  original offsets, and the anchored revision.
- Resolve version 1 manuscript anchors only from valid, non-collapsed Yjs
  relative positions. Expose `resolved` or `stale` state; exact quote/context
  and original offsets remain provenance and must never act as runtime
  navigation fallback.
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
- The repo-managed `pre-push` Git hook should run affected-file guardrails before code is pushed.
- Formatting, Oxlint correctness checks, type checking, unit tests, and end-to-end tests are part of the baseline quality gate.
- Oxlint uses its default correctness rules and complements rather than replaces Prettier formatting and TypeScript type checking.
- Browser tests launch Wrangler with a fresh operating-system temporary persistence directory and remove it on shutdown. Test workspaces must never accumulate in the interactive development catalog.
- Local Agent CI must explicitly prewarm through one deterministic install step
  before parallel jobs receive isolated writable dependency views. Do not
  restore shared mutable dependency mounts or repo-local install locks.
- Keep Node Vitest responsible for fast pure-domain coverage and mutation
  feedback; keep the separate Workers Vitest project responsible for real
  Durable Object and SQLite integration behavior.
- Fallow codebase diagnostics are advisory readability checks for complexity, duplication, dependency hygiene, and cleanup evidence; they do not replace the baseline quality gate.
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
