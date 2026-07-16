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

### GitHub App sync

GitHub-backed projects use one deployment-wide GitHub App with a separate,
owner-scoped GitHub user connection. Set `GITHUB_APP_ID`,
`GITHUB_APP_CLIENT_ID`, and `GITHUB_APP_SLUG` as Worker variables. Configure the
App callback URL as `/api/github/callback` and its setup URL as
`/api/github/setup`. Keep the PEM, client secret, and connection encryption key
out of Wrangler configuration:

```sh
npx wrangler secret put GITHUB_APP_PRIVATE_KEY
npx wrangler secret put GITHUB_APP_CLIENT_SECRET
npx wrangler secret put GITHUB_CONNECTION_ENCRYPTION_KEY
```

Generate `GITHUB_CONNECTION_ENCRYPTION_KEY` as 32 random bytes encoded with
base64 or base64url. GitHub user and refresh tokens are encrypted with that key;
changing it disconnects stored connections unless they are migrated first.

For local development only, copy `.dev.vars.example` to the ignored `.dev.vars` and place the same values there. The App installation needs repository metadata read access and repository contents read/write access. Kirjolab reads only supported Markdown below the user-selected repository root and publishes with a non-forced branch update.

If local CI fails with `No such image: ghcr.io/actions/actions-runner:latest`, pull that image manually and re-run the workflow.

If local CI warns with `No such remote 'origin'`, add `GITHUB_REPO=owner/repo` to `.env.agent-ci` and rerun the workflow.

### Commands

- Run the local workflow with job and step progress, 15-second heartbeats during
  long operations, isolated parallel jobs, and pause-on-failure using
  `npm run ci:local`.
- Rebuild the generated stylesheet manually with `npm run build:css`.
- Rebuild the versioned JavaScript Markdown runtime with `npm run build:markdown-runtime`.
- Run the fast local gate with `npm run quality:gate:fast`.
- Run the baseline quality gate with `npm run quality:gate`.
- Run advisory codebase readability diagnostics with `npm run diagnostics:codebase`.
- Run the shipped runtime dependency audit with `npm run security:audit`.
- Start the local Worker and configured model companion with `npm run dev`.
- Copy `.env.example` to the ignored `.env` to enable the companion; use
  `npm run model:companion` only for standalone troubleshooting.
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
- Regenerate committed Worker bindings with `npm run worker:types`; this
  intentionally ignores `.env` and `.dev.vars` so output is reproducible.
- Check committed Worker bindings without rewriting them with
  `npm run worker:types:check`.
- Run Lighthouse with `LIGHTHOUSE_URL=http://127.0.0.1:8787 LIGHTHOUSE_SERVER_COMMAND="npm run dev" npm run lighthouse`.
- Format the repo with `npm run format`.
- Check formatting with `npm run format:check`.
- Run default Oxlint correctness checks with `npm run lint`.
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

The template now ships with a minimal Worker stub in `src/worker.ts`. `npm run dev` supervises the Worker on `http://127.0.0.1:8787` and, when configured, the model companion on `http://127.0.0.1:8790`; stopping either process stops the other. Playwright uses `npm run e2e:server` on `http://127.0.0.1:8788` so browser tests can run without extra setup or a model process. The e2e launcher forces Chokidar polling mode to avoid file-watcher exhaustion in macOS-hosted local runs and gives Wrangler a fresh operating-system temporary persistence directory that it removes on shutdown. Browser-created workspaces therefore cannot accumulate in the interactive `npm run dev` catalog. API modules live under `src/api/`, view modules live under `src/views/`, and tests are colocated under `src/`.

`npm run format:check` covers project-owned source, configuration, skill
entrypoints, specs, ADRs, and documentation. It excludes duplicated
`.github/skills/` content and vendored `.codex/skills/**/references/` material,
whose source projects own their formatting.

The formatting check caches successful results by content under
`.cache/prettier`. Repeated local gates can skip unchanged files without
trusting timestamps across branch switches. The cache is disposable and
ignored; clean CI runners perform a cold check rather than restoring it.

`npm run lint` applies Oxlint's default correctness rules with warnings treated
as failures. It complements Prettier's formatting ownership and TypeScript's
type checking instead of replacing either tool.

