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
- Do not place executable browser code inline in Worker-rendered HTML. Client behavior should live in typed TypeScript modules before it is served to browsers.

## Kirjolab Product Architecture

- Treat portable project Markdown and stable shared-library records as the
  canonical authored artifacts. Keep BibTeX as bounded derived interchange and
  export, not a second project-local metadata authority.
- Compose each paper from exactly one root `main.md` through bounded,
  project-relative `::include[path]` directives. Keep supporting Markdown files
  user-named and preserve authored heading levels; never infer composition from
  file ordering.
- Give project files stable identities independent of mutable paths. Persist
  the file tree, all collaborative file texts, and their revision in one
  project-scoped `DocumentRoom`; qualify manuscript, evidence, and model
  anchors by file identity.
- Require every composition result to retain source-map spans back to file
  identity, source range, output range, and include chain. Reject unsafe paths,
  cycles, missing files, and resource-limit violations with navigable
  diagnostics.
- Derive every publication target from one versioned, source-mapped export
  intermediate. Markdown, cited BibTeX, LaTeX, PDF, statistics, and archives
  must not independently resolve includes or citation reachability.
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
- Parse standard and scientific-writing Markdown through pinned Satteri plugins; keep its syntax tree and HTML derived.
- Run the current threaded Satteri WASM binding in the cross-origin-isolated browser, not inside a Cloudflare Worker isolate.
- Escape authored raw HTML and sanitize the final preview tree after all syntax plugins; allow only the elements, properties, and URL protocols required by the scientific-writing vocabulary before inserting output into the DOM.
- Return a restrictive Content Security Policy on application HTML as an independent browser-execution boundary; do not permit inline or evaluated scripts.
- Coordinate each collaborative composed project through its own SQLite-backed Durable Object.
- Coordinate each personal reference library through a separate SQLite-backed
  Durable Object keyed by verified owner identity. Stable source identity must
  not depend on a DOI, title, filename, or project citation alias.
- Keep bibliographic provenance per field. Import and metadata services may
  suggest and deduplicate records, but source-type requirements must remain
  explicit and missing values must never be fabricated.
- Keep library PDFs, web captures, notes, highlights, tags, and reading state
  owner-private by default. A project citation receives only its local alias
  and bibliographic snapshot; sharing any additional resource must be a
  separate explicit, rights-checked action pinned into a project revision.
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
  through an explicit bounded provider request. A project id narrows the
  private projection but never grants library access.
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
- Evolve every SQLite-backed Durable Object through an ordered, named,
  append-only migration ledger. Apply each pending schema or data migration and
  its ledger record in one synchronous transaction; fail closed if applied
  version/name history changes.
- Verify Durable Object migration, transaction, RPC, and eviction contracts in
  an isolated real `workerd` runtime through the dedicated Cloudflare Vitest
  project. Node tests may cover shared pure logic but must not stand in for
  platform storage behavior.
- Discover workspaces through a separate SQLite-backed catalog per authenticated identity; never use one catalog as the collaboration atom for all documents.
- Keep stable workspace browser and API identities at `/workspaces/{id}` and `/api/workspaces/{id}`.
- Establish collaboration through a server-led Yjs handshake: send current
  binary state before a versioned synchronization control message, and never
  send speculative browser state on connection open.
- Retain ordered browser updates until the document room acknowledges durable
  handling; after reconnect, replay only updates that were not acknowledged.
- Materialize every causally new collaborative update into readable Markdown
  and bibliography text, but acknowledge duplicate or replayed Yjs state at the
  current revision without persistence, rebroadcast, or a revision increase.
- After synchronization, derive browser editor text from Yjs and its displayed
  revision from collaboration controls; REST resource refreshes must not write
  either value.
- Store imported PDF bytes in R2 and keep annotations as separate scholarly resources.
- Combine PDF page/geometry identity with exact quote, prefix, and suffix selectors; never require mutation of the imported PDF.
- Normalize PDF selection rectangles to top-left page coordinates in zero-to-one space so highlights do not depend on viewport pixels.
- Render only the active PDF page through the PDF.js display layer; keep its worker version matched with the pinned display dependency.
- Expose scholarly entities through stable resource identities and typed relationships rather than citation keys or filenames alone.
- Give workspace people opaque stored identities independent of email. Derive
  project membership, shared-note provenance, and model-candidate evidence as
  typed hypermedia links without making the projection authoritative.
