# Feature: Quality Gate

## Blueprint

### Context

The template needs a verification baseline that stays strict enough for end-to-end confidence while still returning useful failures quickly during normal development.

### Architecture

- **Fast gate:** `npm run quality:gate:fast`
- **Workers runtime gate:** `npm run test:workers`
- **Affected guardrails:** `npm run quality:affected`
- **Browser gate:** `npm run e2e`
- **Browser discovery boundary:** canonical `src/**/*.e2e.ts` files outside
  generated mutation sandboxes
- **Affected test gate:** `npm run test:affected`
- **Advisory codebase diagnostics:** `npm run diagnostics:codebase`
- **Changed-code readability diagnostics:** `npm run diagnostics:readability`
- **Whole-repo health diagnostics:** `npm run diagnostics:health`
- **Full mutation gate:** `npm run mutation`
- **Incremental mutation gate:** `npm run mutation:incremental`
- **Full gate:** `npm run quality:gate`
- **Local workflow:** `npm run ci:local`
- **Local workflow formatter:** `scripts/run-local-ci.mjs`
- **Local workflow progress source:** Agent CI versioned NDJSON events
- **Local workflow heartbeat:** every 15 seconds while the workflow is active
- **Local workflow concurrency:** parallel Agent CI jobs with isolated writable dependency views
- **Local dependency prewarm:** `.github/workflows/ci.yml:quality-fast:install`
- **Local workflow failure mode:** pause failed Agent CI runners for retry
- **Retry command:** `npm run ci:local:retry -- --name <runner-name>`
- **Remote workflow:** `.github/workflows/ci.yml`
- **CI dependency install:** plain `npm ci`
- **Action pinning:** every GitHub Actions `uses:` reference must use a full commit SHA
- **Git hook path:** `.githooks/`
- **Hook setup script:** `scripts/setup-git-hooks.mjs`
- **Affected guardrail logic:** `scripts/run-affected-guardrails.mjs`
- **Affected test logic:** `scripts/run-affected-tests.mjs`
- **Affected file helper logic:** `scripts/affected-file-utils.mjs`
- **Runtime pin source:** `package.json#engines.node`
- **Package manager hint source:** `package.json#packageManager`
- **Browser runtime image:** `mcr.microsoft.com/playwright:v1.61.1-noble`
- **Coverage gate logic:** `scripts/run-coverage-gate.mjs`
- **Worker client-code guard:** `scripts/assert-no-worker-client-scripts.mjs`
- **Codebase diagnostics config:** `.fallowrc.json`
- **Formatting ownership exclusions:** duplicated `.github/skills/` content and
  vendored `.codex/skills/**/references/`
- **Formatting cache:** content-based results under ignored `.cache/prettier`
- **Mutation config:** `stryker.config.mjs`
- **Mutation heap ceiling:** 8 GiB for TypeScript-aware Stryker instrumentation
- **Readiness baseline:** `npm run quality:gate` and `npm run ci:local` for non-documentation changes
- **Documentation-only exception:** documentation-only changes may skip `npm run ci:local` when they do not alter executable config, generated artifacts, package metadata, source code, or tests

### Anti-Patterns

- Do not collapse fast and browser verification back into one opaque step without a concrete reason.
- Do not treat colocated tests or test-support files as runtime source code when deciding whether unit coverage is missing.
- Do not weaken the full gate just to make iteration faster.
- Do not split, duplicate, reorder, or omit workflow checks merely to expose
  more progress.
- Do not parse Agent CI's human-oriented logs when its versioned event stream
  provides the same state directly.
- Do not treat advisory Fallow diagnostics as a replacement for formatting, type checking, runtime audit, unit coverage, browser tests, mutation testing, or Worker-specific guardrails.
- Do not treat targeted iteration checks as a replacement for the readiness baseline unless the change is documentation-only and qualifies for the documented Agent CI exception.
- Do not add undocumented workflow write targets for generated output, local state, caches, archives, or tool artifacts.

## Contract

### Definition of Done