The GitHub Actions CI workflow splits fast checks, browser checks, and mutation checks into separate jobs, reads the pinned Node version from `package.json`, relies on the npm release bundled with that Node setup as long as it satisfies the repo's npm 11 constraint, runs repository-shape validation as part of the fast job, runs the browser job in the version-pinned Playwright container image `mcr.microsoft.com/playwright:v1.61.1-noble`, pins every `uses:` action reference to a full commit SHA, and cancels superseded runs on the same ref. The full `quality-mutation` workflow job is reserved for GitHub Actions with a `github.server_url` guard, so local Agent CI runs skip it; use `npm run mutation:incremental` or `npm run mutation` explicitly when local mutation feedback is needed. Dependency installation uses plain `npm ci`. Local Agent CI 0.17.1 explicitly prewarms through the fast job's stable `install` step, then gives concurrent jobs isolated writable dependency views. The local wrapper consumes Agent CI's versioned JSON events and reports each job and step with elapsed time, including a heartbeat every 15 seconds; it does not duplicate, reorder, or omit workflow checks.

The starter UI now follows the same Tailwind v4 baseline shape as `thesis-journey-tracker`: Tailwind input lives in `src/tailwind-input.css`, generated CSS is written to `.generated/styles.css`, and Wrangler runs `npm run build:css` automatically before local development.

The offline authoring service worker is compiled from
`src/client/service-worker.ts` into `.generated/service-worker.txt`. The Worker
serves that generated artifact at `/service-worker.js`; like the generated CSS,
the local output is disposable and ignored by Git.

### Local Model Companion

Use the companion only when the configured local provider cannot accept the
browser request directly. Starting it is the explicit permission boundary.
Create the ignored local configuration once:

```sh
cp .env.example .env
npm run dev
```

The development supervisor loads `.env`, starts the companion only when
`KIRJOLAB_MODEL_UPSTREAM` is configured, and removes all `KIRJOLAB_MODEL_*`
values from the Worker child environment. It also disables Wrangler's automatic
`.env` discovery for Worker development and tests, keeping `.dev.vars` as the
Worker-local configuration path. The standalone companion command loads the
same file for troubleshooting. Explicit shell variables take precedence over
matching `.env` entries.

It listens on `127.0.0.1:8790` unless
`KIRJOLAB_MODEL_COMPANION_PORT` selects another valid port. The upstream is
fixed at process start and must be a credential-free HTTP(S) loopback URL. The
browser origin must match exactly; wildcard origins and browser-selected
upstreams are not supported. For a configured loopback origin, `localhost`,
`127.0.0.1`, and `::1` are accepted as equivalent host aliases only when the
scheme and port match, so opening the local Worker through either common name
does not create a false CORS failure. In Kirjolab choose **Local companion**, which uses
`http://127.0.0.1:8790/v1/chat/completions` by default. `GET /health` reports
only availability and the upstream origin, not its path or model request data.
The companion also exposes bounded `GET /v1/models` discovery derived from the
fixed upstream completion route; it cannot select another upstream.
Stopping the Worker or companion stops the supervised development session so a
half-running local stack is not left behind.

#### Connect the Deployed App to a Local Model

The deployed Kirjolab app may use the companion running on the same computer as
the browser. Configure the ignored project-root `.env` with the local completion
endpoint and the deployed app's exact origin:

```dotenv
KIRJOLAB_MODEL_UPSTREAM=http://127.0.0.1:1234/v1/chat/completions
KIRJOLAB_MODEL_COMPANION_ORIGIN=https://write.example.com
```

The companion origin contains only the scheme and hostname, plus a port when it
is non-default. Do not include a trailing slash, route, or query parameters.
Restart `npm run model:companion` after changing `.env`; the running process does
not reload configuration. Then select **Local companion** in the deployed app
and use **Find loaded models**.

The companion binds only to `127.0.0.1`, so the deployed app and model may be
remote while the browser, companion, and local model must share one computer.
For example, an iPad browser cannot reach a companion running on a Mac through
this path. Keep Worker-only local secrets in `.dev.vars`; the companion settings
belong in `.env` and are never deployed.

The Lighthouse setup is also generic, but the Worker stub gives it a concrete local target. Use `LIGHTHOUSE_URL=http://127.0.0.1:8787 LIGHTHOUSE_SERVER_COMMAND="npm run dev" npm run lighthouse`. Reports are written to `reports/lighthouse/`.

The Node Vitest setup remains the fast home for pure logic. `vitest.config.ts`
targets colocated `src/**/*.test.ts` files while excluding end-to-end and
Workers-runtime tests. The default `npm test` command uses `--passWithNoTests`
so the template remains usable before a project adds its first test file.

Durable Object integration tests use the separate
`vitest.workers.config.mts`, select `src/**/*.workers.test.ts`, and receive their
test-only types through `tsconfig.workers-test.json`. Run them with
`npm run test:workers`; the Cloudflare Vitest integration starts a local
`workerd` runtime. The project pins
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
Workers-test files and configuration as Workers test inputs and routes them to
`npm run test:workers`. The Node
related-test and coverage selectors explicitly exclude `*.workers.test.ts`, so
an affected run never executes a platform test under the wrong runtime. The
full readiness gates still run both projects.

