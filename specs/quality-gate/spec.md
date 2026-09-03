# Feature: Quality Gate

## Blueprint

### Context

Kirjolab needs a verification baseline that stays strict enough for end-to-end
confidence while retaining portable maintenance guardrails and returning useful
failures quickly during normal development.

### Architecture

- **Fast gate:** `npm run quality:gate:fast`
- **Workers runtime gate:** `npm run test:workers`
  The multi-step GitHub OAuth and installation lifecycle scenario has an
  explicit 15-second timeout because concurrent Workers isolates on the pinned
  Node runtime can exceed Vitest's 5-second unit default; all other Workers
  scenarios retain the default timeout.
- **Workers test binding policy:** local Miniflare bindings with remote binding sessions disabled
- **Affected guardrails:** `npm run quality:affected`
- **Browser gate:** `npm run e2e`
- **Browser discovery failure policy:** Playwright must fail when the canonical
  suite resolves to zero tests; the gate must not use `--pass-with-no-tests`.
- **Browser artifact-analysis boundary:** E2E acknowledges queued analysis jobs
  without launching Browser Rendering; production and normal local development
  keep analysis enabled
- **Browser discovery boundary:** canonical `src/**/*.e2e.ts` files outside
  generated mutation sandboxes
- **Affected test gate:** `npm run test:affected`
- **Advisory codebase diagnostics:** `npm run diagnostics:codebase`
- **Changed-code readability diagnostics:** `npm run diagnostics:readability`
- **Type-aware cleanup diagnostics:** `npm run diagnostics:type-aware`
- **Whole-repo health diagnostics:** `npm run diagnostics:health`
- **Dependency-cost diagnostics:** `npm run diagnostics:dependencies`
- **Disposable-state cleanup:** `npm run maintenance:clean`
- **PDF reference quality:** `npm run diagnostics:pdf-references`
- **Live citation-provider coverage:** `npm run diagnostics:citation-providers`
- **Explicit full mutation audit:** `npm run mutation`
- **Latest mutation report summary:** `npm run mutation:report`
- **Affected mutation gate:** `npm run mutation:affected -- --mutate <files>`
- **Incremental mutation gate:** `npm run mutation:incremental`
- **Manual incremental refresh:** `npm run mutation:incremental:refresh`
- **Pull-request mutation compatibility smoke:** `npm run mutation:ci`
- **Pull-request mutation selector:** `scripts/run-ci-mutation.mjs`
- **Mutation configuration canary:** `src/views/app-navigation.ts`
- **Pull-request mutation scope:** directly changed configured production
  sources projected from zero-context new/head-side hunks to coalesced Stryker
  line ranges with full-file safety fallback for deletion-only or empty positive
  spans, changed/deleted/renamed Node unit tests mapped to surviving full-file
  production counterparts only when those sources were not directly changed,
  and an always-full-file stable canary for mutation configuration or routing
  changes including deletion
- **Pull-request mutation result:** selected production code is instrumented and
  its related initial Vitest run passes inside a Stryker worker; mutant plans,
  per-mutant TypeScript checks, mutation-result report finalization, and score
  threshold evaluation do not run
- **Pull-request mutation bounds:** non-incremental `dryRunOnly`, static mutants
  ignored, console progress output, and a 10-minute job timeout
- **Full gate:** `npm run quality:gate` (fast gate followed by browser gate)
- **Full gate progress:** named phase transitions plus a 30-second elapsed-time heartbeat while a phase is running
- **Local readiness:** `npm run ci:local` delegates to the native full gate
- **Optional container parity:** `npm run ci:local:container`
- **Container workflow formatter:** `scripts/run-local-ci.mjs`
- **Container workflow progress source:** Local CI versioned NDJSON events
- **Container workflow heartbeat:** every 15 seconds while the workflow is active
- **Container retry:** `npm run ci:local:container:retry -- --name <runner-name>`
- **Remote workflow:** `.github/workflows/ci.yml`
- **Remote recovery trigger:** GitHub Actions `workflow_dispatch`
- **Protected branch:** `main`
- **Required remote checks:** `quality-fast`, `quality-browser`, and
  `quality-mutation` from the GitHub Actions App