- [ ] The fast gate covers formatting, type checking, Worker client-code guardrails, runtime audit, unit coverage, and real Workers-runtime tests.
- [ ] The affected guardrail path scopes formatting, JavaScript syntax checks, Worker client-code checks, package audit, and unit tests to affected files when possible.
- [ ] The affected test gate runs tests related to affected runtime files, runs affected unit test files directly, and falls back to full coverage for broad test environment changes or affected runtime files with no related tests.
- [ ] The advisory codebase diagnostics report changed-code readability risk, whole-repo health, hotspots, duplication, and cleanup evidence without becoming part of the hard quality gate.
- [ ] The browser gate covers each canonical Playwright baseline file once.
- [ ] The full mutation gate covers runtime `src/**/*.ts` files with Stryker, Vitest, and TypeScript checking.
- [ ] The incremental mutation gate reuses prior Stryker results and ignores static mutants for repeated local quality-gate runs while preserving a complete mutation report.
- [ ] The full gate runs the fast, browser, and incremental mutation gates in order.
- [ ] The repo-managed `pre-push` hook runs affected-file guardrails before a push leaves the machine.
- [ ] Local and remote CI use the same split verification model for non-documentation changes.
- [ ] Local CI reports job and step starts, completions, durations, and
      15-second heartbeats without changing Agent CI's workflow, failure, or
      retry semantics.
- [ ] Documentation-only changes can skip Agent CI when they do not alter executable behavior or workflow configuration.
- [ ] The spec is updated in the same change set.

### Regression Guardrails

- `npm run quality:gate:fast` must remain a useful faster signal than the full gate.
- Formatting must continue to cover project-owned source, configuration, skill
  entrypoints, specs, ADRs, and docs while excluding duplicated or vendored
  skill reference trees.
- `npm run format:check` must use content-based cache invalidation under ignored
  `.cache/prettier`; correctness must not depend on that cache existing.
- `npm run quality:affected` must avoid full-repo work when affected files make a narrower check sufficient.
- `npm run test:affected` must avoid full coverage work when affected runtime or unit test files can be checked through related or direct Vitest runs.
- `npm run quality:gate` must continue to represent the local baseline verification path.
- `npm run diagnostics:codebase` must remain advisory and must not be required by the baseline readiness path.
- Fallow diagnostics must use `--no-cache` in repo scripts so normal diagnostic runs do not create a persistent `.fallow/` cache.
- `npm run mutation` must fail when the mutation score is below the configured break threshold.
- `npm run mutation:incremental` must fail when the resulting mutation score is below the configured break threshold.
- `npm run mutation:incremental` must ignore static mutants to keep the repeated local gate proportionate, while `npm run mutation` must continue to test them in the clean GitHub mutation job.
- `npm install` must keep the repo-managed `pre-push` hook configured without requiring extra setup steps.
- The CI workflow must cancel superseded runs for the same ref.
- The CI workflow must read the pinned Node version from `package.json` instead of a separate version file.
- The CI workflow must keep using npm for install and verification steps without depending on one exact npm patch release.
- The npm release used by CI must stay inside the supported npm range declared in `package.json`.
- CI jobs must install dependencies with plain `npm ci`.
- Local Agent CI must rely on its built-in warm-cache serialization instead of repo-local install locking.
- The CI workflow must pin every GitHub Actions `uses:` action reference to a full commit SHA, with any tag information kept only as a comment.
- The browser CI job must use the pinned Playwright container instead of reinstalling Chromium at runtime.
- The coverage gate must only require unit tests when runtime `src/` code exists.
- The coverage gate must work in both the normal workspace and local Agent CI's warmed `node_modules` layout.
- The Worker client-code guard must fail on inline script blocks without a `src`, inline event-handler attributes, and `javascript:` URLs in Worker/view runtime files while allowing external scripts from the typed client build.
- The affected guardrail path must pass only affected Worker/view runtime files to the Worker client-code guard.
- The affected guardrail path must run JavaScript syntax checks only for affected JavaScript files.
- The affected guardrail path must run package audit only when package metadata or lockfiles change.
- The affected guardrail path must skip unit tests when no runtime or unit test files are affected.
- The affected guardrail path must route Worker-reachable non-client source,
  Workers test files, and Workers test configuration to `npm run test:workers`.
