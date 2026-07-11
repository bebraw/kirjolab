# Development

This document collects development-facing setup and workflow notes for the template.

## Agent Context

The template vendors the ASDLC knowledge base in `.asdlc/`.

- Start with `.asdlc/SKILL.md` for ASDLC concepts, patterns, and practices.
- Use `AGENTS.md` as the Codex-native context anchor for this repo.

## Local CI

This template is set up for the local Agent CI runner from `agent-ci.dev`.

### Prerequisites

- Local development in this template targets macOS. The documented commands assume a macOS shell environment and are not maintained as a cross-platform baseline.
- Run `nvm use` before `npm install` or any other development command so your shell uses the Node.js version mirrored in `.nvmrc`, which also keeps the bundled npm release inside the repo's supported npm 11 range.
- Install dependencies with `npm install`.
- `npm install` also configures the repo-managed Git hook path and enables the `pre-push` hook that runs affected-file guardrails.
- The exact Node.js version is pinned in `package.json`, mirrored in `.nvmrc` for `nvm` users, and read directly by CI through `actions/setup-node`.
- The repo requires npm 11 in `package.json` but does not pin one exact patch release. Local development, CI, and platforms such as Cloudflare may use different npm 11 patch versions as long as they stay inside the supported major range.
- Copy `.dev.vars.example` to `.dev.vars` and replace placeholder values when a project needs local secrets.
- Copy `.env.agent-ci.example` to `.env.agent-ci` when you need machine-local Agent CI overrides. Agent CI loads that file automatically.
- If your clone has no `origin` remote, set `GITHUB_REPO=owner/repo` in `.env.agent-ci` to stop Agent CI from warning while inferring the repository name.
- If Agent CI needs a non-default Docker socket or daemon, set `AGENT_CI_DOCKER_HOST=...` in `.env.agent-ci`.
- Start a Docker runtime before running Agent CI.
- Install the GitHub Actions runner image once with `docker pull ghcr.io/actions/actions-runner:latest`.

The repo pins CLI tooling in `devDependencies`, including Wrangler for Cloudflare-based experiments. Prefer invoking those tools through `npx` or repo scripts so the project version is used instead of a global install.

If local CI fails with `No such image: ghcr.io/actions/actions-runner:latest`, pull that image manually and re-run the workflow.

If local CI warns with `No such remote 'origin'`, add `GITHUB_REPO=owner/repo` to `.env.agent-ci` and rerun the workflow.

### Commands

- Run the quiet local workflow with Agent CI parallelism, warm-cache serialization, and pause-on-failure using `npm run ci:local`.
- Rebuild the generated stylesheet manually with `npm run build:css`.
- Rebuild the pinned Satteri WASM and helper-worker deployment assets with `npm run build:satteri-assets`.
- Run the fast local gate with `npm run quality:gate:fast`.
- Run the baseline quality gate with `npm run quality:gate`.
- Run advisory codebase readability diagnostics with `npm run diagnostics:codebase`.
- Run the shipped runtime dependency audit with `npm run security:audit`.
- Start the local Worker with `npm run dev`.
- Install the Playwright browser with `npm run playwright:install`.
- Run end-to-end tests with `npm run e2e`.
- Run unit and integration tests with `npm test`.
- Run Durable Object integration tests in the local Workers runtime with
  `npm run test:workers`.
- Run tests related to affected runtime or unit test files with `npm run test:affected`.
- Run the unit coverage gate with `npm run test:coverage`.
- Run full mutation tests with `npm run mutation`.
- Run incremental mutation tests with `npm run mutation:incremental`.
- Run TypeScript checks with `npm run typecheck`.
- Run Lighthouse with `LIGHTHOUSE_URL=http://127.0.0.1:8787 LIGHTHOUSE_SERVER_COMMAND="npm run dev" npm run lighthouse`.
- Format the repo with `npm run format`.
- Check formatting with `npm run format:check`.
- If a run pauses on failure, fix the issue and resume with `npm run ci:local:retry -- --name <runner-name>`.

Use targeted checks while iterating, then run the full readiness path before proposing or landing a change:

- Docs-only changes: `npm run format:check`
- TypeScript or typed tooling changes: `npm run typecheck`
- Runtime `src/` changes while iterating: `npm run typecheck` and `npm run test:affected`
- Durable Object migration, transaction, RPC, or eviction changes:
  `npm run typecheck:workers` and `npm run test:workers`
