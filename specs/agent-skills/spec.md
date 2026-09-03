# Feature: Agent Skill Baseline

## Blueprint

### Context

Kirjolab should retain agent workflows that directly support its architecture
without vendoring large platform-documentation snapshots already available from
connected tools.

The skill baseline targets capable agents that can inspect repositories, use
tools, and apply ordinary engineering judgment. Skill context should carry
routing, Kirjolab-specific decisions, non-obvious invariants, exact local
interfaces, and safety boundaries rather than generic tutorials.

Focused correctness review, test review, and debugging workflows should provide
concrete evidence without making the broad review skill heavier. Large,
uncertain initiatives also need a lightweight way to preserve discovery across
sessions without introducing external tracker state or treating temporary maps
as durable authority.

Once decisions settle, Kirjolab should provide an explicit path into its living
feature specs and a focused red-green implementation loop for observable
runtime behavior.

### Architecture

- **Canonical project-local skill root:** `.codex/skills/`
- **Selective compatibility copies:** `.github/skills/` and capability-kit
  `files/` only for skills intentionally distributed through those surfaces
- **Copy policy:** keep an intentional copy equivalent to its canonical
  `.codex/skills/` source when one is maintained, unless the target surface
  requires a documented compatibility adaptation; compatibility-only skills
  need not be installed for Codex
- **Composition root:** `AGENTS.md` for model routing
- **Discovery catalog:** the `README.md` Agent Skills section links every
  canonical installed skill and identifies explicit-only workflows
- **Instruction budget:** concise descriptions and entrypoints;
  version-sensitive manuals stay in current primary documentation rather than
  prompt context
- **Cloudflare knowledge and account layer:** connected Cloudflare MCP
- **Worker implementation skill:** `workers-best-practices`
- **Cloudflare CLI skill:** `wrangler`
- **Durable Object skill:** `durable-objects`
- **Other specialized Cloudflare skills:** added with the capability that needs
  them
- **Sandbox SDK skill:** absent until Kirjolab adopts `@cloudflare/sandbox`
- **Focused correctness skill:** `.codex/skills/correctness-review/`
- **Focused test skill:** `.codex/skills/test-review/`
- **Systematic debugging skill:** `.codex/skills/debug/`
- **Explicit wayfinding skill:** `.codex/skills/wayfinder/`
- **Wayfinding map:** `docs/wayfinding/<effort>.md`
- **Wayfinding authority:** working context only; lasting decisions graduate
  into architecture docs, ADRs, and specs
- **Explicit specification skill:** `.codex/skills/to-spec/`
- **Specification target:** `specs/<feature-domain>/spec.md`
- **Behavior-first implementation skill:** `.codex/skills/tdd/`

### Anti-Patterns

- Do not vendor broad Cloudflare documentation snapshots when the connected MCP
  supplies current retrieval.
- Do not embed static CLI catalogs, framework inventories, metric thresholds,
  or API tutorials that current tools and primary documentation can resolve.
- Do not repeat generic model capabilities when a project-specific constraint
  is sufficient.
- Do not add persistent persona or output-compression skill suites to the
  repository baseline.
- Do not treat the MCP as a replacement for local Worker, Wrangler, or Durable
  Object implementation workflows.
- Do not retain product-specific skills for capabilities Kirjolab does not use.
- Do not let intentional compatibility or capability-kit copies diverge from a
  maintained canonical `.codex/skills/` source without a documented adaptation.
- Do not invent correctness or test findings without a concrete behavioral
  trigger, broken contract, or regression risk.
- Do not require GitHub Issues, labels, assignments, tracker setup, or a
  companion skill suite for wayfinding.
- Do not treat a wayfinding map as the durable source of truth for architecture
  or feature behavior.
- Do not invoke Wayfinder or To Spec unless the user explicitly requests the
  corresponding workflow.
- Do not publish feature specs to issue trackers, create parallel PRD formats,
  or synthesize unresolved decisions as accepted state.