- **Mutation workflow trigger:** GitHub pull requests only; pushes to `main` do
  not repeat the mutation job
- **Remote merge boundary:** an up-to-date pull request with resolved review
  conversations and no administrator bypass
- **CI dependency install:** plain `npm ci`
- **Action pinning:** every GitHub Actions `uses:` reference must use a full commit SHA
- **Git hook path:** `.githooks/`
- **Hook setup script:** `scripts/setup-git-hooks.mjs`
- **Pre-push deep-check selector:** `scripts/run-pre-push-quality.mjs`
- **Affected guardrail logic:** `scripts/run-affected-guardrails.mjs`
- **Affected test logic:** `scripts/run-affected-tests.mjs`
- **Affected file helper logic:** `scripts/affected-file-utils.mjs`
- **Runtime pin source:** `package.json#engines.node`
- **Package manager hint source:** `package.json#packageManager`
- **Browser runtime image:** `mcr.microsoft.com/playwright:v1.62.1-noble`
- **Coverage gate logic:** `scripts/run-coverage-gate.mjs`
- **Worker client-code guard:** `scripts/assert-no-worker-client-scripts.mjs`
- **ADR registry guard:** `scripts/check-adr-registry.mjs`
- **Private paper-import package build:** `npm run build:paper-import-package`
- **Private paper-import package verification:** `npm run test:paper-import-package`
- **Paper-import package staging target:** ignored `.generated/paper-import-package/`
- **Paper-import package consumer baseline:** exact Node.js `24.15.0`, ESM,
  NodeNext declaration compilation, offline tarball installation, and
  consumer-owned PDF.js runtime injection
- **Codebase diagnostics config:** `.fallowrc.json`
- **Formatting ownership exclusions:** duplicated `.github/skills/` content and
  vendored `.codex/skills/**/references/`
- **Formatting cache:** content-based results under ignored `.cache/prettier`
- **Mutation config:** `stryker.config.mjs`
- **Long-run mutation reporter:** `scripts/run-mutation.mjs`
- **Mutation summary formatter:** `scripts/report-mutation-results.mjs`
- **Mutation report layers:** periodic console progress, a concise terminal
  score/status/static/hotspot summary, interactive
  `reports/mutation/index.html`, and machine-readable
  `reports/mutation/mutation.json`
- **Instrumented large-fixture exclusion:** Tests whose purpose is near-cap
  complexity or whose public integration fixture is inherently boundary-sized
  may skip only inside a Stryker worker, detected through the repository's
  centralized `STRYKER_MUTATOR_WORKER` test helper. The helper contract is
  reverified whenever the pinned Stryker version changes, and normal unit and
  coverage CI must not inherit the worker marker. Every skipped performance
  case must retain a mutation-selected deterministic test of the same parser
  behavior. Every skipped hard-boundary integration must retain a
  mutation-selected test of the production-used guard or accumulator that
  proves the accepted boundary, first rejected value, aggregation when
  applicable, and stable typed failure. A boundary-sized public fixture is not
  a mutation-coverage waiver. Use a small internal production seam, or, when
  production source belongs to an immutable published artifact, exercise the
  unchanged public interface in an isolated test module that tightens only the
  relevant hard ceilings. The test must not reimplement the guard.
- **Mutation heap ceiling:** 8 GiB for TypeScript-aware Stryker instrumentation
- **Readiness baseline:** `npm run ci:local` for non-documentation changes
- **Documentation-only exception:** documentation-only changes may skip `npm run ci:local` when they do not alter executable config, generated artifacts, package metadata, source code, or tests

### Anti-Patterns

- Do not collapse fast and browser verification back into one opaque step without a concrete reason.
- Do not treat colocated tests or test-support files as runtime source code when deciding whether unit coverage is missing.
- Do not add unbounded specialist analysis to the routine readiness gate when
  it already has an explicit command and authoritative CI job.
- Do not make repository readiness depend on live scholarly-provider coverage,
  latency, or quota state.
- Do not make routine readiness depend on a container when the same
  authoritative package scripts run natively on the supported host.
- Do not parse Local CI's human-oriented logs when its versioned event stream
  provides the same state directly.
