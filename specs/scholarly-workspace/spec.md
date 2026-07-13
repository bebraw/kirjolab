# Feature: Scholarly Workspace Vertical Slice

## Blueprint

### Context

Kirjolab needs to prove one complete scholarly loop before expanding into a
general editor or reference manager. A researcher must be able to move evidence
from an immutable PDF into an anchored annotation, connect it to manuscript
text, ask a local model for a grounded revision, review the candidate, and
export portable source.

The compatible `demo` workspace remains the root experience, while additional
UUID workspaces are discovered through the local-owner catalog. The current
surface supports loopback local identity and a fail-closed Cloudflare Access
mode for authenticated hosted collaboration.

### Architecture

- **Application shell:** `src/views/home.ts` renders the accessible workspace;
  `src/client/app.ts` provides typed browser behavior bundled into
  `.generated/app.txt`. Persistent interface copy names the user's next action
  and keeps implementation detail in feature documentation rather than the
  task surface.
- **Primary surfaces:** The authoring editor remains visible beside a tabbed
  research-context pane on desktop. The pane permanently hosts manuscript
  Preview, the owner-private Library, and Writing assistant, and can host
  publication, PDF, and model-candidate resources without making local tab,
  pin, scroll, or reading-position state collaborative.
  Layouts narrower than the split pane's declared minimum width switch between
  one Authoring or Context surface while preserving both states and without
  introducing horizontal page overflow.
- **Left project rail:** Files, Research, and Comments are peer local navigation
  modes. Comments contains the selected-passage composer and durable comment
  history without taking vertical space from the manuscript editor. Files owns
  the collapsed read-only project bibliography projection beside the authored
  file list. Their persistent switcher uses compact icons with accessible names,
  native hover titles, and a visible open-comment count.
- **Workspace navigation:** `WorkspaceCatalog` lists and creates stable
  workspace resources while each `DocumentRoom` retains isolated coordination.
  Infrequent project-management and file-mutation actions stay grouped in
  labelled menus so the persistent chrome prioritizes authoring and export.
  User-facing copy calls the editable unit a project; workspace remains an
  implementation term for APIs, types, and coordination boundaries.
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
- **Document semantics:** Satteri parses standard Markdown and GFM while
  `src/domain/markdown.ts` adds headings, citations, references, aliases,
  anchors, validation, and preview security from the scientific-writing syntax.
- **Project composition:** One stable root `main.md` composes user-named
  supporting Markdown files through bounded relative `::include[path]`
  directives. Preview and export use the composed source while diagnostics and
  durable anchors retain file-qualified source provenance.
- **Collaboration:** `DocumentRoom` is a SQLite-backed Durable Object for each
  composed project. On a hibernatable WebSocket connection it sends full binary Yjs
  state followed by a versioned `sync` control. The browser sends no state on
  open, retains ordered local updates until a durable `ack`, and replays only
  unacknowledged updates after reconnect.
- **Editor ownership:** After `sync`, source and bibliography inputs derive from
  `Y.Text`; server collaboration controls own the displayed revision. REST
  workspace refreshes cannot assign those values. The editor reports `Saved`
  once initial synchronization completes with no queued local updates.
- **Collaborator selections:** A client may send only an exact-key, bounded
  `protocol: 1` selection message for the current file and revision. The room
  supplies its socket identity, validates the range, broadcasts it only to
  peers, and never persists it. Disconnect emits a server-owned clear control.
- **Revision boundary:** Causally new Yjs state materializes Yjs, Markdown, and
  BibTeX together and advances the revision once. Duplicate or replayed updates
  receive an `ack` at the current revision without persistence, rebroadcast, or
  a revision increase. When bibliography text changes, every complete canonical
  entry is reconciled into publication resources in the same transaction.
- **Logical history:** A separate monotonic history sequence captures complete
  project state for manuscript and resource mutations without changing the
  source revision used to validate selections. Immutable milestone names point
  to one history revision. Restore creates a new source and history head and
  sends a server-owned reset control so every connected browser reloads from
  the restored coordination state.
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
- **Private PDF reading:** Owner-library PDF artifacts may reuse the context
  PDF renderer through distinct read-only `library-pdf:` tabs. Their bytes and
  tab authorization remain owner-private, and navigation never creates project
  evidence or sharing state.
- **Web sources:** Public HTTP(S) pages are captured through bounded,
  redirect-controlled Worker retrieval into immutable owner-private raw and
  readable R2 objects. Project citations pin one exact access timestamp and
  content hash; normal reference refresh cannot move the pin.
- **Citation assertions:** Source-to-source relationships live in the private
  shared library as directional provenance-bearing assertions, not manuscript
  `cites` edges. The bounded derived network can focus on current-project
  references, retains conflicts, and expands Crossref references only after an
  explicit owner action.
- **Knowledge navigation:** Bounded workspace search and typed connection
  representations expose documents, sections, publications, PDFs, and
  annotations as navigable resources without making an index authoritative.
- **Claims:** Human-authored propositions connect annotations to manuscript
  passages through explicit `supports`, `contradicts`, `extends`, and `used-in`
  relationships.