- Do not force TDD onto changes without meaningful observable behavior or a
  stable test seam.
- Do not write tautological or implementation-coupled tests merely to satisfy a
  test-first sequence.

## Contract

### Definition of Done

- [ ] Both supported skill roots retain `workers-best-practices`, `wrangler`,
      and `durable-objects` while Kirjolab depends on those Cloudflare
      capabilities.
- [ ] Broad and unused Cloudflare skill bundles are absent from both supported
      roots.
- [ ] `sandbox-sdk` is absent while the repository has no Sandbox SDK runtime
      dependency or feature contract.
- [ ] Agent guidance routes current Cloudflare documentation, API discovery,
      and account operations through the connected MCP.
- [ ] Product-specific skills are introduced only with the capability that
      needs them.
- [ ] The canonical `.codex/skills/` root contains pinned `correctness-review`,
      `test-review`, and `debug` workflows with retained licenses and
      provenance.
- [ ] Focused review skills complement rather than replace broad review, and
      debugging proceeds from reproduction through root-cause evidence, then
      through a regression guard only for an authorized fix.
- [ ] Wayfinder is explicit-only, stores one repository-local map per effort by
      default, creates no tracker state, and promotes lasting decisions into
      durable records.
- [ ] To Spec is explicit-only and writes the existing Blueprint/Contract
      format without inventing unresolved decisions.
- [ ] TDD applies to observable runtime behavior when a stable seam exists and
      records alternative verification for documented exceptions.
- [ ] The adopted skills reuse Kirjolab's existing ADR, spec, authorization,
      test, and quality-gate conventions without runtime dependencies.
- [ ] Skill descriptions remain discriminating and normally fit within 30
      words; entrypoints contain only decision-changing guidance.
- [ ] The README catalog links every installed canonical skill and keeps
      explicit-only workflows visibly distinguished.

### Regression Guardrails

- The baseline must not reintroduce `cloudflare`, `agents-sdk`, or
  `cloudflare-email-service` without an explicit architecture change.
- The baseline must not reintroduce `sandbox-sdk` or communication-style skill
  suites without adopting their capability explicitly.
- Compact rewrites must preserve destructive-action approval, secret handling,
  retrieval pins, telemetry controls, public-seam testing, evidence thresholds,
  and repository verification rules.
- Version-sensitive commands and thresholds must be retrieved from current
  primary sources or resolved from installed tool help rather than accumulated
  in skill entrypoints.
- The three retained Cloudflare skill copies must remain available while
  Kirjolab uses Cloudflare Workers and Durable Objects.
- Removing a skill must not implicitly remove or change runtime behavior.
- A focused review must not report hypothetical findings as defects without
  evidence that the current behavior violates a contract.
- A diagnosis-only debugging request must not mutate code, add tests, or expand
  into implementation without user authorization.
- Wayfinding must remain optional, repository-local, and independent of
  issue-tracker infrastructure.
- A map must not become ready for specification while lasting decisions exist
  only in temporary planning text.
- To Spec must stop rather than invent an answer when a material contract or
  architecture decision remains unresolved.
- TDD must prove the intended missing behavior with a failing test before
  changing production code.
- TDD must allow explicit alternative verification for documentation,
  prototypes, generated output, and mechanical changes.
- Adding, removing, or renaming a canonical skill must update the README catalog
  in the same change set.

### Verification

- **Cloudflare skills:** confirm `workers-best-practices`, `wrangler`, and
  `durable-objects` remain present under both intentionally supported roots
- **Pruned bundles:** confirm unused Cloudflare product skills, `sandbox-sdk`,
  and communication-style suites are absent from repository skill roots
- **Instruction size:** inspect `wc -w $(rg --files .codex/skills -g SKILL.md)`
  and review growth that is not justified by a fragile workflow or safety
  boundary
- **Focused engineering skills:** confirm
  `.codex/skills/{correctness-review,test-review,debug}/SKILL.md` and their
  license files exist and retain the reviewed source revision