- Do not treat advisory Fallow diagnostics as a replacement for formatting, type checking, runtime audit, unit coverage, browser tests, mutation testing, or Worker-specific guardrails.
- Do not treat targeted iteration checks as a replacement for the readiness baseline unless the change is documentation-only and qualifies for the documented local CI exception.
- Do not add undocumented workflow write targets for generated output, local state, caches, archives, or tool artifacts.
- Do not delete `.wrangler/state`, `.generated`, or unknown ignored paths from
  the routine maintenance cleanup.

## Contract

### Definition of Done

- [ ] The fast gate covers formatting, type checking, Worker client-code guardrails, runtime audit, unit coverage, and real Workers-runtime tests.
- [ ] Worker-runtime tests run without Cloudflare preview sessions, account credentials, or remote binding availability.
- [ ] The ADR registry guard rejects duplicate identifiers, mismatched headings,
      missing lifecycle metadata, absent index entries, and broken local ADR links.
- [ ] The affected guardrail path scopes formatting, JavaScript syntax checks, Worker client-code checks, package audit, and unit tests to affected files when possible.
- [ ] The affected test gate runs tests related to affected runtime files, runs affected unit test files directly, and falls back to full coverage for broad test environment changes or affected runtime files with no related tests.
- [ ] The advisory codebase diagnostics report changed-code readability risk, whole-repo health, hotspots, duplication, and cleanup evidence without becoming part of the hard quality gate.
- [ ] The maintenance cleanup removes only reproducible allowlisted targets and
      preserves local application state and generated media.
- [ ] Citation-provider diagnostics use production bounded adapters, report
      current coverage and completeness, and remain outside the hard gate.
- [ ] The browser gate covers each canonical Playwright baseline file once.
- [ ] The browser gate does not launch real artifact-analysis browser jobs for
      analysis endpoints that the E2E suite replaces with deterministic mocks.
- [ ] The explicit full mutation audit covers runtime `src/**/*.ts` files with
      Stryker, Vitest, TypeScript checking, static mutants, and the configured
      full reporters.
- [ ] Full and incremental mutation runs preserve Stryker's exit status, omit
      exhaustive test and mutant dumps, and summarize every fresh JSON result
      with aggregate and covered-code scores, threshold margin, status and
      static-mutant totals, highest-impact files, and report paths.
- [ ] The affected mutation gate retains TypeScript checking and limits routine
      pre-push mutation to affected Node-testable source files.
- [ ] The incremental mutation gate reuses prior Stryker results and ignores static mutants for explicit full-surface local test-hardening runs while preserving a complete mutation report.
- [ ] The pull-request mutation selector compares explicit base and head commit
      SHAs, preserves deletion status and both rename paths through a
      NUL-delimited name-status diff, derives positive new/head-side spans from
      per-source zero-context diffs, and emits coalesced `file.ts:start-end`
      Stryker patterns for surviving directly changed configured production
      sources.
- [ ] A surviving directly changed source with any deletion-only hunk or no
      positive new-side span becomes a full-file pattern because Stryker mutates
      only AST nodes fully contained by a range; a deleted source is omitted.
- [ ] Changed, deleted, or renamed Node unit tests map to their surviving
      production counterpart as a full-file pattern only when that source was
      not directly changed; mutation configuration or routing changes, including
      deletions, select the stable production canary as an always-full-file
      pattern.
- [ ] Malformed or unavailable base or head commits fail the pull-request check
      without expanding to the full mutation surface, while an empty selected
      scope succeeds without starting Stryker.
- [ ] Pull-request mutation compatibility ignores static mutants, instruments
      the selected production code, and completes the related initial Vitest
      run inside a Stryker worker with progress output and a 10-minute bound.
- [ ] The pull-request compatibility path executes no mutant plans or
      per-mutant TypeScript checks, finalizes no mutation-result report, and
      evaluates no score threshold; the temporary base 63 break remains blocking for
      full, affected, incremental, and pre-push mutation.
- [ ] The full gate runs the fast and browser gates in order.
- [ ] The full gate reports phase starts, completions, failures, and periodic elapsed-time heartbeats.
- [ ] The repo-managed `pre-push` hook runs affected-file guardrails, relevant
      Fallow diagnostics, and relevant targeted mutation checks before a
      push leaves the machine.
