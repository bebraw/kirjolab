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

- Treat portable Markdown and BibTeX as the canonical authored artifacts.
- Treat parsed syntax, previews, Yjs updates, indexes, and model candidates as supporting representations.
- Coordinate each collaborative document through its own SQLite-backed Durable Object.
- Discover workspaces through a separate SQLite-backed catalog per owner identity; never use one catalog as the collaboration atom for all documents.
- Keep stable workspace browser and API identities at `/workspaces/{id}` and `/api/workspaces/{id}`.
- Materialize every accepted collaborative update into readable Markdown and bibliography text.
- Store imported PDF bytes in R2 and keep annotations as separate scholarly resources.
- Combine PDF page/geometry identity with exact quote, prefix, and suffix selectors; never require mutation of the imported PDF.
- Normalize PDF selection rectangles to top-left page coordinates in zero-to-one space so highlights do not depend on viewport pixels.
- Render only the active PDF page through the PDF.js display layer; keep its worker version matched with the pinned display dependency.
- Expose scholarly entities through stable resource identities and typed relationships rather than citation keys or filenames alone.
- Let language models create provenance-aware candidates; applying a candidate must remain a separate validated action.
- Keep local-model network access in the browser or a future local companion so a hosted Worker never assumes it can reach localhost.
- Treat the current demo workspace as a local vertical slice. Do not deploy it for shared use until authentication and workspace authorization are specified and implemented.

## Tooling Baseline

- Local development and local CI target macOS as the supported host platform baseline.
- Node is pinned exactly through `package.json`, and npm is constrained to a compatible major there instead of an exact patch pin.
- The verification baseline is split into a fast gate and a browser gate so quick checks can return earlier without dropping full coverage.
- The repo-managed `pre-push` Git hook should run affected-file guardrails before code is pushed.
- Formatting, type checking, unit tests, and end-to-end tests are part of the baseline quality gate.
- Fallow codebase diagnostics are advisory readability checks for complexity, duplication, dependency hygiene, and cleanup evidence; they do not replace the baseline quality gate.
- Affected-file guardrails should scope checks to changed files when the underlying tool supports it and fall back to project-level checks only when needed.
- The fast quality gate should fail when Worker/view runtime files contain inline script blocks without a `src`, inline event-handler attributes, or `javascript:` URLs. External scripts must point to an explicit typed client build.
- Unit coverage for `src/` code should stay high enough that the coverage gate remains green.
- Local CI should validate the same baseline checks before non-documentation changes are proposed or merged.
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
