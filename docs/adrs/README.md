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

| ADR                                                                  | Status   | Summary                                                                             |
| -------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------- |
| [ADR-039](./accepted/ADR-039-require-reviewable-model-operations.md) | Accepted | Route local-capable model work through provenance-aware candidate review and apply. |

## Implemented ADRs

| ADR                                                                                   | Status               | Summary                                                                                               |
| ------------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------- |
| [ADR-001](./implemented/ADR-001-use-architecture-decision-records.md)                 | Accepted             | Use ADRs to capture significant architectural decisions in this repo.                                 |
| [ADR-002](./implemented/ADR-002-make-architectural-decisions-explicit.md)             | Accepted             | Require explicit ADR updates for lasting architectural decisions.                                     |
| [ADR-003](./implemented/ADR-003-require-spec-updates-and-high-coverage.md)            | Accepted             | Treat completed feature work as spec work and gate `src/` code on high unit coverage.                 |
| [ADR-004](./implemented/ADR-004-ship-a-worker-stub.md)                                | Accepted             | Ship a minimal Worker stub so the template is runnable and testable.                                  |
| [ADR-005](./implemented/ADR-005-separate-worker-views-and-api.md)                     | Accepted             | Separate the Worker starter into `src/api` and `src/views` for easier evolution.                      |
| [ADR-006](./implemented/ADR-006-adopt-tailwind-for-starter-ui.md)                     | Accepted             | Adopt the thesis-journey-tracker Tailwind v4 pipeline for the starter Worker UI.                      |
| [ADR-007](./implemented/ADR-007-avoid-screenshot-tooling-in-the-template.md)          | Superseded           | Avoid screenshot capture and screenshot automation in the template baseline.                          |
| [ADR-008](./implemented/ADR-008-allow-static-readme-screenshots-without-tooling.md)   | Superseded           | Allowed committed README screenshots without restoring screenshot tooling or automation.              |
| [ADR-009](./implemented/ADR-009-split-fast-and-browser-verification.md)               | Accepted             | Split fast and browser verification so checks can fail earlier and CI can cancel stale runs.          |
| [ADR-010](./implemented/ADR-010-adopt-pnpm-for-package-management.md)                 | Superseded           | Use pnpm with a committed lockfile and Corepack-backed CI/local workflows instead of npm.             |
| [ADR-011](./implemented/ADR-011-upgrade-runtime-baseline-to-node-24.md)               | Accepted             | Move the template runtime baseline from Node 22 to Node 24 LTS.                                       |
| [ADR-012](./implemented/ADR-012-constrain-local-tooling-to-macos.md)                  | Accepted             | Treat macOS as the local tooling baseline and use direct pinned Agent CI scripts.                     |
| [ADR-013](./implemented/ADR-013-return-to-npm-for-agent-ci-compatibility.md)          | Accepted             | Return to npm because local Agent CI remains unreliable with pnpm warmed dependency mounts.           |
| [ADR-014](./implemented/ADR-014-run-the-fast-gate-on-pre-push.md)                     | Accepted             | Run the fast quality gate automatically before pushes to catch cheap failures locally.                |
| [ADR-015](./implemented/ADR-015-relax-npm-version-enforcement.md)                     | Accepted             | Keep npm as the required package manager while relaxing exact npm patch enforcement.                  |
| [ADR-016](./implemented/ADR-016-allow-lightweight-local-readme-screenshot-tooling.md) | Superseded           | Allowed a lightweight local script for refreshing the committed README screenshot.                    |
| [ADR-017](./implemented/ADR-017-prune-redundant-package-scripts.md)                   | Accepted             | Keep one canonical package script per normal workflow and remove redundant aliases.                   |
| [ADR-018](./implemented/ADR-018-add-capability-kits.md)                               | Accepted             | Add lightweight capability kits for applying specific template practices to existing repos.           |
| [ADR-019](./implemented/ADR-019-tighten-agent-workflow-guardrails.md)                 | Accepted             | Tighten TypeScript, write-target, and readiness-validation guardrails for agent work.                 |
| [ADR-020](./implemented/ADR-020-keep-readme-screenshot-refresh-manual.md)             | Accepted             | Keep README screenshot refresh manual and outside the automated development loop.                     |
| [ADR-021](./implemented/ADR-021-add-accepted-adr-state.md)                            | Accepted             | Add an accepted ADR state so implemented means the decision is actually reflected in the repo.        |
| [ADR-022](./implemented/ADR-022-add-mutation-testing-gate.md)                         | Accepted             | Add Stryker mutation testing to the full quality gate and CI workflow.                                |
| [ADR-023](./implemented/ADR-023-pin-github-actions-to-commit-shas.md)                 | Accepted             | Pin GitHub Actions workflow action references to immutable commit SHAs.                               |
| [ADR-024](./implemented/ADR-024-disallow-inline-client-code-in-worker-views.md)       | Implemented          | Reject untyped inline browser code in Worker-rendered HTML through the fast quality gate.             |
| [ADR-025](./implemented/ADR-025-skip-agent-ci-for-docs-only-changes.md)               | Implemented          | Allow documentation-only changes to skip local Agent CI when executable behavior is unchanged.        |
| [ADR-026](./implemented/ADR-026-run-affected-guardrails-when-possible.md)             | Implemented          | Run affected-file guardrails during iteration and pre-push when checks can be scoped safely.          |
| [ADR-027](./implemented/ADR-027-lock-local-agent-ci-installs.md)                      | Superseded           | Allow parallel local Agent CI jobs with a locked warm dependency install.                             |
| [ADR-028](./implemented/ADR-028-use-incremental-local-mutation-gate.md)               | Implemented          | Use incremental Stryker runs in the local quality gate while GitHub CI runs full mutation.            |
| [ADR-029](./implemented/ADR-029-use-relative-stryker-concurrency.md)                  | Implemented          | Use percentage-based Stryker worker concurrency instead of a fixed worker count.                      |
| [ADR-030](./implemented/ADR-030-reserve-full-mutation-ci-for-github.md)               | Implemented          | Reserve the full mutation workflow job for GitHub and skip it in local Agent CI.                      |
| [ADR-031](./implemented/ADR-031-use-agent-ci-warm-cache-serialization.md)             | Implemented          | Use Agent CI warm-cache serialization instead of a repo-local install lock.                           |
| [ADR-032](./implemented/ADR-032-add-template-update-packs.md)                         | Implemented          | Add plain-file update packs for syncing reusable template maintenance downstream.                     |
| [ADR-033](./implemented/ADR-033-add-advisory-fallow-diagnostics.md)                   | Implemented          | Add advisory Fallow diagnostics for readability, health, duplication, and cleanup evidence.           |
| [ADR-034](./implemented/ADR-034-adopt-typescript-7-typechecking.md)                   | Implemented          | Typecheck the project with the TypeScript 7 preview while preserving the current build compiler.      |
| [ADR-035](./implemented/ADR-035-keep-markdown-canonical.md)                           | Implemented          | Keep portable Markdown canonical and derive semantic, preview, and index representations.             |
| [ADR-036](./implemented/ADR-036-model-scholarly-work-as-hypermedia.md)                | Implemented          | Model writing and working-memory entities as stable, typed hypermedia resources.                      |
| [ADR-037](./implemented/ADR-037-synchronize-text-and-materialize-markdown.md)         | Implemented          | Synchronize text, ephemeral selections, durable comments, and recoverable Markdown.                   |
| [ADR-038](./implemented/ADR-038-store-pdf-annotations-separately.md)                  | Implemented          | Preserve PDFs and store annotations separately with geometric and textual selectors.                  |
| [ADR-040](./implemented/ADR-040-use-durable-objects-and-r2-for-vertical-slice.md)     | Implemented          | Use Yjs and per-document Durable Objects for collaboration, with R2 for immutable PDFs.               |
| [ADR-041](./implemented/ADR-041-render-pdfs-with-pdfjs.md)                            | Implemented          | Render one selectable PDF page with PDF.js and store normalized external highlight geometry.          |
| [ADR-042](./implemented/ADR-042-use-per-owner-workspace-catalogs.md)                  | Implemented          | Discover isolated document rooms through a separate SQLite catalog per owner identity.                |
| [ADR-043](./implemented/ADR-043-use-cloudflare-access-and-memberships.md)             | Implemented          | Verify Cloudflare Access JWTs and authorize document access through owner/member roles.               |
| [ADR-044](./implemented/ADR-044-model-publications-separately-from-bibtex.md)         | Implemented          | Keep BibTeX canonical while materializing stable publications and explicit DOI enrichment.            |
| [ADR-045](./implemented/ADR-045-use-satteri-for-scientific-markdown.md)               | Implemented          | Parse scientific Markdown with Satteri in an isolated browser WASM runtime.                           |
| [ADR-046](./implemented/ADR-046-derive-bounded-knowledge-navigation.md)               | Implemented          | Derive bounded search and typed navigation projections from authorized workspace state.               |
| [ADR-047](./implemented/ADR-047-model-evidence-backed-claims.md)                      | Implemented          | Store claims and their evidence and manuscript usage as explicit typed resources.                     |
| [ADR-048](./implemented/ADR-048-secure-browser-collaboration-boundary.md)             | Implemented          | Sanitize preview output and validate same-origin, bounded collaboration traffic.                      |
| [ADR-049](./implemented/ADR-049-acknowledge-server-led-yjs-synchronization.md)        | Implemented          | Synchronize from server state and acknowledge durable, idempotent Yjs updates.                        |
| [ADR-050](./implemented/ADR-050-use-durable-manuscript-anchors.md)                    | Partially superseded | Resolve manuscript links through versioned Yjs positions; ADR-056 replaces its model-candidate scope. |
| [ADR-051](./implemented/ADR-051-reconcile-bibtex-and-version-sqlite-migrations.md)    | Implemented          | Reconcile every canonical BibTeX change and version per-object SQLite evolution.                      |
| [ADR-052](./implemented/ADR-052-test-durable-objects-in-workers-runtime.md)           | Implemented          | Verify migrations, transactions, and eviction in an isolated real Workers runtime.                    |
| [ADR-053](./implemented/ADR-053-use-a-tabbed-research-context-pane.md)                | Implemented          | Keep authoring beside a tabbed preview and resource-keyed research context.                           |
| [ADR-054](./implemented/ADR-054-model-publication-pdf-associations-explicitly.md)     | Implemented          | Link publications and local PDF artifacts only through explicit durable relationships.                |
| [ADR-055](./implemented/ADR-055-use-reviewed-doi-intake-for-pdfs.md)                  | Implemented          | Identify an imported PDF through reviewed, atomic, DOI-backed publication intake.                     |
| [ADR-056](./implemented/ADR-056-persist-grounded-passage-revisions.md)                | Implemented          | Persist typed evidence and targeted replacements for grounded passage revisions.                      |
| [ADR-057](./implemented/ADR-057-compose-projects-from-main.md)                        | Implemented          | Compose one project from root `main.md` through bounded, source-mapped transclusion.                  |
| [ADR-058](./implemented/ADR-058-use-a-shared-reference-library.md)                    | Implemented          | Make a user-scoped reference library authoritative and derive project bibliography snapshots.         |
| [ADR-059](./implemented/ADR-059-separate-private-research-from-projects.md)           | Implemented          | Keep personal research private by default and share pinned snapshots into projects explicitly.        |
| [ADR-060](./implemented/ADR-060-capture-versioned-web-sources.md)                     | Implemented          | Preserve timestamped web-source snapshots for reproducible citations and evidence.                    |
| [ADR-061](./implemented/ADR-061-preserve-project-revisions-and-milestones.md)         | Implemented          | Keep atomic project revisions, immutable milestones, non-destructive restore, and diffs.              |
| [ADR-062](./implemented/ADR-062-use-one-source-mapped-export-pipeline.md)             | Implemented          | Derive publication targets and statistics from one pinned, source-mapped export intermediate.         |
| [ADR-063](./implemented/ADR-063-model-citation-assertions-with-provenance.md)         | Implemented          | Represent library citation relationships as bounded provenance-bearing assertions.                    |

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
