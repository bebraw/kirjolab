# Feature: Capability Kits

## Blueprint

### Context

The template is useful both as a starter repo and as a source of specific practices that can be applied to existing projects. Contributors and agents need a lightweight way to transfer one capability, such as Agent CI, without copying unrelated template structure.

### Architecture

- **Kit root:** `.capabilities/`
- **Kit layout:** `.capabilities/{capability-name}/`
- **Required overview:** `README.md`
- **Required manifest:** `manifest.json`
- **Copyable files:** `files/`
- **Package-manager recipes:** `recipes/`
- **Validation notes:** `checks.md`
- **Available kits:** `typescript-setup`, `agent-ci`, `quality-gate`, `mutation-testing`, `pre-push-quality-gate`, `readme-screenshot`, `lighthouse-performance`
- **Optional adjacent setup:** capability kits may include prompted optional steps for prerequisites such as GitHub Actions workflows.
- **Negotiation prompt:** `.capabilities/README.md` includes a prompt-style UI for selecting capabilities before editing a target repo.
- **Later maintenance sync:** template update packs under `.template/updates/` cover follow-up changes to projects that already adopted a kit.

### Anti-Patterns

- Do not make capability kits hidden automation that rewrites target repos without review.
- Do not add adjacent capabilities such as GitHub Actions workflows without asking the user first.
- Do not apply a capability bundle to a target repo before the user approves the selected capabilities.
- Do not assume the target repo has the same package manager, docs structure, workflow names, or architecture rules as this template.
- Do not include secrets or machine-local values in copyable files.
- Do not let kit instructions drift from the template's own current implementation.
- Do not use capability kits as the only record for later maintenance changes that should be synced into projects that already adopted the capability.

## Contract

### Definition of Done

- [ ] Each capability kit has a README explaining purpose, fit, poor fit, and apply steps.
- [ ] Each capability kit has a manifest with dependencies, scripts, files, docs, and verification commands.
- [ ] Copyable files live under `files/` using their target relative paths.
- [ ] Package-manager-specific steps live under `recipes/`.
- [ ] Optional adjacent setup steps include an explicit prompt before changing the target repo.
- [ ] The capability index includes a prompt-style selection UI for negotiating which kits to pull into another project.
- [ ] Validation steps live in `checks.md`.
- [ ] Durable docs mention capability kits as a supported partial-upgrade path.

### Regression Guardrails

- Capability kits must remain lightweight and reviewable.
- Capability kits must preserve target-project conventions by default.
- Capability kit files must not contain secrets or local machine values.
- Optional adjacent setup must be opt-in when it adds a new target-project capability.
- The negotiation prompt must instruct agents to inspect the target repo, present recommended capabilities with trade-offs, and wait for approval before editing files.
- The TypeScript setup kit must keep its dependency, `typecheck` script, `tsconfig.json`, and optional CSS declaration guidance aligned with this repo's current TypeScript setup.
- The Agent CI kit must keep its dependency and command guidance aligned with this repo's `package.json` and `.codex/skills/agent-ci/SKILL.md`.
- The Agent CI kit must rely on current Agent CI warm-cache serialization instead of reintroducing a repo-local install-lock pattern for npm workflows.
- The quality-gate kit must keep the coverage gate script aligned with `scripts/run-coverage-gate.mjs`.
- The mutation-testing kit must keep its Stryker config aligned with `stryker.config.mjs`.
- The pre-push quality-gate kit must keep the hook setup aligned with `.githooks/pre-push` and `scripts/setup-git-hooks.mjs`.
- The README screenshot kit owns its copyable screenshot script because the template baseline no longer ships that script; the Lighthouse kit must keep its script aligned with `scripts/run-lighthouse.mjs`.
- Reusable follow-up changes to a capability kit must add or update a `.template/updates/` pack in the same change set.

### Verification

- **Repo checks:** `npm run quality:gate` and `npm run ci:local`
- **Manifest parse:** `node -e "JSON.parse(require('node:fs').readFileSync('.capabilities/agent-ci/manifest.json', 'utf8'))"`
- **Docs check:** `rg "capability kits|\\.capabilities|Agent CI Capability Kit"`

### Scenarios

**Scenario: Agent applies Agent CI to another npm repo**

- Given: an npm repo with a GitHub Actions workflow
- When: the agent follows `.capabilities/agent-ci/recipes/npm.md`
- Then: the target repo gains the pinned Agent CI dependency, local CI scripts, local env example, Codex skill, and validation path

**Scenario: Target repo has no GitHub Actions workflow**

- Given: a target repo has no `.github/workflows/*.yml` or `.github/workflows/*.yaml` files
- When: the agent applies the Agent CI capability kit
- Then: the agent asks whether to add a minimal GitHub Actions workflow before creating one

**Scenario: Target repo differs from this template**

- Given: the target repo has different docs or workflow names
- When: the agent applies a capability kit
- Then: the agent merges the kit into the existing conventions instead of overwriting unrelated structure

**Scenario: Kit drift is introduced**

- Given: this repo changes its Agent CI setup
- When: the Agent CI kit still documents the old command or dependency
- Then: the quality review treats the kit as stale and updates it in the same change set

**Scenario: Contributor chooses a narrow upgrade**

- Given: another repo only needs local README screenshot refresh
- When: the agent applies `.capabilities/readme-screenshot/`
- Then: the target repo receives screenshot tooling without inheriting Agent CI, hooks, Lighthouse, or the Worker starter

**Scenario: Contributor only needs TypeScript checking**

- Given: another npm repo wants strict TypeScript checking but not the full quality gate
- When: the agent applies `.capabilities/typescript-setup/`
- Then: the target repo receives TypeScript dependencies, a `typecheck` script, a mergeable `tsconfig.json`, and optional CSS import declaration guidance

**Scenario: Contributor adds assertion-strength checks**

- Given: another npm TypeScript repo uses Vitest and has meaningful unit tests
- When: the agent applies `.capabilities/mutation-testing/`
- Then: the target repo receives Stryker dependencies, a mutation script, mergeable Stryker config, report output guidance, and validation steps

**Scenario: Contributor is unsure which kits to apply**

- Given: another repo may benefit from multiple capabilities
- When: the agent uses the negotiation prompt from `.capabilities/README.md`
- Then: the agent inspects the target repo, presents a checkbox-style capability pull plan, and waits for approval before editing files
