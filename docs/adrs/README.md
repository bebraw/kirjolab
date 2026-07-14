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

| ADR                                                                           | Status      | Summary                                                                                         |
| ----------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------- |
| [ADR-089](./implemented/ADR-089-require-a-fail-closed-production-release.md)  | Implemented | Require production identity, hostname, dry-run, smoke, version, and rollback evidence.          |
| [ADR-090](./implemented/ADR-090-combine-pitr-with-change-aware-r2-backups.md) | Implemented | Combine 30-day Durable Object PITR with change-aware logical and binary R2 backups.             |
| [ADR-091](./implemented/ADR-091-use-system-aware-token-themes.md)             | Implemented | Use semantic light/dark tokens with a browser-local system-aware preference.                    |
| [ADR-092](./implemented/ADR-092-prewarm-agent-ci-dependencies-explicitly.md)  | Implemented | Prewarm dependencies once and give parallel local CI jobs isolated writable views.              |
| [ADR-093](./implemented/ADR-093-scope-prettier-to-owned-files.md)             | Implemented | Keep duplicated and vendored skill references outside the Prettier ownership boundary.          |
| [ADR-094](./implemented/ADR-094-cache-prettier-checks-by-content.md)          | Implemented | Cache successful Prettier checks by file content under ignored local state.                     |
| [ADR-095](./implemented/ADR-095-decouple-public-share-locators.md)            | Implemented | Route public shares through opaque locators instead of requiring globally unique workspace ids. |

## Implemented ADRs