- [ ] Pre-push mutation configuration changes run affected configured sources
      plus the stable canary without force-refreshing the full incremental
      report.
- [ ] Local and remote CI use the same fast and browser package scripts for non-documentation changes.
- [ ] GitHub protects `main` with pull requests and the authoritative fast and
      browser checks plus the required pull-request Stryker compatibility
      smoke.
- [ ] The required pull-request mutation check retains the `quality-mutation`
      name and does not repeat after merge on pushes to `main`.
- [ ] Native local CI preserves full-gate live output and periodic phase heartbeats.
- [ ] Optional container parity preserves Local CI job progress, failure, and retry semantics.
- [ ] Tooling tests rebuild and pack the private paper-import candidate
      reproducibly, enforce the reviewed tarball allowlist and checked release
      manifest, reject Node/npm drift without resolving nested tools through
      ambient `PATH`, and exercise both public exports from an isolated
      exact-Node-24 consumer.
- [ ] The isolated paper-import consumer round-trips prose ranges, constructs
      canonical preview identity, and extracts the PDF conformance fixture
      through a consumer-owned injected PDF.js runtime.
- [ ] Documentation-only changes can skip local CI when they do not alter executable behavior or workflow configuration.
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
- `npm run quality:gate` must preserve each child command's live output and emit a progress heartbeat at least every 30 seconds while that command is still running.
- Paper-import package verification must fail on nondeterministic staged bytes
  or tarballs, undeclared pack contents, non-ESM output, missing declarations,
  extra exports, parser dependencies beyond `fflate@0.8.3`, or imports outside
  `src/lib/paper-import/`.
- `npm run paper-import:pack` must launch build and pack operations through the
  npm lifecycle's explicit Node and npm executables, require the exact versions
  declared by the current append-only release manifest, and fail when package
  identity, filename, byte count, toolchain, or SHA-256 differs from that
  checked manifest.
- The package gate must verify PDF conformance using an injected consumer-owned
  PDF.js installation; `pdfjs-dist` must not become a package dependency.
- Affected guardrails must run the isolated package gate when paper-import
  source, package metadata, its package tsconfig, or its build/test harness
  changes.
- `npm run diagnostics:codebase` must remain advisory and must not be required by the baseline readiness path.
- `npm run diagnostics:dependencies` must read the lockfile and existing built
  artifacts without writing reports, and must support deterministic Markdown
  and JSON output.
- `npm run diagnostics:citation-providers` must remain read-only and advisory,
  accept explicit DOI overrides, and expose provider failures without turning
  them into repository-readiness failures.
- Pre-push must run Fallow only when affected JavaScript, TypeScript, package,
  or Fallow configuration inputs make its signal relevant.
- Passing pre-push diagnostics must keep inherited Fallow findings and individual
  surviving-mutant listings out of routine output while preserving tool exit
  status, health score, mutation progress, and final mutation score.
- Full and incremental Stryker runs must retain periodic progress plus HTML and
  JSON detail without printing every discovered test or undetected mutant. A
  newly finalized JSON report must produce a concise console summary even when
  Stryker exits non-zero for the configured threshold, and the wrapper must
  preserve that exit status.
- Bounded affected clear-text runs must omit the full related-test inventory
  while retaining undetected-mutant diffs, at most three relevant test names
  per survivor, and the final score table.
- `npm run mutation:report` must summarize the latest JSON report without
  starting Stryker or writing a second persisted report.
- Fallow diagnostics must use `--no-cache` in repo scripts so normal diagnostic runs do not create a persistent `.fallow/` cache.
- Fallow type-aware diagnostics must use the explicit root, browser, and
  Workers-test TypeScript projects with best-effort completeness, must remain
  advisory, and must not replace the repository's TypeScript compiler checks.
- Fallow's new-only changed-code audit must remain syntactic so branches that
  introduce or change semantic configuration are not compared against an
  incompatible type-aware baseline.
- Whole-repo Fallow health diagnostics must include advisory type-coupling
  evidence without changing the health score or baseline readiness gate.
- Fallow's new-only audit may create a temporary Git worktree to compare the
  branch with its upstream and must keep inherited findings advisory.