- Derive bounded workspace search and hypermedia projections from canonical state until scale measurements justify a persisted index; treat visual graph layouts as optional views, not the navigation model.
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
- Keep adding a publication to working memory, citing it in canonical source,
  and connecting evidence to prose as distinct explicit actions. Opening,
  switching, pinning, or closing research context must not imply any of them.
- Keep external metadata preview non-mutating. Refetch and remap external
  metadata on acceptance into the owner library with per-field provenance;
  reuse stable likely-duplicate identity only after normalized identifier or
  reviewed bibliographic matching.
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
- Persist passage-revision candidates as a Yjs-relative target, bounded
  instruction, typed versioned evidence snapshots, provider/model identity, and
  replacement text. Never model a selected-passage operation as a proposed
  whole-document replacement, and splice only the verified target on apply.
- Keep local-model network access in the browser or a future local companion so a hosted Worker never assumes it can reach localhost.
- Keep the initial browser-direct model adapter on credential-free HTTP(S)
  loopback endpoints, reject redirects, bound its response before JSON parsing,
  and align the page connection policy with the same IPv4, localhost, and IPv6
  sources.
- Verify Cloudflare Access JWT signatures and claims inside the Worker for hosted identity; never trust caller-supplied identity headers alone.
- Authorize every workspace data representation, API operation, PDF stream, and WebSocket upgrade through explicit owner/member state.
- Authorize every library operation through its verified owner identity. Never
  let workspace membership imply access to the owner's private library;
  collaborators may read only active project-pinned snapshots.
- Require an exact same-origin `Origin` on every browser WebSocket upgrade in addition to identity and workspace authorization.
- Accept only bounded, valid binary document updates from collaboration clients; keep presence, revision, and protocol control frames server-owned, and never persist or rebroadcast invalid input.
- Permit local authentication only on loopback hosts; a deployment left in local mode must fail closed.

## Tooling Baseline

- Local development and local CI target macOS as the supported host platform baseline.
- Node is pinned exactly through `package.json`, and npm is constrained to a compatible major there instead of an exact patch pin.
- The verification baseline is split into a fast gate and a browser gate so quick checks can return earlier without dropping full coverage.
- The repo-managed `pre-push` Git hook should run affected-file guardrails before code is pushed.
- Formatting, type checking, unit tests, and end-to-end tests are part of the baseline quality gate.
- Keep Node Vitest responsible for fast pure-domain coverage and mutation
  feedback; keep the separate Workers Vitest project responsible for real
  Durable Object and SQLite integration behavior.
- Fallow codebase diagnostics are advisory readability checks for complexity, duplication, dependency hygiene, and cleanup evidence; they do not replace the baseline quality gate.
- Affected-file guardrails should scope checks to changed files when the underlying tool supports it and fall back to project-level checks only when needed.
- Affected-file guardrails must route Worker-reachable non-client sources,
  Workers tests and configuration, and Satteri deployment-asset inputs to the
  Workers-runtime suite, while keeping `*.workers.test.ts` out of the Node
  Vitest project.
- The fast quality gate should fail when Worker/view runtime files contain inline script blocks without a `src`, inline event-handler attributes, or `javascript:` URLs. External scripts must point to an explicit typed client build.
- Unit coverage for `src/` code should stay high enough that the coverage gate remains green.
- Local CI should validate the same baseline checks before non-documentation changes are proposed or merged.
- The baseline quality gate and local CI must execute the Workers-runtime test
  project; its direct command is only a targeted iteration shortcut.
- Targeted commands are useful while iterating, but `npm run quality:gate` and `npm run ci:local` remain the readiness baseline before proposing or landing non-documentation changes.
- `npm run diagnostics:codebase` is useful during review and refactoring, but passing or failing it is not a readiness baseline by itself.
- Documentation-only changes may skip `npm run ci:local` when they do not alter executable config, generated artifacts, package metadata, source code, or tests.
- Build typed browser code with esbuild into the existing ignored `.generated/` directory before Wrangler bundles the Worker.
- Regenerate committed Worker binding types with `npx wrangler types worker-configuration.d.ts` whenever `wrangler.jsonc` bindings change.

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
