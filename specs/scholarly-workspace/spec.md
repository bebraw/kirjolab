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
  `.generated/app.txt`.
- **Primary surfaces:** The authoring editor remains visible beside a tabbed
  research-context pane on desktop. The pane permanently hosts manuscript
  Preview and can host publication, PDF, and model-candidate resources without
  making local tab, pin, scroll, or reading-position state collaborative.
  Narrow layouts switch between one Authoring or Context surface while
  preserving both states.
- **Workspace navigation:** `WorkspaceCatalog` lists and creates stable
  workspace resources while each `DocumentRoom` retains isolated coordination.
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
  workspace refreshes cannot assign those values.
- **Revision boundary:** Causally new Yjs state materializes Yjs, Markdown, and
  BibTeX together and advances the revision once. Duplicate or replayed updates
  receive an `ack` at the current revision without persistence, rebroadcast, or
  a revision increase. When bibliography text changes, every complete canonical
  entry is reconciled into publication resources in the same transaction.
- **Resource metadata:** The document Durable Object stores PDF artifact
  fingerprints, annotations, publication projections, durable many-to-many
  publication/PDF links, passage links, and model candidates alongside the
  document coordination atom. Each explicit publication/PDF pair projects a
  `has-artifact` edge; no metadata or filename heuristic creates it. Its
  server-owned `resources` control invalidates a coalesced REST metadata refresh
  without replacing editor state.
- **Reference library:** Every complete parsed canonical BibTeX entry
  materializes after local edits, remote edits, imports, enrichment, and initial
  migration. Publication UUID matching uses case-insensitive citation key
  before normalized DOI. Exact no-op projection preserves provenance and
  timestamp; authored changes record `bibtex`, explicit Crossref enrichment
  remains `crossref`, and absent entries do not delete monotonic resources.
  An unlinked PDF can use a non-mutating DOI preview followed by fingerprinted
  acceptance that atomically appends a new Crossref-backed entry and its
  explicit artifact link, or idempotently reuses existing DOI identity.
- **Knowledge navigation:** Bounded workspace search and typed connection
  representations expose documents, sections, publications, PDFs, and
  annotations as navigable resources without making an index authoritative.
- **Claims:** Human-authored propositions connect annotations to manuscript
  passages through explicit `supports`, `contradicts`, `extends`, and `used-in`
  relationships.
- **Manuscript anchors:** New annotation and claim passage links verify the
  current source revision and exact requested range, then store version 1 Yjs
  relative positions (start association `0`, end association `-1`), stable file
  identity, exact
  quote/context, original offsets, and anchored revision. Public links expose
  their immutable selector and a derived `resolved` or `stale` resolution
  rather than top-level current offsets. Version 1 resolves only through its
  relative positions. A one-time migration derives endpoints for still-valid
  offset rows; unconvertible legacy rows retain null endpoints and remain
  explicitly stale under the version 1 selector contract.
- **Blob storage:** The `PAPERS` R2 binding stores immutable PDF bytes under a
  workspace-scoped key. PDF responses stream from R2 and the R2 ETag identifies
  the exact stored artifact.
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
  BibTeX into Yjs and atomically reconciles its complete publication entries.
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
- `POST /api/workspaces/demo/candidates` verifies and persists a targeted
  `revise-selection-v1` candidate with typed evidence snapshots.
- `POST /api/workspaces/demo/candidates/{id}/apply` applies a current pending
  candidate.
- `POST /api/workspaces/demo/candidates/{id}/reject` rejects a pending
  candidate without changing source.
- `GET /api/workspaces/demo/export/document.md` exports Markdown composed from
  canonical `main.md`.
- `GET /api/workspaces/demo/export/bibliography.bib` exports canonical BibTeX.

### Anti-Patterns

- Do not make Yjs state, rendered HTML, or a candidate the only usable document
  representation.
- Do not send browser Yjs state speculatively when a socket opens or treat a
  sent frame as durable before its acknowledgement.
- Do not let a REST metadata refresh assign source, bibliography, or displayed
  revision after Yjs synchronization.
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
- Do not project publications only during import, rewrite unchanged projection
  rows, or delete resources absent from current canonical BibTeX.
- Do not update canonical bibliography and its publication projection in
  separate commits.
- Do not infer a publication/PDF association from citation key, DOI, title,
  author, filename, or similarity, and do not delete either endpoint when an
  explicit link is removed.
- Do not add ad hoc schema checks or data backfills outside the ordered
  migration ledger, and never edit an applied migration definition.
- Do not treat a Node storage substitute or browser-only assertion as sufficient
  evidence for Durable Object SQLite transactions, migrations, RPC, or recovery
  after eviction.
- Do not buffer PDF bodies in Worker memory.
- Do not write annotation data into imported PDFs.
- Do not deploy with local authentication or without a protected Cloudflare
  Access hostname and matching JWT configuration.
- Do not claim CSL-complete bibliography formatting or direct Worker-side
  Satteri execution in this slice.

## Contract

### Definition of Done

- [x] Two browser sessions converge on one collaborative Markdown document.
- [x] Server state establishes synchronization before the browser sends queued
      updates, and each client update receives a durable acknowledgement.
- [x] Reconnect replays only unacknowledged updates; an already integrated
      replay is acknowledged without advancing the revision.
- [x] Yjs owns live editor text after synchronization while coalesced resource
      refreshes update only non-editor workspace state.
- [x] Markdown changes update a semantic preview and diagnostics immediately.
- [x] A permanent Preview and resource-keyed publication, PDF, and candidate
      tabs share one right research-context pane beside manuscript authoring.
- [x] Tab, pin, page, focus, and reading-position state remains local while
      narrow layouts switch explicitly between Authoring and Context.
- [x] Citation and reference targets are validated against BibTeX and document
      targets.
- [x] Preview citations open publication context and explicit citation
      insertion uses a remembered collaborative authoring position.
- [x] Every complete canonical BibTeX entry materializes after local and remote
      edits as well as imports, independently of citation keys.
- [x] Stable publication reconciliation preserves an unchanged source/timestamp,
      records authored edits as `bibtex`, and retains explicitly accepted
      `crossref` provenance.
- [x] Removing a canonical entry leaves its monotonic publication resource in
      working memory.
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
- [x] Markdown and BibTeX export without private collaboration state.
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
- Every complete parsed entry must be reconciled after a bibliography-changing
  Yjs update, matching stable UUID by case-insensitive key before normalized DOI.
- An exactly unchanged projection must retain its metadata source and timestamp;
  an authored projected change must record `bibtex`, and explicit accepted
  enrichment must remain `crossref`.
- Absence from current canonical BibTeX must never implicitly delete a
  publication resource.
- Publication/PDF associations must reference known same-workspace resources,
  remain unique per pair, and originate only from an explicit action. Removing
  one must preserve both resources and every annotation.
- Import and enrichment must minimally splice bibliography `Y.Text` and
  atomically persist Yjs/materialized document state, revision, and publication
  reconciliation.
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

**Scenario: Collaborative bibliography becomes resources**

- Given: a synchronized bibliography editor
- When: a writer completes or changes a supported BibTeX entry
- Then: the same durable transaction materializes canonical BibTeX and upserts
  its stable publication, preserving provenance only when projected values are
  exactly unchanged

**Scenario: Removing authored BibTeX keeps working memory**

- Given: a canonical entry has a stable publication resource
- When: a writer removes the entry from current bibliography text
- Then: canonical BibTeX changes while the publication remains available and no
  relationship is implicitly deleted

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