- Fallow must exclude generated Worker declarations from analysis and treat
  public members on `DurableObject` subclasses as runtime-invoked RPC surface.
- Fallow must register esbuild-only diagnostic/spike inputs and the unit-test
  Cloudflare runtime shim as entry points, and must not classify dependencies
  used exclusively by development scripts as production dependencies.
- Fallow may register a source-local library barrel as an entry point only when
  its feature spec defines that barrel as an intentional public contract;
  internal modules must not use that convention to hide unused exports.
- Fallow complexity and duplication diagnostics must exclude unit and end-to-end
  test files; test readability remains protected by formatting, linting,
  typechecking, and execution without penalizing deliberate exact-fixture
  repetition.
- `npm run mutation` must fail when the mutation score is below the configured break threshold.
- `npm run mutation:incremental` must fail when the resulting mutation score is below the configured break threshold.
- The base mutation break threshold must remain at the temporary whole-number
  Stryker 10 migration baseline of 63 measured from a complete 63.15% run,
  while the 80 and 90 warning bands continue to expose mutation debt. It stays
  blocking for full, affected, incremental, and pre-push mutation; a further
  reduction requires measured evidence and a new ADR, and test hardening should
  restore at least the prior 68 floor.
- A denominator-changing source delegation may recalibrate the aggregate break
  threshold only when the mutation surface remains unchanged and the measured
  score change is documented in an implemented ADR.
- `npm run mutation:incremental` must ignore static mutants to keep repeated
  local test-hardening proportionate, while the explicit `npm run mutation`
  audit must continue to test static mutants and retain the full configured
  reporters.
- `npm run mutation:affected` and `npm run mutation:incremental` must retain
  Stryker's mutation-time TypeScript checker so compile-invalid mutants are not
  counted as surviving or uncovered behavior.
- Pre-push must run affected mutation for configured mutation sources, map Node
  unit tests back to their source when it exists, and add the stable canary for
  mutation or test configuration changes. It must not force-refresh the full
  incremental report and must skip mutation for documentation-only or
  Worker-only changes.
- `npm run mutation:incremental:refresh` must remain available as the explicit
  manual full-surface incremental-cache refresh.
- `npm run mutation:ci` must require explicit full base and head commit SHAs,
  verify that both commits exist locally, and read added, copied, modified,
  renamed, and deleted status plus both rename paths from a NUL-delimited
  `git diff --name-status --diff-filter=ACMRD -z base...head` without falling
  back to a repository-wide mutation run.
- `npm run mutation:ci` must derive positive new/head-side line spans for
  surviving directly changed configured production sources from per-source
  zero-context diffs, passing both old and new paths with rename detection when
  a source moved. It must coalesce overlapping and adjacent spans and emit each
  as `file.ts:start-end`.
- A surviving directly changed source with any deletion-only hunk or no positive
  new-side span must become a full-file pattern; a deleted source must add no
  mutation pattern.
- `npm run mutation:ci` must map changed, deleted, or renamed Node unit tests to
  surviving full-file source counterparts only when those sources were not
  directly changed, and must add the stable always-full-file production canary
  when mutation configuration, the CI workflow, or affected-mutation routing
  changes, including deletions.
- Canary and deletion-safety full-file selection must dominate line ranges for
  the same source. A colocated test mapping applies only when its source was not
  directly changed, so a simultaneous source-and-test change does not widen
  safe direct ranges.
- `npm run mutation:ci` must succeed without starting Stryker when no production
  source or canary is selected.
- Pull-request mutation compatibility must invoke the clean non-incremental
  `npm run mutation:affected` path with an explicit mutate list,
  `--ignoreStatic`, `--dryRunOnly`, and console progress. Stryker must still
  select and instrument the requested production code, create its sandbox, set
  the worker environment, and complete its related initial Vitest run.
- Pull-request mutation compatibility must execute no mutant plans or
  per-mutant TypeScript checks, finalize no mutation-result report, or evaluate
  a score threshold. Any selector, instrumentation, sandbox, or initial-test
  error must fail the required check.
- The base Stryker break threshold of 63 must remain blocking for full,
  affected, incremental, and pre-push mutation runs.
