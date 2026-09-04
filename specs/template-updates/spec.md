# Feature: Template Updates

## Blueprint

### Context

Projects that start from `vibe-template` diverge quickly. Direct Git merges from
the template become noisy once a downstream project has changed source files,
docs, package scripts, or CI workflow names. Contributors need a lightweight way
to pull selected template maintenance changes into those projects without
copying unrelated starter structure.

### Architecture

- **Update root:** `.template/updates/`
- **Update layout:** `.template/updates/{update-id}/`
- **Required metadata:** `update.json`
- **Required guide:** `README.md`
- **Required patch:** `patch.diff`
- **Agent sync entrypoint:** `.template/updates/AGENT_SYNC.md`
- **Patch role:** focused first-attempt migration patch
- **Guide role:** manual fallback for diverged target projects
- **Applied update record:** target project docs or package metadata;
  `vibeTemplate.source` identifies the upstream repository,
  `vibeTemplate.baseline` records the verified full Git revision whose tree
  seeded this project, and `vibeTemplate.updates` records behaviors present in
  this project; update IDs may include upstream updates that were not backfilled
  as local packs
- **Adopted updates in this batch:**
  `2026-07-22-engineering-quality-skills`,
  `2026-08-03-repository-local-wayfinder`, and
  `2026-08-03-repository-local-spec-tdd`, plus the discoverability-only
  `2026-08-03-readme-skill-catalog` and the focused
  `2026-08-03-record-template-provenance`, followed by
  `2026-08-17-dependency-toolchain-refresh` (including Kirjolab's measured
  Stryker 10 floor under ADR-233) and
  `2026-08-31-compact-agent-skills`, followed by the reusable local
  `2026-09-03-actionable-mutation-reporting` refinement and the
  `2026-09-04-bound-npm-audit-retries` dependency-audit fallback
- **Current backfilled update registry:** directories containing
  `.template/updates/*/update.json`

### Anti-Patterns

- Do not make update packs hidden automation that rewrites target projects
  without review.
- Do not treat update packs as a replacement for capability kits when a target
  project is adopting a capability for the first time.
- Do not include secrets, machine-local values, generated reports, or local
  caches in update packs.
- Do not assume target projects kept this template's exact package manager,
  docs structure, workflow names, or source layout.
- Do not require a custom CLI before update packs are useful.
- Do not make agents infer the cross-repo sync workflow from scattered docs.
- Do not guess a template source or baseline revision. Record provenance only
  after the repository relationship is verified.
- Do not record an update as applied until its behavior, routing, durable
  architecture record, and feature contract are present in the target project.

## Contract

### Definition of Done

- [ ] `.template/updates/README.md` explains update-pack layout and application.
- [ ] `.template/updates/AGENT_SYNC.md` gives agents a single cross-repo entrypoint.
- [ ] Each update pack has `update.json`, `README.md`, and `patch.diff`.
- [ ] Update metadata lists touched surfaces, related ADRs, risk, and checks.
- [ ] Patch files are focused on reusable migration steps rather than whole
      template snapshots.
- [ ] Durable docs mention update packs as the template-maintenance sync path.
- [ ] The applied update record exposes the verified upstream source and full
      baseline revision so a future sync can locate and compare the template.
- [ ] The applied update record includes each adopted agent-workflow update
      only after its canonical skills and Kirjolab-specific routing are present.
- [ ] The spec is updated in the same change set.

### Regression Guardrails

- Update packs must remain reviewable plain files.
- Update packs must preserve target-project conventions by default.
- Update packs must include manual fallback instructions for diverged projects.
- Update packs must distinguish structural migrations from routine dependency
  refreshes.
- The agent sync entrypoint must be explicit enough that a target-repo agent can
  act on "look at vibe-template for latest updates" without additional prompt
  engineering.
- The sync workflow must use a verified local checkout or recorded source and
  baseline; it must not invent provenance when neither is available.
- Backfilled packs should cover reusable historical changes, not every commit.
- New reusable template maintenance changes should add or update an update pack
  in the same change set.
- A clean patch check must not bypass target-specific ADR identifiers, canonical
  skill ownership, or other repository conventions.

### Verification

- **Automated checks:** `npm run quality:gate` and `npm run ci:local`
- **Manifest parse:** `node -e "const fs=require('node:fs'); for (const d of fs.readdirSync('.template/updates',{withFileTypes:true}).filter((entry)=>entry.isDirectory())) { const manifest=JSON.parse(fs.readFileSync('.template/updates/'+d.name+'/update.json','utf8')); if (manifest.id !== d.name) throw new Error(d.name+': manifest id mismatch') }"`
- **Docs check:** `rg "template update|\\.template/updates|update pack"`
- **Agent entrypoint:** `test -f .template/updates/AGENT_SYNC.md`

### Scenarios

**Scenario: Contributor applies a clean update pack**

- Given: a downstream project still matches the touched template files closely
- When: the contributor runs `git apply --check` for the update pack patch
- Then: the patch applies cleanly and the contributor runs the listed checks

**Scenario: Target project has diverged**

- Given: a downstream project renamed scripts or reorganized docs
- When: the update pack patch does not apply cleanly
- Then: the contributor follows the pack README and ports the behavior manually

**Scenario: Reusable skill pack conflicts with Kirjolab conventions**

- Given: an upstream skill pack assumes different ADR identifiers, skill-copy
  ownership, or agent routing
- When: Kirjolab adopts the reusable workflow
- Then: the contributor preserves the pack's behavior while using Kirjolab's
  next ADR identifiers, canonical `.codex/skills/` root, selective compatibility
  copies, and existing Blueprint/Contract specs

**Scenario: New reusable template maintenance lands**

- Given: a template change affects downstream maintenance behavior
- When: the change is implemented
- Then: the same change set adds or updates a `.template/updates/` pack

**Scenario: User points an agent at vibe-template**

- Given: an agent is working in a downstream repository
- When: the user says to look at `vibe-template` for latest updates
- Then: the agent reads `.template/updates/AGENT_SYNC.md`, recommends relevant
  unapplied packs, applies only approved migrations, runs checks, and records
  applied update IDs

**Scenario: Template checkout path is not obvious**

- Given: the current repository has a verified `vibeTemplate.source` and
  `vibeTemplate.baseline` record but no obvious sibling checkout
- When: an agent begins a template sync
- Then: it uses the recorded provenance to resolve or request access to the
  upstream repository instead of guessing a path or revision

**Scenario: Routine dependency update**

- Given: a dependency-only update has no reusable workflow or architecture
  behavior
- When: downstream projects can use their own dependency update automation
- Then: no update pack is required unless the version change carries migration
  steps
