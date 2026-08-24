# ADRs

This directory stores Architecture Decision Records for decisions that are significant enough to shape future work in the repo.

The default in this template is to make architectural choices explicit. If a change introduces or changes a lasting architectural constraint, chooses between credible architectural alternatives, or supersedes an earlier decision, add or update an ADR in the same change set.

Use an ADR when a decision:

- establishes a lasting technical constraint
- selects between credible architectural alternatives
- accepts a meaningful trade-off that future contributors should understand
- replaces, narrows, or broadens an earlier architecture decision

Skip an ADR for small, reversible, or purely tactical choices.

ADRs are grouped by lifecycle status:

- `proposed/` stores draft ADRs and the reusable ADR template.
- `accepted/` stores approved ADRs whose decisions are not fully implemented yet.
- `implemented/` stores ADRs only after the repo actually implements the decision, including records later marked superseded so historical decisions stay with the implemented decision log.

## Proposed ADRs

| ADR                                       | Status   | Summary                            |
| ----------------------------------------- | -------- | ---------------------------------- |
| [ADR-000](./proposed/ADR-000-template.md) | Proposed | Template for drafting future ADRs. |

## Accepted ADRs

No ADRs are currently accepted and awaiting implementation.

## Implemented ADRs

| ADR                                                                                       | Status               | Summary                                                                                                         |
| ----------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------- |
| [ADR-229](./implemented/ADR-229-bound-corpus-library-rpc-queries.md)                      | Implemented          | Select bounded corpus artifact pages and records beside the Library storage authority.                          |
| [ADR-228](./implemented/ADR-228-expose-corpus-through-http-and-mcp.md)                    | Implemented          | Use versioned HTTP as the data plane and stateless MCP as a bounded semantic projection.                        |
| [ADR-227](./implemented/ADR-227-extract-research-corpus-service.md)                       | Implemented          | Extract a reusable corpus service incrementally over the existing private storage authorities.                  |
| [ADR-226](./implemented/ADR-226-publish-immutable-package-assets.md)                      | Implemented          | Pin exact package artifacts in checked manifests and immutable GitHub Release assets.                           |
| [ADR-225](./implemented/ADR-225-use-instrumented-dry-run-for-required-mutation-ci.md)     | Implemented          | Keep required GitHub mutation CI as an instrumented compatibility smoke while scoring mutation locally.         |
| [ADR-224](./implemented/ADR-224-override-unused-puppeteer-browser-installer.md)           | Implemented          | Replace Puppeteer's unused vulnerable browser installer while retaining the tested Browser Run adapter.         |
| [ADR-223](./implemented/ADR-223-incubate-paper-import-core.md)                            | Implemented          | Incubate reviewed paper-import contracts, exact preview identity, provenance, and conformance before packaging. |
| [ADR-222](./implemented/ADR-222-keep-pdf-display-and-annotation-modes-independent.md)     | Implemented          | Project private markup through page-local layers without letting annotation tools change the display mode.      |
| [ADR-221](./implemented/ADR-221-gate-optional-integrations-by-deployment-capability.md)   | Implemented          | Derive optional integrations from complete server configuration and expose only boolean browser capabilities.   |
| [ADR-220](./implemented/ADR-220-establish-portable-self-host-boundaries.md)               | Implemented          | Add a loopback Compose evaluation profile and begin native portability at a provider-neutral SQLite adapter.    |
| [ADR-219](./implemented/ADR-219-adopt-local-spec-and-tdd-skills.md)                       | Implemented          | Convert settled context into local specs and use focused TDD when observable behavior has a stable seam.        |
| [ADR-218](./implemented/ADR-218-adopt-repository-local-wayfinding.md)                     | Implemented          | Preserve large, uncertain multi-session discovery in explicit repository-local maps.                            |
| [ADR-217](./implemented/ADR-217-vendor-focused-engineering-quality-skills.md)             | Implemented          | Add pinned correctness-review, test-review, and debugging workflows under the canonical local skill root.       |
| [ADR-216](./implemented/ADR-216-bound-pull-request-mutation-ci.md)                        | Implemented          | Keep required mutation CI clean while testing only production sources affected by a pull request.               |
| [ADR-215](./implemented/ADR-215-keep-layout-diagnostics-local-and-opt-in.md)              | Implemented          | Capture bounded, content-free layout evidence only in an explicitly opted-in local browser session.             |
| [ADR-214](./implemented/ADR-214-read-paired-chapter-notes-in-context.md)                  | Implemented          | Read conventionally paired chapter notes in Context while retaining ordinary Markdown file semantics.           |
| [ADR-213](./implemented/ADR-213-protect-main-with-authoritative-ci.md)                    | Implemented          | Require pull requests and authoritative GitHub Actions checks before updating main.                             |
| [ADR-212](./implemented/ADR-212-use-cloudflare-mcp-as-platform-knowledge.md)              | Implemented          | Use Cloudflare MCP for current platform knowledge while retaining focused skills for adopted capabilities.      |
| [ADR-211](./implemented/ADR-211-clean-only-disposable-local-state.md)                     | Implemented          | Clean reproducible local artifacts through a symlink-safe allowlist while preserving application state.         |
| [ADR-210](./implemented/ADR-210-isolate-e2e-artifact-analysis.md)                         | Implemented          | Acknowledge artifact-analysis jobs only in disposable E2E state while keeping production execution enabled.     |
| [ADR-209](./implemented/ADR-209-keep-workers-runtime-tests-local.md)                      | Implemented          | Disable remote binding sessions in Worker tests while marking production-only AI access explicitly remote.      |
| [ADR-208](./implemented/ADR-208-validate-the-adr-registry.md)                             | Implemented          | Validate unique ADR identities, lifecycle metadata, index coverage, and local links in the fast gate.           |
| [ADR-207](./implemented/ADR-207-configure-native-editor-indentation.md)                   | Implemented          | Configure browser-local spaces or tabs while preserving the native collaborative editor.                        |
| [ADR-206](./implemented/ADR-206-separate-review-responses-from-comments.md)               | Implemented          | Keep portable external-review responses separate from range-bound collaborator comments.                        |
| [ADR-205](./implemented/ADR-205-record-research-questions-in-markdown.md)                 | Implemented          | Record structured research questions in a portable conventional Markdown project file.                          |
| [ADR-204](./implemented/ADR-204-use-portable-writing-workflow-files.md)                   | Implemented          | Keep author-managed writing workflows canonical in conventional Markdown project files.                         |
| [ADR-203](./implemented/ADR-203-use-revocable-read-only-share-links.md)                   | Partially superseded | Use revocable opaque bearer links for read-only project sharing.                                                |
| [ADR-202](./implemented/ADR-202-colocate-bounded-feature-styles.md)                       | Implemented          | Keep shared visual contracts in `src/ui/` and colocate bounded feature styles with their client owners.         |
| [ADR-201](./implemented/ADR-201-prioritize-frequent-pdf-tools.md)                         | Implemented          | Keep frequent private-PDF tools visible and group display and document actions in labelled secondary menus.     |
| [ADR-200](./implemented/ADR-200-extract-the-pdf-context-session.md)                       | Implemented          | Isolate active PDF viewer identity, loading, scroll restoration, and layout access behind a bounded session.    |
| [ADR-199](./implemented/ADR-199-prioritize-workspace-surfaces-on-tablets.md)              | Implemented          | Give tablet authoring and PDF context priority over the project rail and keep PDF auxiliary panels as overlays. |
| [ADR-198](./implemented/ADR-198-organize-source-by-capability.md)                         | Implemented          | Organize runtime source by capability while retaining explicit platform and integration boundaries.             |
| [ADR-197](./implemented/ADR-197-extract-searchable-pdf-text-server-side.md)               | Implemented          | Extract bounded searchable PDF text asynchronously inside the owner-private artifact pipeline.                  |
| [ADR-191](./implemented/ADR-191-adopt-cytoscape-for-citation-graphs.md)                   | Implemented          | Use a lazy Cytoscape runtime for interactive citation graphs while retaining accessible DOM authority.          |
| [ADR-190](./implemented/ADR-190-discover-forward-citations-with-semantic-scholar.md)      | Implemented          | Discover reviewed DOI-backed forward citations through bounded Semantic Scholar rounds.                         |
| [ADR-189](./implemented/ADR-189-reconcile-library-references-explicitly.md)               | Implemented          | Merge only reviewed strong duplicate references inside the owner Library authority.                             |
| [ADR-188](./implemented/ADR-188-report-pdf-reference-quality.md)                          | Implemented          | Evaluate PDF reference extraction against a versioned private-data-free corpus.                                 |
| [ADR-187](./implemented/ADR-187-review-pdf-references-server-side.md)                     | Implemented          | Revalidate and review parsed PDF references inside the owner Library authority.                                 |
| [ADR-186](./implemented/ADR-186-promote-source-modules-through-evidence-gates.md)         | Implemented          | Require independent consumers and explicit ownership before workspace packaging or publication.                 |
| [ADR-185](./implemented/ADR-185-defer-graph-renderer-adoption.md)                         | Superseded           | Deferred a graph renderer until ADR-191 committed a second interaction trigger.                                 |
| [ADR-184](./implemented/ADR-184-retain-bounded-latex-converter.md)                        | Implemented          | Retain the bounded LaTeX converter after a measured parser spike does not retire enough product policy.         |
| [ADR-183](./implemented/ADR-183-report-deployment-and-shell-diagnostics.md)               | Implemented          | Report Worker version metadata together with the browser-shell fingerprint in copyable diagnostics.             |
| [ADR-182](./implemented/ADR-182-retain-native-editor-after-codemirror-spike.md)           | Implemented          | Retain the native editor after a measured CodeMirror parity spike leaves cost and input-accessibility gaps.     |
| [ADR-181](./implemented/ADR-181-incubate-pdf-analysis-core.md)                            | Implemented          | Incubate normalized PDF highlight and reference mechanics behind one source-local core.                         |
| [ADR-180](./implemented/ADR-180-delegate-artifact-analysis-persistence.md)                | Implemented          | Delegate artifact-analysis persistence behind the stable Library Durable Object RPC facade.                     |
| [ADR-179](./implemented/ADR-179-decompose-reference-library-contracts.md)                 | Implemented          | Split reference-library contracts by capability behind a compatibility facade.                                  |
| [ADR-178](./implemented/ADR-178-queue-private-artifact-analysis.md)                       | Implemented          | Queue independent owner-private highlight and reference analysis for imported PDFs.                             |
| [ADR-177](./implemented/ADR-177-prevent-accidental-ipad-ui-zoom.md)                       | Superseded           | Prevent accidental iPad UI zoom; ADR-196 replaces its scalable-viewport policy.                                 |
| [ADR-176](./implemented/ADR-176-rebase-aggregate-mutation-threshold.md)                   | Implemented          | Rebase the aggregate mutation floor after delegating the heavily tested Markdown implementation.                |
| [ADR-175](./implemented/ADR-175-delegate-scientific-markdown-to-scholarmark.md)           | Implemented          | Delegate scientific Markdown and bounded BibTeX parsing to Scholarmark.                                         |
| [ADR-174](./implemented/ADR-174-report-dependency-costs-reproducibly.md)                  | Implemented          | Report production package and browser artifact costs through one read-only diagnostic.                          |
| [ADR-173](./implemented/ADR-173-share-bounded-external-response-reading.md)               | Implemented          | Share request-local bounded stream and JSON reading across external providers.                                  |
| [ADR-172](./implemented/ADR-172-use-lit-for-bounded-reactive-components.md)               | Implemented          | Use Lit for bounded reactive components while preserving existing application authorities.                      |
| [ADR-171](./implemented/ADR-171-delegate-github-app-signing.md)                           | Implemented          | Delegate App JWT signing while keeping installation exchange bounded and request-local.                         |
| [ADR-170](./implemented/ADR-170-use-valibot-at-trust-boundaries.md)                       | Implemented          | Use inferred Valibot schemas selectively at bounded trust boundaries.                                           |
| [ADR-169](./implemented/ADR-169-recognize-held-pdf-drawing-shapes.md)                     | Implemented          | Recognize bounded held freehand PDF markup as reviewed native shapes.                                           |
| [ADR-168](./implemented/ADR-168-instantiate-from-existing-projects.md)                    | Implemented          | Instantiate a new project directly from an authorized existing project's sanitized current structure.           |
| [ADR-156](./implemented/ADR-156-keep-bibtex-at-interoperability-boundaries.md)            | Implemented          | Remove BibTeX from ordinary project UI while preserving explicit import and export boundaries.                  |
| [ADR-155](./implemented/ADR-155-authorize-linked-pdfs-by-project-membership.md)           | Implemented          | Grant authenticated project members linked-reference PDF access while excluding public bearer links.            |
| [ADR-154](./implemented/ADR-154-refine-linked-pdf-reference-keys.md)                      | Implemented          | Keep PDF-origin keys refinable and propagate generated aliases without overwriting researcher choices.          |
| [ADR-153](./implemented/ADR-153-keep-build-week-media-capture-local.md)                   | Implemented          | Keep Build Week media capture manual, isolated, validated, and outside the template and CI baselines.           |
| [ADR-152](./implemented/ADR-152-use-a-capability-scoped-share-editor.md)                  | Implemented          | Reuse one editor shell for bearer links without widening server capabilities.                                   |
| [ADR-151](./implemented/ADR-151-model-reviews-as-independent-resources.md)                | Implemented          | Model reviews independently and connect them to projects through provenance-bearing many-to-many links.         |
| [ADR-150](./implemented/ADR-150-establish-task-oriented-browser-routes.md)                | Partially superseded | Establish task routes; ADR-151 replaces its transitional workspace-qualified review route.                      |
| [ADR-149](./implemented/ADR-149-reanchor-stale-comments-explicitly.md)                    | Implemented          | Reanchor stale manuscript comments only through explicit reviewed range replacement.                            |
| [ADR-148](./implemented/ADR-148-prefer-native-local-ci.md)                                | Implemented          | Run routine local readiness natively and reserve Agent CI containers for explicit parity checks.                |
| [ADR-147](./implemented/ADR-147-derive-review-outputs-from-evidence.md)                   | Implemented          | Derive review outputs and portable packages from pinned evidence.                                               |
| [ADR-146](./implemented/ADR-146-coordinate-project-review-studies.md)                     | Superseded           | Originally coordinated each review through one project; ADR-151 replaces that ownership boundary.               |
| [ADR-001](./implemented/ADR-001-use-architecture-decision-records.md)                     | Accepted             | Use ADRs to capture significant architectural decisions in this repo.                                           |
| [ADR-002](./implemented/ADR-002-make-architectural-decisions-explicit.md)                 | Accepted             | Require explicit ADR updates for lasting architectural decisions.                                               |
| [ADR-003](./implemented/ADR-003-require-spec-updates-and-high-coverage.md)                | Accepted             | Treat completed feature work as spec work and gate `src/` code on high unit coverage.                           |
| [ADR-004](./implemented/ADR-004-ship-a-worker-stub.md)                                    | Accepted             | Ship a minimal Worker stub so the template is runnable and testable.                                            |
| [ADR-005](./implemented/ADR-005-separate-worker-views-and-api.md)                         | Accepted             | Separate the Worker starter into `src/api` and `src/views` for easier evolution.                                |
| [ADR-006](./implemented/ADR-006-adopt-tailwind-for-starter-ui.md)                         | Accepted             | Adopt the thesis-journey-tracker Tailwind v4 pipeline for the starter Worker UI.                                |
| [ADR-007](./implemented/ADR-007-avoid-screenshot-tooling-in-the-template.md)              | Superseded           | Avoid screenshot capture and screenshot automation in the template baseline.                                    |
| [ADR-008](./implemented/ADR-008-allow-static-readme-screenshots-without-tooling.md)       | Superseded           | Allowed committed README screenshots without restoring screenshot tooling or automation.                        |
| [ADR-009](./implemented/ADR-009-split-fast-and-browser-verification.md)                   | Accepted             | Split fast and browser verification so checks can fail earlier and CI can cancel stale runs.                    |
| [ADR-010](./implemented/ADR-010-adopt-pnpm-for-package-management.md)                     | Superseded           | Use pnpm with a committed lockfile and Corepack-backed CI/local workflows instead of npm.                       |
| [ADR-011](./implemented/ADR-011-upgrade-runtime-baseline-to-node-24.md)                   | Accepted             | Move the template runtime baseline from Node 22 to Node 24 LTS.                                                 |
| [ADR-012](./implemented/ADR-012-constrain-local-tooling-to-macos.md)                      | Accepted             | Treat macOS as the local tooling baseline and use direct pinned Agent CI scripts.                               |
| [ADR-013](./implemented/ADR-013-return-to-npm-for-agent-ci-compatibility.md)              | Accepted             | Return to npm because local Agent CI remains unreliable with pnpm warmed dependency mounts.                     |
| [ADR-014](./implemented/ADR-014-run-the-fast-gate-on-pre-push.md)                         | Accepted             | Run the fast quality gate automatically before pushes to catch cheap failures locally.                          |
| [ADR-015](./implemented/ADR-015-relax-npm-version-enforcement.md)                         | Implemented          | Keep npm as the required package manager while relaxing exact npm patch enforcement.                            |
| [ADR-016](./implemented/ADR-016-allow-lightweight-local-readme-screenshot-tooling.md)     | Superseded           | Allowed a lightweight local script for refreshing the committed README screenshot.                              |
| [ADR-017](./implemented/ADR-017-prune-redundant-package-scripts.md)                       | Accepted             | Keep one canonical package script per normal workflow and remove redundant aliases.                             |
| [ADR-018](./implemented/ADR-018-add-capability-kits.md)                                   | Accepted             | Add lightweight capability kits for applying specific template practices to existing repos.                     |
| [ADR-019](./implemented/ADR-019-tighten-agent-workflow-guardrails.md)                     | Accepted             | Tighten TypeScript, write-target, and readiness-validation guardrails for agent work.                           |
| [ADR-020](./implemented/ADR-020-keep-readme-screenshot-refresh-manual.md)                 | Superseded           | Kept README screenshot refresh manual and outside the automated development loop.                               |
| [ADR-021](./implemented/ADR-021-add-accepted-adr-state.md)                                | Accepted             | Add an accepted ADR state so implemented means the decision is actually reflected in the repo.                  |
| [ADR-022](./implemented/ADR-022-add-mutation-testing-gate.md)                             | Accepted             | Add Stryker mutation testing to the full quality gate and CI workflow.                                          |
| [ADR-023](./implemented/ADR-023-pin-github-actions-to-commit-shas.md)                     | Accepted             | Pin GitHub Actions workflow action references to immutable commit SHAs.                                         |
| [ADR-024](./implemented/ADR-024-disallow-inline-client-code-in-worker-views.md)           | Implemented          | Reject untyped inline browser code in Worker-rendered HTML through the fast quality gate.                       |
| [ADR-025](./implemented/ADR-025-skip-agent-ci-for-docs-only-changes.md)                   | Implemented          | Allow documentation-only changes to skip local Agent CI when executable behavior is unchanged.                  |
| [ADR-026](./implemented/ADR-026-run-affected-guardrails-when-possible.md)                 | Implemented          | Run affected-file guardrails during iteration and pre-push when checks can be scoped safely.                    |
| [ADR-027](./implemented/ADR-027-lock-local-agent-ci-installs.md)                          | Superseded           | Allow parallel local Agent CI jobs with a locked warm dependency install.                                       |
| [ADR-028](./implemented/ADR-028-use-incremental-local-mutation-gate.md)                   | Implemented          | Use incremental Stryker runs in the local quality gate while GitHub CI runs full mutation.                      |
| [ADR-029](./implemented/ADR-029-use-relative-stryker-concurrency.md)                      | Implemented          | Use percentage-based Stryker worker concurrency instead of a fixed worker count.                                |
| [ADR-030](./implemented/ADR-030-reserve-full-mutation-ci-for-github.md)                   | Implemented          | Reserve the full mutation workflow job for GitHub and skip it in local Agent CI.                                |
| [ADR-031](./implemented/ADR-031-use-agent-ci-warm-cache-serialization.md)                 | Implemented          | Use Agent CI warm-cache serialization instead of a repo-local install lock.                                     |
| [ADR-032](./implemented/ADR-032-add-template-update-packs.md)                             | Implemented          | Add plain-file update packs for syncing reusable template maintenance downstream.                               |
| [ADR-033](./implemented/ADR-033-add-advisory-fallow-diagnostics.md)                       | Implemented          | Add advisory Fallow diagnostics for readability, health, duplication, and cleanup evidence.                     |
| [ADR-034](./implemented/ADR-034-adopt-typescript-7-typechecking.md)                       | Implemented          | Typecheck the project with the TypeScript 7 preview while preserving the current build compiler.                |
| [ADR-035](./implemented/ADR-035-keep-markdown-canonical.md)                               | Implemented          | Keep portable Markdown canonical and derive semantic, preview, and index representations.                       |
| [ADR-036](./implemented/ADR-036-model-scholarly-work-as-hypermedia.md)                    | Implemented          | Model writing and working-memory entities as stable, typed hypermedia resources.                                |
| [ADR-037](./implemented/ADR-037-synchronize-text-and-materialize-markdown.md)             | Implemented          | Synchronize text, ephemeral selections, durable comments, and recoverable Markdown.                             |
| [ADR-038](./implemented/ADR-038-store-pdf-annotations-separately.md)                      | Implemented          | Preserve PDFs and store annotations separately with geometric and textual selectors.                            |
| [ADR-039](./implemented/ADR-039-require-reviewable-model-operations.md)                   | Implemented          | Route local-capable model work through provenance-aware candidate review and apply.                             |
| [ADR-040](./implemented/ADR-040-use-durable-objects-and-r2-for-vertical-slice.md)         | Implemented          | Use Yjs and per-document Durable Objects for collaboration, with R2 for immutable PDFs.                         |
| [ADR-041](./implemented/ADR-041-render-pdfs-with-pdfjs.md)                                | Implemented          | Render one selectable PDF page with PDF.js and store normalized external highlight geometry.                    |
| [ADR-042](./implemented/ADR-042-use-per-owner-workspace-catalogs.md)                      | Partially superseded | Discover isolated document rooms through a separate SQLite catalog per owner identity.                          |
| [ADR-043](./implemented/ADR-043-use-cloudflare-access-and-memberships.md)                 | Implemented          | Verify Cloudflare Access JWTs and authorize document access through owner/member roles.                         |
| [ADR-044](./implemented/ADR-044-model-publications-separately-from-bibtex.md)             | Implemented          | Keep BibTeX canonical while materializing stable publications and explicit DOI enrichment.                      |
| [ADR-045](./implemented/ADR-045-use-satteri-for-scientific-markdown.md)                   | Superseded           | Previously parsed scientific Markdown with Satteri in an isolated browser WASM runtime.                         |
| [ADR-046](./implemented/ADR-046-derive-bounded-knowledge-navigation.md)                   | Partially superseded | Derive bounded search and typed navigation projections from authorized workspace state.                         |
| [ADR-047](./implemented/ADR-047-model-evidence-backed-claims.md)                          | Implemented          | Store claims and their evidence and manuscript usage as explicit typed resources.                               |
| [ADR-048](./implemented/ADR-048-secure-browser-collaboration-boundary.md)                 | Implemented          | Sanitize preview output and validate same-origin, bounded collaboration traffic.                                |
| [ADR-049](./implemented/ADR-049-acknowledge-server-led-yjs-synchronization.md)            | Implemented          | Synchronize from server state and acknowledge durable, idempotent Yjs updates.                                  |
| [ADR-050](./implemented/ADR-050-use-durable-manuscript-anchors.md)                        | Partially superseded | Resolve manuscript links through versioned Yjs positions; ADR-056 replaces its model-candidate scope.           |
| [ADR-051](./implemented/ADR-051-reconcile-bibtex-and-version-sqlite-migrations.md)        | Implemented          | Reconcile every canonical BibTeX change and version per-object SQLite evolution.                                |
| [ADR-052](./implemented/ADR-052-test-durable-objects-in-workers-runtime.md)               | Implemented          | Verify migrations, transactions, and eviction in an isolated real Workers runtime.                              |
| [ADR-053](./implemented/ADR-053-use-a-tabbed-research-context-pane.md)                    | Implemented          | Keep authoring beside a tabbed preview and resource-keyed research context.                                     |
| [ADR-054](./implemented/ADR-054-model-publication-pdf-associations-explicitly.md)         | Implemented          | Link publications and local PDF artifacts only through explicit durable relationships.                          |
| [ADR-055](./implemented/ADR-055-use-reviewed-doi-intake-for-pdfs.md)                      | Implemented          | Identify an imported PDF through reviewed, atomic, DOI-backed publication intake.                               |
| [ADR-056](./implemented/ADR-056-persist-grounded-passage-revisions.md)                    | Implemented          | Persist typed evidence and targeted replacements for grounded passage revisions.                                |
| [ADR-057](./implemented/ADR-057-compose-projects-from-main.md)                            | Partially superseded | Compose one project from root `main.md` through bounded, source-mapped transclusion.                            |
| [ADR-058](./implemented/ADR-058-use-a-shared-reference-library.md)                        | Implemented          | Make a user-scoped reference library authoritative and derive project bibliography snapshots.                   |
| [ADR-059](./implemented/ADR-059-separate-private-research-from-projects.md)               | Implemented          | Keep personal research private by default and share pinned snapshots into projects explicitly.                  |
| [ADR-060](./implemented/ADR-060-capture-versioned-web-sources.md)                         | Partially superseded | Preserve timestamped web-source snapshots for reproducible citations and evidence.                              |
| [ADR-061](./implemented/ADR-061-preserve-project-revisions-and-milestones.md)             | Implemented          | Keep atomic project revisions, immutable milestones, non-destructive restore, and diffs.                        |
| [ADR-062](./implemented/ADR-062-use-one-source-mapped-export-pipeline.md)                 | Implemented          | Derive publication targets and statistics from one pinned, source-mapped export intermediate.                   |
| [ADR-063](./implemented/ADR-063-model-citation-assertions-with-provenance.md)             | Implemented          | Represent library citation relationships as bounded provenance-bearing assertions.                              |
| [ADR-064](./implemented/ADR-064-model-editable-highlights-as-strokes.md)                  | Implemented          | Auto-save grouped PDF highlight strokes with additive painting, undo, erasing, and guarded deletion.            |
| [ADR-065](./implemented/ADR-065-render-project-publication-profiles.md)                   | Implemented          | Keep citation style and locale as versioned project rendering settings shared by preview and export.            |
| [ADR-066](./implemented/ADR-066-filter-private-reference-library-locally.md)              | Implemented          | Combine private research facets as an ephemeral local projection over the authorized library snapshot.          |
| [ADR-067](./implemented/ADR-067-adjust-highlight-strokes-nondestructively.md)             | Implemented          | Correct touch-selected quotation and normalized geometry without replacing evidence identity or source PDFs.    |
| [ADR-068](./implemented/ADR-068-use-bounded-submission-templates.md)                      | Implemented          | Resolve common submission targets to pinned safe layout presets shared by LaTeX and direct PDF exports.         |
| [ADR-069](./implemented/ADR-069-use-csl-json-and-bounded-library-archives.md)             | Implemented          | Exchange Zotero-compatible CSL JSON and bounded metadata-only private-library archives.                         |
| [ADR-070](./implemented/ADR-070-remove-the-readme-screenshot.md)                          | Partially superseded | Prefer no README screenshot; ADR-153 narrows its broader screenshot-tooling prohibition.                        |
| [ADR-071](./implemented/ADR-071-host-reference-library-in-context.md)                     | Implemented          | Keep the private reference library in a permanent Context tab instead of a modal.                               |
| [ADR-072](./implemented/ADR-072-report-local-ci-progress.md)                              | Implemented          | Format Agent CI events and heartbeat long-running local validation without changing workflow semantics.         |
| [ADR-073](./implemented/ADR-073-host-writing-assistant-in-context.md)                     | Implemented          | Keep Writing assistant in a permanent Context tab instead of a full-width drawer.                               |
| [ADR-074](./implemented/ADR-074-host-comments-in-left-rail.md)                            | Implemented          | Keep manuscript comments in a dedicated left-rail mode instead of the editor column.                            |
| [ADR-075](./implemented/ADR-075-host-derived-bibliography-in-files-rail.md)               | Implemented          | Keep derived project BibTeX as collapsed secondary context in the Files rail.                                   |
| [ADR-076](./implemented/ADR-076-assign-immutable-reference-keys.md)                       | Partially superseded | Assign memorable keys and create editable library drafts directly from PDF uploads.                             |
| [ADR-077](./implemented/ADR-077-layer-markdown-editor-highlighting.md)                    | Implemented          | Layer derived Markdown highlighting behind the native collaborative textarea.                                   |
| [ADR-078](./implemented/ADR-078-add-bounded-vim-textarea-keymap.md)                       | Implemented          | Add an opt-in bounded Vim keymap over the native collaborative textarea.                                        |
| [ADR-079](./implemented/ADR-079-review-bounded-pdf-metadata.md)                           | Partially superseded | Extract bounded PDF metadata as ephemeral browser suggestions and apply only explicitly reviewed fields.        |
| [ADR-080](./implemented/ADR-080-review-library-crossref-metadata.md)                      | Partially superseded | Preview and selectively accept refetched Crossref metadata for DOI-backed private-library records.              |
| [ADR-081](./implemented/ADR-081-read-private-library-pdfs-in-context.md)                  | Partially superseded | Open owner-private library PDFs in kind-qualified context tabs with local reading position.                     |
| [ADR-082](./implemented/ADR-082-capture-private-library-pdf-highlights.md)                | Implemented          | Capture explicit page-and-quote highlights while reading an owner-private library PDF.                          |
| [ADR-083](./implemented/ADR-083-finalize-provisional-reference-keys.md)                   | Implemented          | Improve private PDF keys until their first project link permanently finalizes them.                             |
| [ADR-084](./implemented/ADR-084-separate-source-capture-from-refinement.md)               | Implemented          | Keep initial PDF and website collection separate from later metadata refinement.                                |
| [ADR-085](./implemented/ADR-085-unify-reviewed-metadata-refinement.md)                    | Partially superseded | Unify local PDF hints, bounded provider matching, and selective acceptance in one refinement flow.              |
| [ADR-086](./implemented/ADR-086-coordinate-batch-pdf-intake-in-browser.md)                | Implemented          | Coordinate bounded sequential PDF intake and retry state in the browser.                                        |
| [ADR-087](./implemented/ADR-087-reconcile-exact-pdf-duplicates.md)                        | Implemented          | Resolve exact owner-library PDF repeats to their canonical source and remove redundant stored bytes.            |
| [ADR-088](./implemented/ADR-088-project-structured-publication-markdown.md)               | Implemented          | Project bounded tables and footnotes once for deterministic LaTeX and PDF publication exports.                  |
| [ADR-089](./implemented/ADR-089-require-a-fail-closed-production-release.md)              | Implemented          | Require production identity, hostname, dry-run, smoke, version, and rollback evidence.                          |
| [ADR-090](./implemented/ADR-090-combine-pitr-with-change-aware-r2-backups.md)             | Implemented          | Combine 30-day Durable Object PITR with change-aware logical and binary R2 backups.                             |
| [ADR-091](./implemented/ADR-091-use-system-aware-token-themes.md)                         | Implemented          | Use semantic light/dark tokens with a browser-local system-aware preference.                                    |
| [ADR-092](./implemented/ADR-092-prewarm-agent-ci-dependencies-explicitly.md)              | Implemented          | Prewarm dependencies once and give parallel local CI jobs isolated writable views.                              |
| [ADR-093](./implemented/ADR-093-scope-prettier-to-owned-files.md)                         | Implemented          | Keep duplicated and vendored skill references outside the Prettier ownership boundary.                          |
| [ADR-094](./implemented/ADR-094-cache-prettier-checks-by-content.md)                      | Implemented          | Cache successful Prettier checks by file content under ignored local state.                                     |
| [ADR-095](./implemented/ADR-095-decouple-public-share-locators.md)                        | Implemented          | Route public shares through opaque locators instead of requiring globally unique workspace ids.                 |
| [ADR-096](./implemented/ADR-096-recover-and-scope-share-links.md)                         | Partially superseded | Recover and scope share links through explicit project access boundaries.                                       |
| [ADR-097](./implemented/ADR-097-model-routine-rpc-failures-as-results.md)                 | Implemented          | Model routine Durable Object RPC failures as typed results instead of exceptions.                               |
| [ADR-098](./implemented/ADR-098-ignore-static-mutants-locally.md)                         | Implemented          | Ignore costly static mutants locally while retaining them in clean GitHub mutation runs.                        |
| [ADR-099](./implemented/ADR-099-persist-project-folders-and-atomic-tree-moves.md)         | Implemented          | Persist empty folders and move project subtrees with atomic include rewrites.                                   |
| [ADR-100](./implemented/ADR-100-order-reviewed-scholarly-metadata-providers.md)           | Partially superseded | Try reviewed OpenAlex discovery first and retain Crossref, DataCite, and Semantic Scholar coverage.             |
| [ADR-101](./implemented/ADR-101-split-browser-runtimes.md)                                | Partially superseded | Minify the app and lazy-load PDF.js; ADR-102 replaces its Satteri runtime decision.                             |
| [ADR-102](./implemented/ADR-102-use-javascript-for-live-markdown-preview.md)              | Implemented          | Replace Satteri WASM with a local unified/remark preview runtime.                                               |
| [ADR-103](./implemented/ADR-103-compose-metadata-from-several-providers.md)               | Implemented          | Choose each metadata field from one of several same-work providers and apply the review atomically.             |
| [ADR-104](./implemented/ADR-104-place-bibliographies-with-a-markdown-directive.md)        | Implemented          | Place derived bibliographies through a portable bounded Markdown directive.                                     |
| [ADR-105](./implemented/ADR-105-keep-pdf-markup-private-and-page-anchored.md)             | Implemented          | Keep PDF markup private, page-anchored, and separate from immutable source files.                               |
| [ADR-106](./implemented/ADR-106-persist-offline-manuscript-edits.md)                      | Implemented          | Persist offline manuscript edits locally until collaboration can reconcile them.                                |
| [ADR-107](./implemented/ADR-107-open-library-without-a-project.md)                        | Implemented          | Bootstrap the private Library at `/library` without opening or creating a project.                              |
| [ADR-108](./implemented/ADR-108-host-project-map-as-authoring-mode.md)                    | Implemented          | Move project search and graph navigation from Research into a peer authoring Map mode.                          |
| [ADR-109](./implemented/ADR-109-draft-reviewed-evidence-backed-claims.md)                 | Implemented          | Draft reviewable claims from selected annotation evidence through the local model boundary.                     |
| [ADR-110](./implemented/ADR-110-make-private-pdf-reading-routable-and-geometric.md)       | Implemented          | Make private PDF navigation routable and preserve geometric highlights and tablet gestures.                     |
| [ADR-111](./implemented/ADR-111-store-project-images-as-assets.md)                        | Partially superseded | Store bounded project images in R2 with durable paths, preview resolution, backups, and source export.          |
| [ADR-112](./implemented/ADR-112-store-sanitized-project-templates.md)                     | Implemented          | Store built-in and owner-created templates as independent sanitized project seeds.                              |
| [ADR-113](./implemented/ADR-113-follow-preview-file-selection.md)                         | Implemented          | Show the selected supporting Markdown file in isolation while preserving `main.md` publication.                 |
| [ADR-114](./implemented/ADR-114-accept-inert-svg-project-images.md)                       | Implemented          | Accept a constrained SVG subset and serve it with an image-specific sandbox boundary.                           |
| [ADR-115](./implemented/ADR-115-discover-and-constrain-local-models.md)                   | Implemented          | Discover live local models, expose reasoning effort, and constrain writing outputs with task schemas.           |
| [ADR-116](./implemented/ADR-116-project-reconstructible-ui-state-into-workspace-urls.md)  | Implemented          | Project reconstructible browser UI state into canonical workspace URLs.                                         |
| [ADR-117](./implemented/ADR-117-scope-dotenv-loading-to-the-model-companion.md)           | Implemented          | Scope dotenv loading to the loopback model companion and keep Worker secrets separate.                          |
| [ADR-118](./implemented/ADR-118-render-the-remembered-editor-target.md)                   | Implemented          | Keep the manuscript caret or selection visible after editor focus moves.                                        |
| [ADR-119](./implemented/ADR-119-model-writing-as-typed-contextual-operations.md)          | Implemented          | Define assistant capabilities and deterministic caret-based targets through one typed registry.                 |
| [ADR-120](./implemented/ADR-120-extend-private-pdf-annotations-in-place.md)               | Implemented          | Extend private PDF annotations in place while preserving stable evidence identity.                              |
| [ADR-121](./implemented/ADR-121-keep-the-editor-toolbar-to-one-row.md)                    | Implemented          | Keep frequent editor controls on one stable toolbar row.                                                        |
| [ADR-122](./implemented/ADR-122-separate-pdf-selection-from-creation.md)                  | Implemented          | Separate transient PDF selection from persisted annotation creation.                                            |
| [ADR-123](./implemented/ADR-123-centralize-browser-local-preferences.md)                  | Implemented          | Centralize browser-local preferences behind one typed settings authority.                                       |
| [ADR-124](./implemented/ADR-124-host-private-pdf-tools-in-the-left-rail.md)               | Implemented          | Keep private PDF tools in a left icon rail and reveal editing controls only in a transient inspector.           |
| [ADR-125](./implemented/ADR-125-turn-pdf-pages-with-trackpad-gestures.md)                 | Implemented          | Turn unzoomed PDF pages with bounded horizontal trackpad gestures while preserving scroll and pan.              |
| [ADR-126](./implemented/ADR-126-buffer-pdf-zoom-rendering.md)                             | Implemented          | Keep the committed PDF frame visible while debouncing and buffering zoom renders offscreen.                     |
| [ADR-127](./implemented/ADR-127-integrate-library-context-into-the-header.md)             | Implemented          | Integrate standalone Library tabs and PDF actions into the global header while retaining workspace locality.    |
| [ADR-128](./implemented/ADR-128-adopt-xstate-for-bounded-ui-workflows.md)                 | Implemented          | Use XState for bounded event-driven browser workflows rather than as a global application store.                |
| [ADR-129](./implemented/ADR-129-codify-a-thin-internal-design-system.md)                  | Implemented          | Codify foundations, primitives, state contracts, and typed icons without a component framework.                 |
| [ADR-130](./implemented/ADR-130-emit-quality-gate-progress.md)                            | Implemented          | Report full-gate phase transitions and heartbeats without changing its fail-fast sequence.                      |
| [ADR-131](./implemented/ADR-131-navigate-citations-by-page-locator.md)                    | Implemented          | Insert page locators from project PDFs and use them for unambiguous citation navigation.                        |
| [ADR-132](./implemented/ADR-132-synchronize-projects-with-github.md)                      | Implemented          | Manually synchronize bounded GitHub subtrees through previewed pulls and reviewed direct publishes.             |
| [ADR-133](./implemented/ADR-133-resolve-optional-project-entry-files.md)                  | Implemented          | Resolve an omitted project entry to `main.md` or the first Markdown path, then persist its identity.            |
| [ADR-134](./implemented/ADR-134-keep-mutation-explicit.md)                                | Implemented          | Keep mutation testing explicit locally while retaining the full GitHub mutation job.                            |
| [ADR-135](./implemented/ADR-135-add-inert-markdown-comment-blocks.md)                     | Implemented          | Preserve portable block comments while excluding them from every derived manuscript surface.                    |
| [ADR-136](./implemented/ADR-136-federate-library-reference-discovery.md)                  | Implemented          | Search several scholarly metadata providers and merge reviewable results without mutating the library.          |
| [ADR-137](./implemented/ADR-137-identify-discovered-works-across-providers.md)            | Implemented          | Reconcile federated discovery results through transitive scholarly identifiers before presenting them.          |
| [ADR-138](./implemented/ADR-138-accept-snowball-candidates-atomically.md)                 | Implemented          | Verify and atomically accept a backward-snowball candidate with its extracted citation assertion.               |
| [ADR-139](./implemented/ADR-139-map-preview-elements-through-composition-source-spans.md) | Implemented          | Map rendered Preview elements back through composition source spans without making DOM offsets authoritative.   |
| [ADR-140](./implemented/ADR-140-derive-phrasing-guidance-from-licensed-papers.md)         | Implemented          | Derive reviewed scholarly phrasing guidance from independently licensed paper corpora.                          |
| [ADR-141](./implemented/ADR-141-import-latex-as-reviewed-markdown.md)                     | Implemented          | Convert bounded LaTeX archives on the server into reviewed canonical Markdown projects.                         |
| [ADR-142](./implemented/ADR-142-preserve-tikz-until-isolated-rendering.md)                | Partially superseded | Preserve unsupported TikZ source until a separately approved isolated renderer exists.                          |
| [ADR-143](./implemented/ADR-143-fingerprint-browser-shell-assets.md)                      | Implemented          | Fingerprint immutable browser-shell assets and derive offline cache generations from emitted content.           |
| [ADR-145](./implemented/ADR-145-add-experimental-native-figures.md)                       | Implemented          | Add a bounded native figure syntax with deterministic sanitized preview rendering.                              |
| [ADR-157](./implemented/ADR-157-project-metadata-suggestions-into-the-editor.md)          | Implemented          | Project reviewed PDF and provider suggestions beneath the corresponding metadata inputs.                        |
| [ADR-158](./implemented/ADR-158-cache-metadata-previews-in-library-memory.md)             | Implemented          | Reuse bounded metadata previews briefly in owner-scoped server memory while preserving acceptance refetch.      |
| [ADR-159](./implemented/ADR-159-render-pdf-links-in-the-active-page.md)                   | Implemented          | Render standard PDF links without adopting the complete PDF.js viewer application.                              |
| [ADR-160](./implemented/ADR-160-resize-the-desktop-project-rail.md)                       | Implemented          | Persist bounded desktop project-rail resizing without disturbing tablet layout ownership.                       |
| [ADR-161](./implemented/ADR-161-filter-and-quick-open-project-files.md)                   | Implemented          | Filter and quick-open project files through bounded browser-local navigation state.                             |
| [ADR-162](./implemented/ADR-162-run-deep-quality-checks-before-push.md)                   | Implemented          | Run affected Fallow and targeted mutation checks before pushes without expanding routine local CI.              |
| [ADR-163](./implemented/ADR-163-separate-review-export-formatters.md)                     | Implemented          | Separate review export formats behind a stable facade and one revision-pinned authority.                        |
| [ADR-164](./implemented/ADR-164-separate-owner-backup-contracts.md)                       | Implemented          | Separate owner-backup schemas, deterministic projection, and compatibility validation behind one facade.        |
| [ADR-165](./implemented/ADR-165-separate-github-integration-phases.md)                    | Implemented          | Separate GitHub import, workspace synchronization, and shared transport/error contracts.                        |
| [ADR-166](./implemented/ADR-166-separate-browser-binders-from-mutation-contracts.md)      | Implemented          | Keep pure browser-feature contracts in mutation scope while Playwright covers runtime binders.                  |
| [ADR-167](./implemented/ADR-167-turn-zoomed-pdf-pages-at-horizontal-edges.md)             | Implemented          | Turn zoomed PDF pages from their horizontal edges while preserving interior panning.                            |
| [ADR-192](./implemented/ADR-192-bulk-accept-snowball-candidates.md)                       | Implemented          | Accept a bounded reviewed citation-expansion batch in one owner-library transaction.                            |
| [ADR-193](./implemented/ADR-193-persist-citation-research-queue.md)                       | Implemented          | Persist a bounded explore-next queue with citation seed and direction provenance.                               |
| [ADR-194](./implemented/ADR-194-report-live-citation-provider-coverage.md)                | Implemented          | Report live advisory citation-provider coverage through production bounded adapters.                            |
| [ADR-195](./implemented/ADR-195-resolve-open-access-pdfs.md)                              | Implemented          | Resolve and explicitly import open-access PDFs without accepting arbitrary browser URLs.                        |
| [ADR-196](./implemented/ADR-196-lock-ipad-viewport-and-align-editor-layers.md)            | Implemented          | Lock browser viewport zoom and keep layered editor typography aligned on coarse-pointer Safari.                 |

## Creating A New ADR

1. Read the ASDLC guidance in [`.asdlc/practices/adr-authoring.md`](../../.asdlc/practices/adr-authoring.md).
2. Copy [`ADR-000-template.md`](./proposed/ADR-000-template.md).
3. Rename it using the next sequential ID: `proposed/ADR-NNN-short-title.md`.
4. Fill in context, decision, consequences, and alternatives.
5. When the ADR is accepted but implementation is still pending, move it to `accepted/`.
6. Move an ADR to `implemented/` only after the repository actually implements the decision.
7. If the change supersedes an earlier ADR, update the old ADR status to point at the new one.
8. Update the ADR table in this file.

## Search Tips

```bash
rg "Status:" docs/adrs
rg "Superseded by" docs/adrs
rg "database|auth|deploy" docs/adrs
```