- The GitHub `quality-mutation` job must run only for pull requests, retain its
  branch-protection check name, stop after 10 minutes, and not repeat on pushes
  to `main`.
- `npm install` must keep the repo-managed `pre-push` hook configured without requiring extra setup steps.
- The CI workflow must cancel superseded runs for the same ref.
- The CI workflow must support manual dispatch so trigger delivery can be
  diagnosed independently from workflow execution.
- The protected `main` branch must require an up-to-date pull request and the
  `quality-fast`, `quality-browser`, and `quality-mutation` checks from the
  GitHub Actions App.
- Branch protection must apply to administrators, require review conversations
  to be resolved, and disallow force pushes and branch deletion.
- Branch protection must not require approving reviews while the repository has
  only one maintainer.
- Cloudflare deployment checks must not become required quality checks without
  a separate quality-gate decision.
- The CI workflow must read the pinned Node version from `package.json` instead of a separate version file.
- The CI workflow must keep using npm for install and verification steps without depending on one exact npm patch release.
- The npm release used by CI must stay inside the supported npm range declared in `package.json`.
- CI jobs must install dependencies with plain `npm ci`.
- Optional container Local CI must rely on its built-in warm-cache serialization instead of repo-local install locking.
- The CI workflow must pin every GitHub Actions `uses:` action reference to a full commit SHA, with any tag information kept only as a comment.
- The browser CI job must use the pinned Playwright container instead of reinstalling Chromium at runtime.
- The coverage gate must only require unit tests when runtime `src/` code exists.
- The coverage gate must work in both the normal workspace and Local CI's warmed `node_modules` layout.
- The Worker client-code guard must fail on inline script blocks without a `src`, inline event-handler attributes, and `javascript:` URLs in Worker/view runtime files while allowing external scripts from the typed client build.
- The ADR registry guard must run in the fast gate and affected guardrails when
  ADR records, their index, or the validator change.
- The ADR registry guard must reject lifecycle status text outside Proposed,
  Accepted, Implemented, and explicit full or partial supersession forms.
- The affected guardrail path must pass only affected Worker/view runtime files to the Worker client-code guard.
- The affected guardrail path must run JavaScript syntax checks only for affected JavaScript files.
- The affected guardrail path must run package audit only when package metadata or lockfiles change.
- The affected guardrail path must skip unit tests when no runtime or unit test files are affected.
- The affected guardrail path must route Worker-reachable non-client source,
  Workers test files, and Workers test configuration to `npm run test:workers`.
- The Node affected-test path must never execute `*.workers.test.ts`; those files
  belong exclusively to the Workers runtime project.
- The Workers Vitest pool must keep `remoteBindings` disabled. A remote service
  integration belongs in an explicit diagnostic, not the local readiness gate.
- The affected test path must run full unit coverage when package metadata, TypeScript config, Vitest config, coverage-gate logic, or affected-test logic changes.
- The affected test path must run full unit coverage when affected-file helper logic changes.
- The affected test path must run full unit coverage when affected runtime files have no related tests and no affected unit test files were supplied.
- The affected guardrail path may fall back to project-level type checking or coverage when a safe per-file check is not available.
- The optional container CI script should use the repo-pinned `local-ci` binary directly instead of carrying repo-specific runtime patching or install locking.
- The optional container CI script must explicitly prewarm through the stable fast
  job install step before concurrent jobs receive isolated writable dependency
  views.
- The optional container CI script should use pause-on-failure so agents can fix and retry a failed runner without restarting the whole workflow.
- The optional container CI formatter must consume Local CI's versioned JSON event stream
  instead of matching human log text.
- The optional container CI formatter must preserve Local CI's final process exit code,
  attached pause-on-failure lifecycle, and retry command.
- The optional container CI formatter must report a heartbeat at least every 15 seconds while
  Local CI is running without an active step completion.
- The local verification workflow should document macOS as the supported host baseline instead of implying cross-platform support.
- The Playwright server path must avoid macOS file-watcher exhaustion in local runs without changing the normal `npm run dev` workflow.
- Playwright must ignore Stryker's generated `.stryker-tmp/` sandbox so an
  explicit mutation run cannot duplicate browser suites in a later gate.