- The Node affected-test path must never execute `*.workers.test.ts`; those files
  belong exclusively to the Workers runtime project.
- The affected test path must run full unit coverage when package metadata, TypeScript config, Vitest config, coverage-gate logic, or affected-test logic changes.
- The affected test path must run full unit coverage when affected-file helper logic changes.
- The affected test path must run full unit coverage when affected runtime files have no related tests and no affected unit test files were supplied.
- The affected guardrail path may fall back to project-level type checking or coverage when a safe per-file check is not available.
- The repo's local CI scripts should use the repo-pinned `agent-ci` binary directly instead of carrying repo-specific runtime patching or install locking.
- The canonical local CI script must explicitly prewarm through the stable fast
  job install step before concurrent jobs receive isolated writable dependency
  views.
- The canonical local CI script should use pause-on-failure so agents can fix and retry a failed runner without restarting the whole workflow.
- The local CI formatter must consume Agent CI's versioned JSON event stream
  instead of matching human log text.
- The local CI formatter must preserve Agent CI's final process exit code,
  attached pause-on-failure lifecycle, and retry command.
- The local CI formatter must report a heartbeat at least every 15 seconds while
  Agent CI is running without an active step completion.
- The local verification workflow should document macOS as the supported host baseline instead of implying cross-platform support.
- The Playwright server path must avoid macOS file-watcher exhaustion in local runs without changing the normal `npm run dev` workflow.
- Playwright must ignore Stryker's generated `.stryker-tmp/` sandbox so an
  incremental mutation run cannot duplicate browser suites in a later gate.
- Browser tests that mutate durable state must create isolated workspaces rather
  than assume the shared demo workspace still contains seed data.
- The local CI documentation must cover the no-`origin` case through `.env.agent-ci` and `GITHUB_REPO` instead of treating that warning as normal noise.
- The local CI Docker daemon override must use Agent CI's `AGENT_CI_DOCKER_HOST` variable instead of the general Docker CLI `DOCKER_HOST` variable.
- Local Playwright browser installation should go through a pinned repo script instead of ad hoc `npx playwright install ...` usage.
- Targeted checks may be documented for iteration, but `npm run quality:gate` and `npm run ci:local` remain the readiness baseline for non-documentation changes.
- Documentation-only changes may skip `npm run ci:local` when they do not alter executable config, generated artifacts, package metadata, source code, or tests.
- Mutation testing must exclude colocated tests, end-to-end tests, declarations,
  test support, HTTP adapters covered by route plus end-to-end tests, and
  browser-runtime orchestration modules covered by Playwright. Pure domain and
  security logic called by those adapters remains in mutation scope.
- Mutation testing must exclude dynamic browser runtime loaders because their
  versioned module boundaries are exercised by Playwright and expanding
  third-party runtime types during Stryker instrumentation exceeds Node's
  default heap.
- The mutation scripts must raise Node's heap ceiling enough for TypeScript-aware
  instrumentation without changing Stryker's score threshold or concurrency.
- Mutation testing must use the Vitest runner's per-test coverage analysis and related-test narrowing rather than an ad hoc minimization wrapper.
- Mutation testing must set Stryker worker concurrency as a percentage of available parallelism instead of a fixed worker count.
- GitHub Actions must run the full mutation gate instead of the incremental mutation gate.
- Mutation reports and Stryker incremental data must be written under ignored `reports/`, and Stryker's temporary sandbox must stay under ignored `.stryker-tmp/`.
- Mutation sandboxes must not copy ignored `.wrangler/` runtime state; live
  SQLite WAL files are ephemeral application data, not mutation-test inputs.
- New workflow write targets must be documented when they are introduced.
- Manually created Fallow caches must stay ignored under `.fallow/`.

### Verification

- **Automated checks:** `npm run quality:gate` and `npm run ci:local`
- **Local setup check:** `git config --get core.hooksPath` should resolve to `.githooks`
- **Workflow shape:** `.github/workflows/ci.yml` should show separate fast and browser jobs, with repository-shape validation in the fast job

### Scenarios

**Scenario: Contributor wants an affected local signal**