- Browser behavior or UI changes: `npm run quality:gate`
- Readability, complexity, duplication, or cleanup review: `npm run diagnostics:codebase`
- Baseline readiness: `npm run quality:gate` and `npm run ci:local`

The template now ships with a minimal Worker stub in `src/worker.ts`. `npm run dev` starts it on `http://127.0.0.1:8787`, and Playwright uses `npm run e2e:server` on `http://127.0.0.1:8788` so browser tests can run without extra setup. The e2e server forces Chokidar polling mode to avoid file-watcher exhaustion in macOS-hosted local runs while preserving the normal `npm run dev` developer loop. API modules live under `src/api/`, view modules live under `src/views/`, and tests are colocated under `src/`.

The GitHub Actions CI workflow splits fast checks, browser checks, and mutation checks into separate jobs, reads the pinned Node version from `package.json`, relies on the npm release bundled with that Node setup as long as it satisfies the repo's npm 11 constraint, runs repository-shape validation as part of the fast job, runs the browser job in the version-pinned Playwright container image `mcr.microsoft.com/playwright:v1.61.1-noble`, pins every `uses:` action reference to a full commit SHA, and cancels superseded runs on the same ref. The full `quality-mutation` workflow job is reserved for GitHub Actions with a `github.server_url` guard, so local Agent CI runs skip it; use `npm run quality:gate` or `npm run mutation` when local mutation feedback is needed. Dependency installation uses plain `npm ci`; local Agent CI serializes the first cold warm-cache job internally, which keeps parallel jobs from racing on the mounted `node_modules` cache while avoiding unnecessary npm self-upgrades in CI and mutable action tags.

The starter UI now follows the same Tailwind v4 baseline shape as `thesis-journey-tracker`: Tailwind input lives in `src/tailwind-input.css`, generated CSS is written to `.generated/styles.css`, and Wrangler runs `npm run build:css` automatically before local development.

The Lighthouse setup is also generic, but the Worker stub gives it a concrete local target. Use `LIGHTHOUSE_URL=http://127.0.0.1:8787 LIGHTHOUSE_SERVER_COMMAND="npm run dev" npm run lighthouse`. Reports are written to `reports/lighthouse/`.

The Node Vitest setup remains the fast home for pure logic. `vitest.config.ts`
targets colocated `src/**/*.test.ts` files while excluding end-to-end and
Workers-runtime tests. The default `npm test` command uses `--passWithNoTests`
so the template remains usable before a project adds its first test file.

Durable Object integration tests use the separate
`vitest.workers.config.mts`, select `src/**/*.workers.test.ts`, and receive their
test-only types through `tsconfig.workers-test.json`. Run them with
`npm run test:workers`; the command first rebuilds the Satteri deployment assets
referenced by `wrangler.jsonc` before the Cloudflare Vitest integration starts a
local `workerd` runtime. The project pins
`@cloudflare/vitest-pool-workers` 0.18.4 alongside Vitest 4.1.8. Each test gets
isolated local storage and can use `cloudflare:test` to inspect private Durable
Object SQLite state or evict an instance while retaining persisted storage.
These tests never contact deployed Cloudflare resources.

Keep persistence ownership explicit: Node tests cover pure parsers, selectors,
projections, text-splice helpers, and migration-definition validation. Workers
tests cover real SQLite migrations and rollback, atomic materialization,
Durable Object RPC, and reconstruction after eviction. A Node storage substitute
is useful for fast feedback but is not sufficient evidence for those platform
contracts.

`npm run quality:affected` treats Worker-reachable non-client source,
Workers-test files and configuration, and Satteri deployment-asset inputs as
Workers test inputs and routes them to `npm run test:workers`. The Node
related-test and coverage selectors explicitly exclude `*.workers.test.ts`, so
an affected run never executes a platform test under the wrong runtime. The
full readiness gates still run both projects.

The coverage gate is stricter than the basic test run. `npm run test:coverage` measures runtime `src/**` code with the V8 provider, writes reports to `reports/coverage/`, and enforces high thresholds once a project actually has `src/` code. Colocated unit tests, end-to-end tests, and test-support files do not count as source files for the gate's skip-or-fail logic. `npm run test:affected` runs Vitest related tests for affected runtime files and directly runs affected unit test files. It falls back to `npm run test:coverage` when affected files include test environment inputs or when affected runtime files have no related tests.