- Browser tests that mutate durable state must create isolated workspaces rather
  than assume the shared demo workspace still contains seed data.
- The isolated Playwright server must override `ARTIFACT_ANALYSIS_MODE` to
  `disabled`; the committed Wrangler default must remain `enabled` so normal
  development and deployed queue consumers retain production behavior.
- The local CI documentation must cover the no-`origin` case through `.env.local-ci` and `GITHUB_REPO` instead of treating that warning as normal noise.
- The local CI Docker daemon override must use Local CI's `LOCAL_CI_DOCKER_HOST` variable instead of the general Docker CLI `DOCKER_HOST` variable.
- Local Playwright browser installation should go through a pinned repo script instead of ad hoc `npx playwright install ...` usage.
- Targeted checks may be documented for iteration, but `npm run ci:local` remains the readiness baseline for non-documentation changes.
- Documentation-only changes may skip `npm run ci:local` when they do not alter executable config, generated artifacts, package metadata, source code, or tests.
- Mutation testing must exclude colocated tests, end-to-end tests, declarations,
  test support, HTTP adapters covered by route plus end-to-end tests, and
  browser-runtime orchestration modules covered by Playwright. A browser
  orchestration module may be excluded only after its deterministic contracts
  are separated into Node-testable modules that remain in mutation scope. Pure
  domain and security logic called by excluded adapters remains in mutation
  scope.
- Unit coverage must apply the same browser-orchestration boundary: DOM wiring
  and presentation owners covered by Playwright may be excluded only while
  their deterministic contracts remain in Node-testable modules in coverage.
- Mutation testing must exclude dynamic browser runtime loaders because their
  versioned module boundaries are exercised by Playwright and expanding
  third-party runtime types during Stryker instrumentation exceeds Node's
  default heap.
- The mutation scripts must raise Node's heap ceiling enough for TypeScript-aware
  instrumentation without changing Stryker's score threshold or concurrency.
- Mutation testing must use the Vitest runner's per-test coverage analysis and related-test narrowing rather than an ad hoc minimization wrapper.
- Mutation testing must set Stryker worker concurrency as a percentage of available parallelism instead of a fixed worker count.
- GitHub Actions must run the bounded `npm run mutation:ci` selector for the
  required pull-request Stryker compatibility smoke instead of an incremental
  or repository-wide scored mutation run.
- Mutation reports and Stryker incremental data must be written under ignored `reports/`, and Stryker's temporary sandbox must stay under ignored `.stryker-tmp/`.
- Mutation sandboxes must not copy ignored `.wrangler/` runtime state; live
  SQLite WAL files are ephemeral application data, not mutation-test inputs.
- New workflow write targets must be documented when they are introduced.
- Manually created Fallow caches must stay ignored under `.fallow/`.
- Local cleanup must reject a symbolic-link cleanup root and must not broaden
  deletion from its reviewed target allowlist.

### Verification

- **Automated checks:** `npm run ci:local`
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
- Then: Fallow reports changed-code readability risk, type-aware cleanup
  evidence, health scoring, hotspots, duplication, and type coupling without
  replacing the baseline gate

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
- When: the contributor runs `npm run ci:local`
- Then: the fast and browser verification paths pass

**Scenario: Contributor diagnoses missing remote trigger delivery**

- Given: an expected push or pull-request workflow run was not created
- When: the contributor manually dispatches the CI workflow
- Then: GitHub Actions creates an observable run for the selected branch

**Scenario: Contributor updates main**

- Given: a contributor has a change ready to land
- When: they open a pull request targeting `main`
- Then: GitHub permits merge only after the branch is current, all three
  authoritative CI checks pass, and review conversations are resolved

**Scenario: Contributor monitors the full quality gate**

- Given: a full quality-gate phase takes long enough to appear idle
- When: the contributor runs `npm run quality:gate`
- Then: the gate names the active phase, preserves its live output, and reports
  elapsed time every 30 seconds until the phase completes or fails

**Scenario: Contributor watches native local progress**

- Given: a local workflow step takes longer than normal without producing logs
- When: the contributor runs `npm run ci:local`
- Then: fast and browser phase output remains visible and a heartbeat confirms
  a long-running phase is still active