- **Manuscript anchors:** New annotation, claim passage links, and comments verify the
  current source revision and exact requested range, then store version 1 Yjs
  relative positions (start association `0`, end association `-1`), stable file
  identity, exact
  quote/context, original offsets, and anchored revision. Public links expose
  their immutable selector and a derived `resolved` or `stale` resolution
  rather than top-level current offsets. Version 1 resolves only through its
  relative positions. A one-time migration derives endpoints for still-valid
  offset rows; unconvertible legacy rows retain null endpoints and remain
  explicitly stale under the version 1 selector contract.
- **Manuscript comments:** Comments are attributed to stable workspace-person
  ids and stored outside Markdown with a version 1 manuscript anchor, body,
  lifecycle status, and timestamps. Creation and resolution are explicit
  resource mutations retained in project history; neither changes authored
  source.
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
- **Exports:** Dedicated endpoints return `document.md` and `bibliography.bib`
  with download metadata.

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
- `GET /api/workspaces/demo/pdfs/{id}` streams an imported PDF.
- `POST /api/workspaces/demo/annotations` creates a selector-backed annotation.
- `POST /api/workspaces/demo/annotation-links` atomically creates one
  selector-backed annotation and its current manuscript passage link.
- `POST /api/workspaces/demo/bibliography/import` minimally splices merged valid
  BibTeX into the owner library and links its stable records with local aliases.
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
- Do not claim CSL-complete bibliography formatting or direct Worker-side
  Satteri execution in this slice.

## Contract

### Definition of Done

- [x] Two browser sessions converge on one collaborative Markdown document.
- [x] Current collaborator carets and selections are visible without entering
      canonical source or durable project state.
- [x] Collaborators can create, navigate, and resolve attributed range-anchored
      comments without mutating Markdown.
- [x] Comments use a dedicated left-rail mode instead of an editor-bottom
      drawer or modal.
- [x] The derived project bibliography is inspectable as secondary Files-rail
      context without shortening the manuscript editor.
- [x] Crowded left-rail navigation remains identifiable through labelled icons,
      hover titles, selected state, and the visible comment count.
- [x] Server state establishes synchronization before the browser sends queued
      updates, and each client update receives a durable acknowledgement.
- [x] Reconnect replays only unacknowledged updates; an already integrated
      replay is acknowledged without advancing the revision.
- [x] Yjs owns live editor text after synchronization while coalesced resource
      refreshes update only non-editor workspace state.
- [x] Markdown changes update a semantic preview and diagnostics immediately.
- [x] Permanent Preview, Library, and Writing assistant tabs plus resource-keyed
      publication, PDF, and candidate tabs share one right research-context
      pane beside manuscript authoring.
- [x] Tab, pin, page, focus, and reading-position state remains local while
      narrow layouts switch explicitly between Authoring and Context.
- [x] The split workspace activates only when all minimum-width tracks fit;
      compact desktop windows remain free of horizontal page overflow.
- [x] Writing assistant remains a permanent, keyboard-accessible Context tab
      instead of extending the workspace below the fold.
- [x] Initial collaboration synchronization resolves the editor status from
      `Opening…` to `Saved` when no local update is pending.
- [x] Persistent toolbars group infrequent project and file mutations without
      hiding them behind unexplained glyphs.
- [x] Permanent helper and empty-state copy stays concise, action-oriented, and
      free of architecture terminology that does not change the user's choice.
- [x] Project creation, navigation, access, search, and errors use one
      consistent user-facing noun.
- [x] Normal-sized secondary text maintains at least 4.5:1 contrast across the
      canvas, paper, and editor surfaces.
- [x] Contextual toolbar actions stay out of the persistent chrome until the
      active citation or resource makes them usable.
- [x] Action popovers expose ordinary button-list keyboard semantics, close on
      Escape, and return focus to their labelled summary control.
- [x] Citation and reference targets are validated against BibTeX and document
      targets.
- [x] Preview citations open publication context and explicit citation
      insertion uses a remembered collaborative authoring position.
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

- Binary Yjs state must arrive before the versioned `sync` control on every
  connection, and the browser must not send queued state before that boundary.
- Canonical source and bibliography must be materialized after every causally
  new Yjs update.
- A client update must remain queued until its `ack`; replaying already
  integrated state must return the current revision without persistence,
  rebroadcast, or revision advancement.
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
- PDF uploads must require `application/pdf`, a known positive content length,
  and the 25 MB size limit.
- Annotation creation must require a known PDF, positive page number, exact
  quote, textual context fields, and valid bounded geometry when present.
- Creating a passage link must require the current source revision and exact
  text at a valid non-empty supplied range.
- New selectors must store version 1 relative endpoints with start association
  `0` and end association `-1`, exact/prefix/suffix text, original offsets, and
  anchored revision.
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
- Browser code must remain external to Worker-rendered HTML and pass both strict
  worker and client TypeScript configurations.

### Verification

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

- Given: the demo workspace is open in a browser
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