The coverage gate is stricter than the basic test run. `npm run test:coverage` measures runtime `src/**` code with the V8 provider, writes reports to `reports/coverage/`, and enforces high thresholds once a project actually has `src/` code. Colocated unit tests, end-to-end tests, and test-support files do not count as source files for the gate's skip-or-fail logic. `npm run test:affected` runs Vitest related tests for affected runtime files and directly runs affected unit test files. It falls back to `npm run test:coverage` when affected files include test environment inputs or when affected runtime files have no related tests.

Mutation testing uses Stryker with Vitest and the TypeScript checker. `npm run mutation` performs a full mutation run against runtime `src/**/*.ts` files while excluding declarations, unit tests, end-to-end tests, and `src/test-support.ts`. `npm run mutation:incremental` enables Stryker incremental mode so repeated local quality-gate runs can reuse previous mutant results while still producing a complete mutation report. The local incremental command ignores static mutants because they require disproportionately expensive fresh test environments; the clean GitHub mutation job continues to run them through `npm run mutation`, so the authoritative mutation score retains full coverage. The Vitest runner uses Stryker's per-test coverage analysis and related-test narrowing, so each runtime mutant runs against the tests Stryker can associate with the mutated file instead of blindly rerunning the whole suite. Stryker worker concurrency is set to `50%` so mutation testing can use parallel workers without assuming a fixed core count for every clone of the template. Mutation reports and Stryker incremental data are written under `reports/`, and Stryker's temporary `.stryker-tmp/` sandbox must stay untracked. Ignored `.wrangler/` runtime state is excluded from the sandbox so live SQLite WAL files cannot race its copy.

The TypeScript setup is generic too. `tsconfig.json` covers repo-level `.ts` files and `src/**/*.ts`, and `npm run typecheck` runs TypeScript 7. During the TypeScript 7.0 transition, `typescript` is intentionally pinned to the `@typescript/typescript6` compatibility package for tools that import the compiler API, while `typescript-7` provides the compiler used by the typecheck script.

Fallow provides advisory codebase readability diagnostics. `npm run diagnostics:readability` runs a changed-code audit for complexity, duplication, dependency hygiene, and cleanup findings while relaxing CRAP-score noise from untested tooling scripts. `npm run diagnostics:health` reports whole-repo health scoring, hotspots, and refactoring targets. `npm run diagnostics:codebase` runs both. These commands use `--no-cache`, so normal diagnostics do not create a persistent `.fallow/` cache. If a contributor runs cached Fallow commands manually, `.fallow/` is ignored and should stay untracked.

The README includes a committed application screenshot at `docs/screenshots/home.png`. Refresh that asset manually when the starter UI changes materially, but keep screenshot capture out of the automated development loop, CI, and remote workflows.

Template update packs live under `.template/updates/`. Use them to port later template maintenance changes into projects that already use this template or one of its capability kits. Each pack has metadata, a migration guide, and a focused patch to try first; when the patch does not apply cleanly, use the guide to adapt the change to the target project's conventions.

## Write Boundaries

Keep workflow write targets explicit and documented. Generated CSS and browser bundles belong in `.generated/`, including versioned Markdown and PDF runtime assets under `.generated/assets/`; Lighthouse reports belong in `reports/lighthouse/`; coverage reports belong in `reports/coverage/`; mutation reports belong in `reports/mutation/`; Stryker temporary sandboxes belong in `.stryker-tmp/`; Prettier's disposable content cache belongs in ignored `.cache/prettier`; optional Fallow caches belong in ignored `.fallow/`; Agent CI local caches belong under Agent CI's managed cache directory; template update packs belong in `.template/updates/`; and local secrets belong in untracked files such as `.dev.vars` or `.env.agent-ci`.

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

The quality gate runs the fast gate first, then the Playwright browser tests.
Mutation testing is explicit locally and remains authoritative in its clean
GitHub Actions job. The gate prints named
phase transitions and an elapsed-time heartbeat every 30 seconds while a phase
is still running, while preserving each child command's live output. The fast
gate includes both Node coverage and `npm run test:workers`, so the baseline and
local Agent CI cannot omit real Durable Object persistence verification. GitHub
Actions runs separate fast, browser, and full mutation jobs, with
repository-shape validation included in the fast job. Local Agent CI runs
should go through `npm run ci:local`, which executes the same workflow with
isolated parallel jobs, reports structured job and step progress, and prints a
heartbeat during long-running steps. The command preserves Agent CI's
pause-on-failure exit behavior and retry command. Local browser installation
should go through the pinned `npm run playwright:install` script.