**Scenario: Optional container workflow pauses on failure**

- Given: a Local CI workflow step fails
- When: `npm run ci:local:container` receives the paused-runner event
- Then: it prints the failed runner and retry command while Local CI remains
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

**Scenario: Contributor requests local mutation feedback**

- Given: Stryker has an existing incremental report under `reports/`
- When: the contributor runs `npm run mutation:incremental`
- Then: Stryker reuses valid prior mutant results and reruns affected mutants

**Scenario: GitHub verifies Stryker compatibility**

- Given: a pull request directly changes lines in a configured production source
- When: the `quality-mutation` job runs
- Then: `npm run mutation:ci` compares the explicit base and head commits and
  selects its coalesced new/head-side `file.ts:start-end` ranges, instruments
  them through clean non-incremental Stryker, and completes the related initial
  Vitest run inside a Stryker worker with static mutants ignored, progress
  output, no mutant execution or score, and a 10-minute bound

**Scenario: Pull-request mutation compatibility fails**

- Given: selection, instrumentation, sandbox creation, or the initial Vitest run
  fails for the selected pull-request scope
- When: `npm run mutation:ci` runs the compatibility smoke
- Then: the required `quality-mutation` check fails without executing mutant
  plans

**Scenario: Pull request changes only a Node unit test**

- Given: a pull request changes, deletes, or renames a colocated Node unit test
  but not its surviving configured production counterpart
- When: `npm run mutation:ci` selects its scope
- Then: it selects and instruments the mapped production source as a full-file
  pattern

**Scenario: Direct source change has no new lines**

- Given: a surviving directly changed configured production source has any
  deletion-only hunk or no positive new-side span
- When: `npm run mutation:ci` selects its scope
- Then: it selects and instruments that source as a full-file safety fallback

**Scenario: Pull request deletes a production source**

- Given: a pull request deletes a configured production source
- When: `npm run mutation:ci` selects its scope
- Then: the deleted source contributes no mutation pattern because no head-side
  file remains

**Scenario: Pull request has no mutation scope**

- Given: a pull request changes no configured production source, mapped Node
  unit test, mutation configuration, or mutation routing input
- When: `npm run mutation:ci` selects its scope
- Then: the required `quality-mutation` check succeeds without starting Stryker

**Scenario: Pull request changes mutation routing**

- Given: a pull request changes, renames, or deletes mutation configuration, the
  CI workflow, or an affected-mutation routing script
- When: `npm run mutation:ci` selects its scope
- Then: it includes the stable production canary as a full-file pattern instead
  of returning a vacuous success or expanding other sources to full files

**Scenario: Pull-request commit is unavailable**

- Given: the explicit mutation base or head is malformed or unavailable in the
  checkout
- When: `npm run mutation:ci` validates the pull-request range
- Then: the required check fails with the invalid commit instead of starting a
  repository-wide mutation run

**Scenario: Pull request merges to main**

- Given: the pull request passed the required `quality-mutation` check
- When: its merge commit triggers the `main` push workflow
- Then: GitHub does not repeat the mutation job

**Scenario: Contributor adds browser behavior to a Worker view**

- Given: a Worker-rendered view needs browser-side behavior
- When: the contributor adds inline executable browser code to `src/worker.ts` or `src/views/**/*.ts`
- Then: the fast quality gate fails and points them toward typed TypeScript modules instead

**Scenario: Contributor pushes with a broken fast gate**

- Given: the repo was bootstrapped with `npm install`
- When: the contributor runs `git push` while the fast gate is red
- Then: the `pre-push` hook runs affected-file guardrails and any relevant
  Fallow and targeted mutation checks, and the push is blocked before remote
  CI starts

**Scenario: New push supersedes an old CI run**

- Given: a newer push exists on the same ref
- When: GitHub Actions schedules the new workflow run
- Then: the older in-progress run is canceled instead of continuing to consume time

**Scenario: Contributor audits remote action references**

- Given: the remote CI workflow uses reusable GitHub Actions
- When: the contributor reviews `.github/workflows/ci.yml`
- Then: every `uses:` action reference points at a full commit SHA instead of a mutable tag
