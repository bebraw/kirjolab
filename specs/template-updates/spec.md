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
- **Applied update record:** target project docs or package metadata
- **Current backfilled updates:**
  - `2026-06-09-node-24-npm-baseline`
  - `2026-06-10-capability-kits`
  - `2026-06-11-mutation-quality-gate`
  - `2026-06-12-affected-guardrails`
  - `2026-06-12-incremental-local-mutation`
  - `2026-06-13-affected-unit-tests`
  - `2026-06-13-relative-stryker-concurrency`
  - `2026-06-13-github-only-mutation-ci`
  - `2026-06-14-agent-ci-warm-cache`
  - `2026-06-14-agent-sync-entrypoint`
  - `2026-06-17-advisory-fallow-diagnostics`
  - `2026-06-17-shared-affected-file-utils`
  - `2026-07-08-typescript-7-typecheck`
  - `2026-07-10-playwright-1-61-ci-image`
  - `2026-07-13-agent-ci-progress`

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

## Contract

### Definition of Done

- [ ] `.template/updates/README.md` explains update-pack layout and application.
- [ ] `.template/updates/AGENT_SYNC.md` gives agents a single cross-repo entrypoint.
- [ ] Each update pack has `update.json`, `README.md`, and `patch.diff`.
- [ ] Update metadata lists touched surfaces, related ADRs, risk, and checks.
- [ ] Patch files are focused on reusable migration steps rather than whole
      template snapshots.
- [ ] Durable docs mention update packs as the template-maintenance sync path.
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
- Backfilled packs should cover reusable historical changes, not every commit.
- New reusable template maintenance changes should add or update an update pack
  in the same change set.

### Verification

- **Automated checks:** `npm run quality:gate` and `npm run ci:local`
- **Manifest parse:** `node -e "for (const f of require('node:fs').readdirSync('.template/updates')) { if (f !== 'README.md') JSON.parse(require('node:fs').readFileSync('.template/updates/' + f + '/update.json', 'utf8')) }"`
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

**Scenario: Routine dependency update**

- Given: a dependency-only update has no reusable workflow or architecture
  behavior
- When: downstream projects can use their own dependency update automation
- Then: no update pack is required unless the version change carries migration
  steps