| ADR                                                                                   | Status               | Summary                                                                                                      |
| ------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------ |
| [ADR-001](./implemented/ADR-001-use-architecture-decision-records.md)                 | Accepted             | Use ADRs to capture significant architectural decisions in this repo.                                        |
| [ADR-002](./implemented/ADR-002-make-architectural-decisions-explicit.md)             | Accepted             | Require explicit ADR updates for lasting architectural decisions.                                            |
| [ADR-003](./implemented/ADR-003-require-spec-updates-and-high-coverage.md)            | Accepted             | Treat completed feature work as spec work and gate `src/` code on high unit coverage.                        |
| [ADR-004](./implemented/ADR-004-ship-a-worker-stub.md)                                | Accepted             | Ship a minimal Worker stub so the template is runnable and testable.                                         |
| [ADR-005](./implemented/ADR-005-separate-worker-views-and-api.md)                     | Accepted             | Separate the Worker starter into `src/api` and `src/views` for easier evolution.                             |
| [ADR-006](./implemented/ADR-006-adopt-tailwind-for-starter-ui.md)                     | Accepted             | Adopt the thesis-journey-tracker Tailwind v4 pipeline for the starter Worker UI.                             |
| [ADR-007](./implemented/ADR-007-avoid-screenshot-tooling-in-the-template.md)          | Superseded           | Avoid screenshot capture and screenshot automation in the template baseline.                                 |
| [ADR-008](./implemented/ADR-008-allow-static-readme-screenshots-without-tooling.md)   | Superseded           | Allowed committed README screenshots without restoring screenshot tooling or automation.                     |
| [ADR-009](./implemented/ADR-009-split-fast-and-browser-verification.md)               | Accepted             | Split fast and browser verification so checks can fail earlier and CI can cancel stale runs.                 |
| [ADR-010](./implemented/ADR-010-adopt-pnpm-for-package-management.md)                 | Superseded           | Use pnpm with a committed lockfile and Corepack-backed CI/local workflows instead of npm.                    |
| [ADR-011](./implemented/ADR-011-upgrade-runtime-baseline-to-node-24.md)               | Accepted             | Move the template runtime baseline from Node 22 to Node 24 LTS.                                              |
| [ADR-012](./implemented/ADR-012-constrain-local-tooling-to-macos.md)                  | Accepted             | Treat macOS as the local tooling baseline and use direct pinned Agent CI scripts.                            |
| [ADR-013](./implemented/ADR-013-return-to-npm-for-agent-ci-compatibility.md)          | Accepted             | Return to npm because local Agent CI remains unreliable with pnpm warmed dependency mounts.                  |
| [ADR-014](./implemented/ADR-014-run-the-fast-gate-on-pre-push.md)                     | Accepted             | Run the fast quality gate automatically before pushes to catch cheap failures locally.                       |
| [ADR-015](./implemented/ADR-015-relax-npm-version-enforcement.md)                     | Accepted             | Keep npm as the required package manager while relaxing exact npm patch enforcement.                         |
| [ADR-016](./implemented/ADR-016-allow-lightweight-local-readme-screenshot-tooling.md) | Superseded           | Allowed a lightweight local script for refreshing the committed README screenshot.                           |
| [ADR-017](./implemented/ADR-017-prune-redundant-package-scripts.md)                   | Accepted             | Keep one canonical package script per normal workflow and remove redundant aliases.                          |
| [ADR-018](./implemented/ADR-018-add-capability-kits.md)                               | Accepted             | Add lightweight capability kits for applying specific template practices to existing repos.                  |
| [ADR-019](./implemented/ADR-019-tighten-agent-workflow-guardrails.md)                 | Accepted             | Tighten TypeScript, write-target, and readiness-validation guardrails for agent work.                        |
| [ADR-020](./implemented/ADR-020-keep-readme-screenshot-refresh-manual.md)             | Superseded           | Kept README screenshot refresh manual and outside the automated development loop.                            |
| [ADR-021](./implemented/ADR-021-add-accepted-adr-state.md)                            | Accepted             | Add an accepted ADR state so implemented means the decision is actually reflected in the repo.               |
| [ADR-022](./implemented/ADR-022-add-mutation-testing-gate.md)                         | Accepted             | Add Stryker mutation testing to the full quality gate and CI workflow.                                       |
| [ADR-023](./implemented/ADR-023-pin-github-actions-to-commit-shas.md)                 | Accepted             | Pin GitHub Actions workflow action references to immutable commit SHAs.                                      |
| [ADR-024](./implemented/ADR-024-disallow-inline-client-code-in-worker-views.md)       | Implemented          | Reject untyped inline browser code in Worker-rendered HTML through the fast quality gate.                    |
| [ADR-025](./implemented/ADR-025-skip-agent-ci-for-docs-only-changes.md)               | Implemented          | Allow documentation-only changes to skip local Agent CI when executable behavior is unchanged.               |
| [ADR-026](./implemented/ADR-026-run-affected-guardrails-when-possible.md)             | Implemented          | Run affected-file guardrails during iteration and pre-push when checks can be scoped safely.                 |
| [ADR-027](./implemented/ADR-027-lock-local-agent-ci-installs.md)                      | Superseded           | Allow parallel local Agent CI jobs with a locked warm dependency install.                                    |
| [ADR-028](./implemented/ADR-028-use-incremental-local-mutation-gate.md)               | Implemented          | Use incremental Stryker runs in the local quality gate while GitHub CI runs full mutation.                   |
| [ADR-029](./implemented/ADR-029-use-relative-stryker-concurrency.md)                  | Implemented          | Use percentage-based Stryker worker concurrency instead of a fixed worker count.                             |
| [ADR-030](./implemented/ADR-030-reserve-full-mutation-ci-for-github.md)               | Implemented          | Reserve the full mutation workflow job for GitHub and skip it in local Agent CI.                             |
| [ADR-031](./implemented/ADR-031-use-agent-ci-warm-cache-serialization.md)             | Implemented          | Use Agent CI warm-cache serialization instead of a repo-local install lock.                                  |
| [ADR-032](./implemented/ADR-032-add-template-update-packs.md)                         | Implemented          | Add plain-file update packs for syncing reusable template maintenance downstream.                            |
| [ADR-033](./implemented/ADR-033-add-advisory-fallow-diagnostics.md)                   | Implemented          | Add advisory Fallow diagnostics for readability, health, duplication, and cleanup evidence.                  |
| [ADR-034](./implemented/ADR-034-adopt-typescript-7-typechecking.md)                   | Implemented          | Typecheck the project with the TypeScript 7 preview while preserving the current build compiler.             |
| [ADR-035](./implemented/ADR-035-keep-markdown-canonical.md)                           | Implemented          | Keep portable Markdown canonical and derive semantic, preview, and index representations.                    |
| [ADR-036](./implemented/ADR-036-model-scholarly-work-as-hypermedia.md)                | Implemented          | Model writing and working-memory entities as stable, typed hypermedia resources.                             |
| [ADR-037](./implemented/ADR-037-synchronize-text-and-materialize-markdown.md)         | Implemented          | Synchronize text, ephemeral selections, durable comments, and recoverable Markdown.                          |
| [ADR-038](./implemented/ADR-038-store-pdf-annotations-separately.md)                  | Implemented          | Preserve PDFs and store annotations separately with geometric and textual selectors.                         |
| [ADR-039](./implemented/ADR-039-require-reviewable-model-operations.md)               | Implemented          | Route local-capable model work through provenance-aware candidate review and apply.                          |
| [ADR-040](./implemented/ADR-040-use-durable-objects-and-r2-for-vertical-slice.md)     | Implemented          | Use Yjs and per-document Durable Objects for collaboration, with R2 for immutable PDFs.                      |
| [ADR-041](./implemented/ADR-041-render-pdfs-with-pdfjs.md)                            | Implemented          | Render one selectable PDF page with PDF.js and store normalized external highlight geometry.                 |
| [ADR-042](./implemented/ADR-042-use-per-owner-workspace-catalogs.md)                  | Implemented          | Discover isolated document rooms through a separate SQLite catalog per owner identity.                       |
| [ADR-043](./implemented/ADR-043-use-cloudflare-access-and-memberships.md)             | Implemented          | Verify Cloudflare Access JWTs and authorize document access through owner/member roles.                      |
| [ADR-044](./implemented/ADR-044-model-publications-separately-from-bibtex.md)         | Implemented          | Keep BibTeX canonical while materializing stable publications and explicit DOI enrichment.                   |
| [ADR-045](./implemented/ADR-045-use-satteri-for-scientific-markdown.md)               | Superseded           | Previously parsed scientific Markdown with Satteri in an isolated browser WASM runtime.                      |
| [ADR-046](./implemented/ADR-046-derive-bounded-knowledge-navigation.md)               | Implemented          | Derive bounded search and typed navigation projections from authorized workspace state.                      |
| [ADR-047](./implemented/ADR-047-model-evidence-backed-claims.md)                      | Implemented          | Store claims and their evidence and manuscript usage as explicit typed resources.                            |
| [ADR-048](./implemented/ADR-048-secure-browser-collaboration-boundary.md)             | Implemented          | Sanitize preview output and validate same-origin, bounded collaboration traffic.                             |
| [ADR-049](./implemented/ADR-049-acknowledge-server-led-yjs-synchronization.md)        | Implemented          | Synchronize from server state and acknowledge durable, idempotent Yjs updates.                               |
| [ADR-050](./implemented/ADR-050-use-durable-manuscript-anchors.md)                    | Partially superseded | Resolve manuscript links through versioned Yjs positions; ADR-056 replaces its model-candidate scope.        |
| [ADR-051](./implemented/ADR-051-reconcile-bibtex-and-version-sqlite-migrations.md)    | Implemented          | Reconcile every canonical BibTeX change and version per-object SQLite evolution.                             |
| [ADR-052](./implemented/ADR-052-test-durable-objects-in-workers-runtime.md)           | Implemented          | Verify migrations, transactions, and eviction in an isolated real Workers runtime.                           |
| [ADR-053](./implemented/ADR-053-use-a-tabbed-research-context-pane.md)                | Implemented          | Keep authoring beside a tabbed preview and resource-keyed research context.                                  |
| [ADR-054](./implemented/ADR-054-model-publication-pdf-associations-explicitly.md)     | Implemented          | Link publications and local PDF artifacts only through explicit durable relationships.                       |
| [ADR-055](./implemented/ADR-055-use-reviewed-doi-intake-for-pdfs.md)                  | Implemented          | Identify an imported PDF through reviewed, atomic, DOI-backed publication intake.                            |
| [ADR-056](./implemented/ADR-056-persist-grounded-passage-revisions.md)                | Implemented          | Persist typed evidence and targeted replacements for grounded passage revisions.                             |
| [ADR-057](./implemented/ADR-057-compose-projects-from-main.md)                        | Implemented          | Compose one project from root `main.md` through bounded, source-mapped transclusion.                         |
| [ADR-058](./implemented/ADR-058-use-a-shared-reference-library.md)                    | Implemented          | Make a user-scoped reference library authoritative and derive project bibliography snapshots.                |
| [ADR-059](./implemented/ADR-059-separate-private-research-from-projects.md)           | Implemented          | Keep personal research private by default and share pinned snapshots into projects explicitly.               |
| [ADR-060](./implemented/ADR-060-capture-versioned-web-sources.md)                     | Partially superseded | Preserve timestamped web-source snapshots for reproducible citations and evidence.                           |
| [ADR-061](./implemented/ADR-061-preserve-project-revisions-and-milestones.md)         | Implemented          | Keep atomic project revisions, immutable milestones, non-destructive restore, and diffs.                     |
| [ADR-062](./implemented/ADR-062-use-one-source-mapped-export-pipeline.md)             | Implemented          | Derive publication targets and statistics from one pinned, source-mapped export intermediate.                |
| [ADR-063](./implemented/ADR-063-model-citation-assertions-with-provenance.md)         | Implemented          | Represent library citation relationships as bounded provenance-bearing assertions.                           |
| [ADR-064](./implemented/ADR-064-model-editable-highlights-as-strokes.md)              | Implemented          | Auto-save grouped PDF highlight strokes with additive painting, undo, erasing, and guarded deletion.         |
| [ADR-065](./implemented/ADR-065-render-project-publication-profiles.md)               | Implemented          | Keep citation style and locale as versioned project rendering settings shared by preview and export.         |
| [ADR-066](./implemented/ADR-066-filter-private-reference-library-locally.md)          | Implemented          | Combine private research facets as an ephemeral local projection over the authorized library snapshot.       |
| [ADR-067](./implemented/ADR-067-adjust-highlight-strokes-nondestructively.md)         | Implemented          | Correct touch-selected quotation and normalized geometry without replacing evidence identity or source PDFs. |
| [ADR-068](./implemented/ADR-068-use-bounded-submission-templates.md)                  | Implemented          | Resolve common submission targets to pinned safe layout presets shared by LaTeX and direct PDF exports.      |
| [ADR-069](./implemented/ADR-069-use-csl-json-and-bounded-library-archives.md)         | Implemented          | Exchange Zotero-compatible CSL JSON and bounded metadata-only private-library archives.                      |
| [ADR-070](./implemented/ADR-070-remove-the-readme-screenshot.md)                      | Implemented          | Prefer no README screenshot over a stale representation of the application.                                  |
| [ADR-071](./implemented/ADR-071-host-reference-library-in-context.md)                 | Implemented          | Keep the private reference library in a permanent Context tab instead of a modal.                            |
| [ADR-072](./implemented/ADR-072-report-local-ci-progress.md)                          | Implemented          | Format Agent CI events and heartbeat long-running local validation without changing workflow semantics.      |
| [ADR-073](./implemented/ADR-073-host-writing-assistant-in-context.md)                 | Implemented          | Keep Writing assistant in a permanent Context tab instead of a full-width drawer.                            |
| [ADR-074](./implemented/ADR-074-host-comments-in-left-rail.md)                        | Implemented          | Keep manuscript comments in a dedicated left-rail mode instead of the editor column.                         |
| [ADR-075](./implemented/ADR-075-host-derived-bibliography-in-files-rail.md)           | Implemented          | Keep derived project BibTeX as collapsed secondary context in the Files rail.                                |
| [ADR-076](./implemented/ADR-076-assign-immutable-reference-keys.md)                   | Partially superseded | Assign memorable keys and create editable library drafts directly from PDF uploads.                          |
| [ADR-077](./implemented/ADR-077-layer-markdown-editor-highlighting.md)                | Implemented          | Layer derived Markdown highlighting behind the native collaborative textarea.                                |
| [ADR-078](./implemented/ADR-078-add-bounded-vim-textarea-keymap.md)                   | Implemented          | Add an opt-in bounded Vim keymap over the native collaborative textarea.                                     |
| [ADR-079](./implemented/ADR-079-review-bounded-pdf-metadata.md)                       | Partially superseded | Extract bounded PDF metadata as ephemeral browser suggestions and apply only explicitly reviewed fields.     |
| [ADR-080](./implemented/ADR-080-review-library-crossref-metadata.md)                  | Partially superseded | Preview and selectively accept refetched Crossref metadata for DOI-backed private-library records.           |
| [ADR-081](./implemented/ADR-081-read-private-library-pdfs-in-context.md)              | Partially superseded | Open owner-private library PDFs in kind-qualified context tabs with local reading position.                  |
| [ADR-082](./implemented/ADR-082-capture-private-library-pdf-highlights.md)            | Implemented          | Capture explicit page-and-quote highlights while reading an owner-private library PDF.                       |
| [ADR-083](./implemented/ADR-083-finalize-provisional-reference-keys.md)               | Implemented          | Improve private PDF keys until their first project link permanently finalizes them.                          |
| [ADR-084](./implemented/ADR-084-separate-source-capture-from-refinement.md)           | Implemented          | Keep initial PDF and website collection separate from later metadata refinement.                             |
| [ADR-085](./implemented/ADR-085-unify-reviewed-metadata-refinement.md)                | Partially superseded | Unify local PDF hints, bounded provider matching, and selective acceptance in one refinement flow.           |
| [ADR-086](./implemented/ADR-086-coordinate-batch-pdf-intake-in-browser.md)            | Implemented          | Coordinate bounded sequential PDF intake and retry state in the browser.                                     |
| [ADR-087](./implemented/ADR-087-reconcile-exact-pdf-duplicates.md)                    | Implemented          | Resolve exact owner-library PDF repeats to their canonical source and remove redundant stored bytes.         |
| [ADR-088](./implemented/ADR-088-project-structured-publication-markdown.md)           | Implemented          | Project bounded tables and footnotes once for deterministic LaTeX and PDF publication exports.               |
| [ADR-098](./implemented/ADR-098-ignore-static-mutants-locally.md)                     | Implemented          | Ignore costly static mutants locally while retaining them in clean GitHub mutation runs.                     |
| [ADR-099](./implemented/ADR-099-persist-project-folders-and-atomic-tree-moves.md)     | Implemented          | Persist empty folders and move project subtrees with atomic include rewrites.                                |
| [ADR-100](./implemented/ADR-100-order-reviewed-scholarly-metadata-providers.md)       | Partially superseded | Try reviewed OpenAlex discovery first and retain Crossref, DataCite, and Semantic Scholar coverage.          |
| [ADR-101](./implemented/ADR-101-split-browser-runtimes.md)                            | Partially superseded | Minify the app and lazy-load PDF.js; ADR-102 replaces its Satteri runtime decision.                          |
| [ADR-102](./implemented/ADR-102-use-javascript-for-live-markdown-preview.md)          | Implemented          | Replace Satteri WASM with a local unified/remark preview runtime.                                            |
| [ADR-103](./implemented/ADR-103-compose-metadata-from-several-providers.md)           | Implemented          | Choose each metadata field from one of several same-work providers and apply the review atomically.          |

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