Mutation testing uses Stryker with Vitest and the TypeScript checker. `npm run mutation` performs a full mutation run against runtime `src/**/*.ts` files while excluding declarations, unit tests, end-to-end tests, and `src/test-support.ts`. `npm run mutation:incremental` enables Stryker incremental mode so repeated local quality-gate runs can reuse previous mutant results while still producing a complete mutation report. The Vitest runner uses Stryker's per-test coverage analysis and related-test narrowing, so each mutant runs against the tests Stryker can associate with the mutated file instead of blindly rerunning the whole suite. Stryker worker concurrency is set to `50%` so mutation testing can use parallel workers without assuming a fixed core count for every clone of the template. Mutation reports and Stryker incremental data are written under `reports/`, and Stryker's temporary `.stryker-tmp/` sandbox must stay untracked.

The TypeScript setup is generic too. `tsconfig.json` covers repo-level `.ts` files and `src/**/*.ts`, and `npm run typecheck` runs TypeScript 7. During the TypeScript 7.0 transition, `typescript` is intentionally pinned to the `@typescript/typescript6` compatibility package for tools that import the compiler API, while `typescript-7` provides the compiler used by the typecheck script.

Fallow provides advisory codebase readability diagnostics. `npm run diagnostics:readability` runs a changed-code audit for complexity, duplication, dependency hygiene, and cleanup findings while relaxing CRAP-score noise from untested tooling scripts. `npm run diagnostics:health` reports whole-repo health scoring, hotspots, and refactoring targets. `npm run diagnostics:codebase` runs both. These commands use `--no-cache`, so normal diagnostics do not create a persistent `.fallow/` cache. If a contributor runs cached Fallow commands manually, `.fallow/` is ignored and should stay untracked.

The README includes a committed application screenshot at `docs/screenshots/home.png`. Refresh that asset manually when the starter UI changes materially, but keep screenshot capture out of the automated development loop, CI, and remote workflows.

Template update packs live under `.template/updates/`. Use them to port later template maintenance changes into projects that already use this template or one of its capability kits. Each pack has metadata, a migration guide, and a focused patch to try first; when the patch does not apply cleanly, use the guide to adapt the change to the target project's conventions.

## Write Boundaries

Keep workflow write targets explicit and documented. Generated CSS and browser bundles belong in `.generated/`; generated Satteri WASM and helper-worker deployment assets belong in `.generated/assets/`; Lighthouse reports belong in `reports/lighthouse/`; coverage reports belong in `reports/coverage/`; mutation reports belong in `reports/mutation/`; Stryker temporary sandboxes belong in `.stryker-tmp/`; optional Fallow caches belong in ignored `.fallow/`; Agent CI local caches belong under Agent CI's managed cache directory; template update packs belong in `.template/updates/`; the committed README screenshot belongs in `docs/screenshots/`; and local secrets belong in untracked files such as `.dev.vars` or `.env.agent-ci`.

When adding a new tool or workflow that writes files, document the target path in the same change and prefer ignored local output unless the artifact is intentionally reviewed.

## Security Baseline

The template keeps secret handling lightweight and explicit:

- Keep local secrets in untracked files such as `.dev.vars`.
- Commit example files such as `.dev.vars.example` with placeholder values only.
- Treat `npm run security:audit` as part of the baseline gate for shipped runtime dependencies.

## Quality Gate

Use this expectation for routine changes:

- `npm run quality:gate` must pass before a change is considered ready.
- Use `npm run quality:gate:fast` for quicker local iteration when browser coverage is not the immediate focus.
- `npm run ci:local` should also pass before proposing or landing the change.
- The repo-managed `pre-push` hook runs `npm run quality:affected` automatically after `npm install`, so pushes stop locally when affected guardrails are already red.

The quality gate currently runs the fast gate first, then the Playwright browser
tests, then incremental mutation tests for faster repeated local runs. The fast
gate includes both Node coverage and `npm run test:workers`, so the baseline and
local Agent CI cannot omit real Durable Object persistence verification. GitHub
Actions runs separate fast, browser, and full mutation jobs, with
repository-shape validation included in the fast job. Local Agent CI runs
should go through `npm run ci:local`, which lets Agent CI run independent jobs
concurrently while its own warm-cache serialization protects the shared
`node_modules` mount during cold installs. The command also pauses a failed
runner for agent retry. Local browser installation should go through the pinned
`npm run playwright:install` script.