- Given: a change is still being iterated locally
- When: the contributor runs `npm run quality:affected`
- Then: guardrails run against affected files where possible and skip unrelated work

**Scenario: Contributor wants an affected unit test signal**

- Given: runtime or unit test files are affected
- When: the contributor runs `npm run test:affected`
- Then: Vitest checks related runtime tests or affected unit test files without running unrelated unit tests when that is safe

**Scenario: Contributor wants codebase readability diagnostics**

- Given: a change is ready for review or a refactor target is unclear
- When: the contributor runs `npm run diagnostics:codebase`
- Then: Fallow reports changed-code readability risk, health scoring, hotspots, duplication, and cleanup evidence without replacing the baseline gate

**Scenario: Contributor wants a fast baseline signal**

- Given: a change that does not need immediate browser verification
- When: the contributor runs `npm run quality:gate:fast`
- Then: formatting, typing, audit, unit coverage, and isolated Workers-runtime tests run without waiting for Playwright

**Scenario: Formatting skips vendored skill material**

- Given: duplicated or vendored skill references are present in the repository
- When: the contributor runs `npm run format:check`
- Then: Prettier checks project-owned files without spending the formatting
  budget on externally owned reference trees

**Scenario: Contributor repeats an unchanged formatting check**

- Given: a successful content cache exists under `.cache/prettier`
- When: the contributor runs `npm run format:check` again without changing a
  checked file
- Then: Prettier reuses valid content results and still fails for any changed,
  incorrectly formatted file

**Scenario: Full verification before landing code changes**

- Given: a non-documentation change is ready for review or merge
- When: the contributor runs `npm run quality:gate` and `npm run ci:local`
- Then: the fast, browser, and local incremental mutation verification paths pass

**Scenario: Contributor watches local workflow progress**

- Given: a local workflow step takes longer than normal without producing logs
- When: the contributor runs `npm run ci:local`
- Then: job and step boundaries remain visible and a heartbeat confirms the
  workflow is still active at least every 15 seconds

**Scenario: Local workflow pauses on failure**

- Given: an Agent CI workflow step fails
- When: the local formatter receives the paused-runner event
- Then: it prints the failed runner and retry command while Agent CI remains
  available for an attached retry

**Scenario: Documentation-only change**

- Given: a change only edits documentation
- And: it does not alter executable config, generated artifacts, package metadata, source code, or tests
- When: the contributor runs the smallest relevant local checks
- Then: they may skip `npm run ci:local`

**Scenario: Contributor checks test assertion strength**

- Given: runtime `src/**/*.ts` code has colocated unit tests
- When: the contributor runs `npm run mutation`
- Then: Stryker mutates runtime source only and fails if the mutation score is below the configured break threshold

**Scenario: Contributor repeats the local quality gate**

- Given: Stryker has an existing incremental report under `reports/`
- When: the contributor runs `npm run quality:gate`
- Then: the fast and browser gates pass before Stryker reuses valid prior mutant results and reruns affected mutants

**Scenario: GitHub verifies mutation strength**

- Given: a push or pull request runs GitHub Actions
- When: the `quality-mutation` job runs
- Then: it runs `npm run mutation` instead of the incremental mutation command

**Scenario: Contributor adds browser behavior to a Worker view**

- Given: a Worker-rendered view needs browser-side behavior
- When: the contributor adds inline executable browser code to `src/worker.ts` or `src/views/**/*.ts`
- Then: the fast quality gate fails and points them toward typed TypeScript modules instead

**Scenario: Contributor pushes with a broken fast gate**

- Given: the repo was bootstrapped with `npm install`
- When: the contributor runs `git push` while the fast gate is red
- Then: the `pre-push` hook runs affected-file guardrails and the push is blocked before remote CI starts

**Scenario: New push supersedes an old CI run**

- Given: a newer push exists on the same ref
- When: GitHub Actions schedules the new workflow run
- Then: the older in-progress run is canceled instead of continuing to consume time

**Scenario: Contributor audits remote action references**

- Given: the remote CI workflow uses reusable GitHub Actions
- When: the contributor reviews `.github/workflows/ci.yml`
- Then: every `uses:` action reference points at a full commit SHA instead of a mutable tag