- **Wayfinder structure:** confirm `.codex/skills/wayfinder/` has valid skill
  frontmatter, UI metadata, license, and recorded provenance
- **Specification and TDD structure:** apply the same metadata and provenance
  validation to `.codex/skills/to-spec/` and `.codex/skills/tdd/`
- **README catalog:** compare directories containing
  `.codex/skills/*/SKILL.md` with the linked catalog entries and confirm
  explicit-only skills are labelled
- **Documentation check:** `npm run format:check`

### Scenarios

**Scenario: Agent needs current Cloudflare product information**

- Given: the Cloudflare MCP is connected
- When: an agent needs current documentation or API details
- Then: the agent retrieves them through the MCP instead of relying on a
  vendored platform snapshot

**Scenario: Agent changes a Durable Object**

- Given: Durable Objects are a core Kirjolab persistence boundary
- When: an agent authors or reviews Durable Object code
- Then: the agent uses the retained `durable-objects` skill alongside current
  MCP documentation

**Scenario: Kirjolab adopts another Cloudflare product**

- Given: a new capability needs specialized implementation guidance
- When: that capability is approved
- Then: Kirjolab adds only the relevant skill instead of restoring the complete
  Cloudflare bundle

**Scenario: Agent needs version-sensitive syntax**

- Given: an installed CLI, platform API, or browser metric may have changed
- When: a skill guides implementation or review
- Then: the agent retrieves current primary documentation or installed-tool
  help and keeps only Kirjolab-specific invariants in prompt context

**Scenario: Changed logic needs focused review**

- Given: a change contains non-trivial behavior or tests whose adequacy is in
  question
- When: the user requests correctness review or test review
- Then: the selected focused skill reports only evidence-backed defects or
  meaningful regression gaps while broad review remains available separately

**Scenario: Runtime behavior differs from expectations**

- Given: a test, build, or runtime workflow fails
- When: the user asks the agent to fix it through the debugging workflow
- Then: it reproduces and localizes the failure, fixes its root cause, adds a
  regression guard, and verifies the affected workflow end to end

**Scenario: User requests diagnosis only**

- Given: a test, build, or runtime workflow fails
- When: the user asks why it fails without requesting a fix
- Then: the debugging workflow reports reproducible evidence, the root cause,
  and a fix direction without changing code or tests

**Scenario: Canonical skill inventory changes**

- Given: a canonical `.codex/skills/` workflow is added, removed, or renamed
- When: the change is prepared for commit
- Then: the README catalog links the complete installed inventory and preserves
  visible explicit-only labels

**Scenario: Initiative is too uncertain to specify**

- Given: an initiative spans multiple sessions and still contains material
  decision fog
- When: the user explicitly invokes Wayfinder
- Then: the agent creates one repository-local map after confirming its
  destination and initial frontier

**Scenario: Work is already clear**

- Given: the requested outcome can already be specified or planned responsibly
- When: the user invokes Wayfinder
- Then: the agent recommends the direct workflow instead of creating a map

**Scenario: Settled discussion becomes a feature spec**

- Given: the feature behavior and important constraints are settled
- When: the user explicitly invokes To Spec
- Then: the agent selects one `specs/<feature-domain>/spec.md` target and
  synthesizes the agreed Blueprint and Contract without tracker state

**Scenario: Specification still contains a material decision**

- Given: an unresolved choice would change the feature contract or architecture
- When: To Spec evaluates readiness
- Then: the agent names the unresolved decision and returns to brainstorming or
  wayfinding instead of guessing

**Scenario: Observable runtime behavior changes**

- Given: a stable public test seam exposes the requested behavior
- When: the agent implements the change
- Then: TDD proves the missing behavior red, makes the smallest production
  change green, and repeats by focused vertical slice

**Scenario: No meaningful red test exists**

- Given: the change is documentation-only, generated, a prototype, or purely
  mechanical
- When: the agent considers TDD
- Then: it skips TDD and states the deterministic verification used instead
