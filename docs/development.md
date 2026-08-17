# Development

This document collects development-facing setup and workflow notes for
Kirjolab. The repository retains reusable `vibe-template` maintenance
conventions, but its runtime and feature contracts describe the Kirjolab
product.

## Agent Context

The repository vendors the ASDLC knowledge base in `.asdlc/`.

- Start with `.asdlc/SKILL.md` for ASDLC concepts, patterns, and practices.
- Use `AGENTS.md` as the Codex-native context anchor for this repo.

## Local CI

Routine local CI runs natively on the supported macOS host. The pinned Agent CI
runner from `agent-ci.dev` remains available for optional workflow and Linux
container parity.

### Prerequisites

- Local Kirjolab development targets macOS. The documented commands assume a macOS shell environment and are not maintained as a cross-platform baseline.
- Run `nvm use` before `npm install` or any other development command so your shell uses the Node.js version mirrored in `.nvmrc`, which also keeps the bundled npm release inside the repo's supported npm 11 range.
- Install dependencies with `npm install`.
- `npm install` also configures the repo-managed Git hook path and enables the `pre-push` hook that runs affected-file guardrails.
- The exact Node.js version is pinned in `package.json`, mirrored in `.nvmrc` for `nvm` users, and read directly by CI through `actions/setup-node`.
- The repo requires npm 11 in `package.json` but does not pin one exact patch release. Local development, CI, and platforms such as Cloudflare may use different npm 11 patch versions as long as they stay inside the supported major range.
- Copy `.dev.vars.example` to `.dev.vars` and replace placeholder values when a project needs local secrets.
- Copy `.env.agent-ci.example` to `.env.agent-ci` only when you need machine-local overrides for optional container parity. Agent CI loads that file automatically.
- If your clone has no `origin` remote, set `GITHUB_REPO=owner/repo` in `.env.agent-ci` to stop Agent CI from warning while inferring the repository name.
- If Agent CI needs a non-default Docker socket or daemon, set `AGENT_CI_DOCKER_HOST=...` in `.env.agent-ci`.
- Start a Docker runtime before running Agent CI.
- Install the GitHub Actions runner image once with `docker pull ghcr.io/actions/actions-runner:latest`.

The repo pins CLI tooling in `devDependencies`, including Wrangler for Cloudflare-based experiments. Prefer invoking those tools through `npx` or repo scripts so the project version is used instead of a global install.

## Docker Compose Evaluation

The repository root contains an evaluation-only Compose distribution. It is a
way to try Kirjolab, not the macOS source-development baseline or the optional
Agent CI container. From a clean checkout, Docker supplies the pinned Node.js
runtime and all application dependencies:

```sh
docker compose up --build
```

Compose builds `Dockerfile`, starts one non-root `kirjolab` service, publishes
only `127.0.0.1:8787`, and reports health through `/api/health`. The dedicated
`wrangler.self-host.jsonc` profile runs entirely locally with artifact analysis
disabled. It contains no remote binding, Cloudflare credential, queue, cron,
Browser Rendering, Workers AI, Access, or version-metadata configuration. The
container may listen on `0.0.0.0` inside its private Docker network; the Compose
port mapping is the required host-side loopback boundary.

The `kirjolab-data` named volume owns local Durable Object SQLite and R2
simulation state. These commands preserve it:

```sh
docker compose down
docker compose up --build --detach
docker compose restart kirjolab
```

After changing to an updated checkout, rebuild the image with
`docker compose up --build`; Compose reuses the named volume. Export important
Markdown and BibTeX before upgrades because the internal Miniflare directory is
not a supported backup, interchange format, or future native self-host storage
layout.

Use `docker compose ps` to inspect health and `docker compose logs --follow
kirjolab` to inspect startup. If port 8787 is already allocated, stop the
ordinary `npm run dev` Worker or other process using that port before starting
Compose. A clean image rebuild is available through `docker compose build
--no-cache`. The destructive reset is:

```sh
docker compose down --volumes
```

That command permanently removes all evaluation state in the named volume.
The profile deliberately supports one local researcher and one replica only;
do not expose it through a LAN address, reverse proxy, tunnel, or public
hostname, and do not rely on it for multiplayer, high availability, scheduled
backup, or production recovery.

### Package promotion gates

Keep a reusable capability source-local until an architectural review shows
that package boundaries solve a demonstrated build or dependency problem. Under
[ADR-186](./adrs/implemented/ADR-186-promote-source-modules-through-evidence-gates.md),
ordinary reuse within Kirjolab is not enough.

Before adding a private npm workspace package, verify all of the following:

- two independently built repository executables consume the capability;
- neither tests, fixtures, examples, spikes, nor compatibility facades are being
  counted as the second consumer;
- the proposed entry point is cohesive, typed, documented, and independent of
  unrelated Kirjolab authorities;
- extraction removes duplicate mechanics or enforces a measured dependency or
  runtime boundary;
- exported-contract tests, every consumer, the root quality gate, and dependency
  diagnostics cover the new build unit; and
- an ADR names the owner, compatibility policy, and reversal path.

Start an approved workspace package as private with explicit exports. Do not add
registry or release configuration at this stage.

Before public publication, additionally require a maintained external consumer
or user-approved named adopter, semantic-versioning and deprecation policy,
package documentation and compatible licensing, a supported runtime matrix, a
security reporting path, an inspected `npm pack` tarball, reproducible test and
build evidence, and a named release owner. Approve registry credentials,
provenance, and release automation in a separate ADR before publishing.

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

If optional container parity fails with `No such image: ghcr.io/actions/actions-runner:latest`, pull that image manually and re-run the workflow.

If optional container parity warns with `No such remote 'origin'`, add `GITHUB_REPO=owner/repo` to `.env.agent-ci` and rerun the workflow.

### Commands

- Run the native local readiness gate with live phase output using
  `npm run ci:local`.
- Run the GitHub Actions workflow in Agent CI containers only when Linux or
  workflow-orchestration parity matters using `npm run ci:local:container`.
- Rebuild the generated stylesheet manually with `npm run build:css`.
- Rebuild the content-fingerprinted application, service worker, Markdown
  runtime, and PDF.js runtime together with `npm run build:browser-shell` after
  the stylesheet exists. `npm run build` preserves the required order.
- Run the fast local gate with `npm run quality:gate:fast`.
- Run the baseline quality gate with `npm run quality:gate`.
- Run advisory codebase readability diagnostics with `npm run diagnostics:codebase`.
- Remove reproducible mutation sandboxes, Wrangler bundles and logs, test
  reports, and formatting cache data with `npm run maintenance:clean`. The
  command preserves `.wrangler/state` and `.generated`, including manually
  captured Build Week media.
- Run the versioned PDF-reference extraction corpus with
  `npm run diagnostics:pdf-references` (`-- --json` for machine-readable output).
- Probe current backward and forward citation-provider coverage with
  `npm run diagnostics:citation-providers` (`-- --doi <doi>` to replace the
  versioned seed and `-- --json` for machine-readable output). This live command
  is advisory and spends provider quota.
- Run the shipped runtime dependency audit with `npm run security:audit`.
- Start the local Worker and configured model companion with `npm run dev`.
  The command explicitly selects loopback-only local authentication; it does
  not require a Cloudflare Access assertion or a `.dev.vars` file.
- Copy `.env.example` to the ignored `.env` to enable the companion; use
  `npm run model:companion` only for standalone troubleshooting.
- Install the Playwright browser with `npm run playwright:install`.
- Run end-to-end tests with `npm run e2e`.
- Run unit and integration tests with `npm test`.
- Run Durable Object integration tests in the local Workers runtime with
  `npm run test:workers`.
- Worker-runtime tests disable remote binding sessions and require neither a
  Cloudflare account nor preview-token access. Production Workers AI remains an
  explicitly remote binding; add a local test double before testing AI behavior
  in the readiness gate.
- Run tests related to affected runtime or unit test files with `npm run test:affected`.
- Run the unit coverage gate with `npm run test:coverage`.
- Run full mutation tests with `npm run mutation`.
- Run mutation tests for selected source files with
  `npm run mutation:affected -- --mutate <comma-separated-files>`.
- Reproduce GitHub's pull-request mutation selector with explicit commit SHAs:
  `MUTATION_BASE_SHA=<base> MUTATION_HEAD_SHA=<head> npm run mutation:ci`.
- Run incremental mutation tests with `npm run mutation:incremental`.
- Explicitly rebuild the full incremental mutation report with
  `npm run mutation:incremental:refresh`.
- Run TypeScript checks with `npm run typecheck`.
- Regenerate committed Worker bindings with `npm run worker:types`; this
  intentionally ignores `.env` and `.dev.vars` so output is reproducible.
- Check committed Worker bindings without rewriting them with
  `npm run worker:types:check`.
- Run Lighthouse with `LIGHTHOUSE_URL=http://127.0.0.1:8787 LIGHTHOUSE_SERVER_COMMAND="npm run dev" npm run lighthouse`.
- Refresh the ignored Build Week submission images through a dedicated debug
  Chrome session with `npm run media:build-week`; check an existing set without
  recapturing it with `npm run media:build-week -- --validate`.
- Format the repo with `npm run format`.
- Check formatting with `npm run format:check`.
- Run default Oxlint correctness checks with `npm run lint`.
- If a container run pauses on failure, fix the issue and resume with
  `npm run ci:local:container:retry -- --name <runner-name>`.

Use targeted checks while iterating, then run the full readiness path before proposing or landing a change:

- Docs-only changes: `npm run format:check`
- TypeScript or typed tooling changes: `npm run typecheck`
- Runtime `src/` changes while iterating: `npm run typecheck` and `npm run test:affected`
- Durable Object migration, transaction, RPC, or eviction changes:
  `npm run typecheck:workers` and `npm run test:workers`
- Browser behavior or UI changes: `npm run quality:gate`
- Readability, complexity, duplication, or cleanup review: `npm run diagnostics:codebase`
- Baseline readiness: `npm run ci:local`

Kirjolab's Worker entry point is `src/worker.ts`. `npm run dev` supervises the
Worker on `http://127.0.0.1:8787` and, when configured, the model companion on
`http://127.0.0.1:8790`; stopping either process stops the other. Playwright
uses `npm run e2e:server` on `http://127.0.0.1:8788` so browser tests can run
without extra setup or a model process. The Playwright gate also starts an
unconfigured-GitHub profile on `http://127.0.0.1:8789` for disabled-capability
coverage. Each E2E launcher forces Chokidar polling mode, uses fresh temporary
persistence, and acknowledges artifact-analysis jobs without launching Browser
Rendering because those endpoints are mocked by the suite. It removes the
persistence tree on shutdown. Browser-created workspaces therefore cannot
accumulate in the interactive `npm run dev` catalog. API
modules live under `src/api/`, view modules live under `src/views/`, and tests
are colocated under `src/`.

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

The GitHub Actions CI workflow splits fast checks, browser checks, and mutation checks into separate jobs, supports manual dispatch when an automatic push or pull-request trigger needs diagnosis, reads the pinned Node version from `package.json`, relies on the npm release bundled with that Node setup as long as it satisfies the repo's npm 11 constraint, runs repository-shape validation as part of the fast job, runs the browser job in the version-pinned Playwright container image `mcr.microsoft.com/playwright:v1.62.1-noble`, pins every `uses:` action reference to a full commit SHA, and cancels superseded runs on the same ref. The required `quality-mutation` job is GitHub- and pull-request-only, checks out full history, and supplies the pull request's base and head SHAs to `npm run mutation:ci`. It has a 30-minute timeout and does not repeat on the merge push to `main`. Use `npm run mutation:incremental`, `npm run mutation:affected`, or `npm run mutation` explicitly when local mutation feedback is needed. Dependency installation uses plain `npm ci`. Optional Agent CI 0.17.1 container parity explicitly prewarms through the fast job's stable `install` step, then gives concurrent jobs isolated writable dependency views. Its wrapper consumes Agent CI's versioned JSON events and reports each job and step with elapsed time, including a heartbeat every 15 seconds.

If authenticated pushes create no workflow runs even though the Actions API
reports the repository and workflow as enabled, inspect the repository's Actions
page. GitHub can still show a **Workflows aren't being run on this repository**
banner with an **Enable Actions on this repository** control; enable it there,
then verify the next push creates a `push` event run before configuring required
status checks.

The `main` branch follows [the recorded branch-protection policy](./branch-protection.md).
Create a topic branch and pull request for every change. GitHub requires the
branch to be current and the `quality-fast`, `quality-browser`, and
`quality-mutation` checks to pass before merge; administrators follow the same
rule. The approval count remains zero for the solo-maintainer workflow, but
review conversations must be resolved.

Kirjolab's UI retains the Tailwind v4 pipeline inherited from
`thesis-journey-tracker`: Tailwind input lives in `src/tailwind-input.css`,
generated CSS is written to `.generated/styles.css`, and Wrangler runs
`npm run build:css` automatically before local development.

The offline authoring service worker is compiled from
`src/client/service-worker.ts` into `.generated/service-worker.txt`. The browser
shell build fingerprints immutable runtime filenames and derives the offline
cache generation from emitted content before compiling the final application
and service worker. The Worker serves the generated service worker at
`/service-worker.js`; all local output remains disposable and ignored by Git.
Browser-shell builds resolve Lit through explicit package export conditions:
`npm run dev`, Playwright, and Vitest use Lit's development diagnostics, while
an ordinary build defaults to production. The production deploy command also
forces production mode so an inherited local development setting cannot enter
deployed assets. Each Lit-bearing browser entry validates its resolved esbuild
inputs before output is accepted.

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

The Node Vitest setup remains the fast home for pure logic. `vitest.config.mts`
targets colocated `src/**/*.test.ts` files while excluding end-to-end and
Workers-runtime tests. The default `npm test` command uses `--passWithNoTests`
so the template remains usable before a project adds its first test file.

Durable Object integration tests use the separate
`vitest.workers.config.mts`, select `src/**/*.workers.test.ts`, and receive their
test-only types through `tsconfig.workers-test.json`. Run them with
`npm run test:workers`; the Cloudflare Vitest integration starts a local
`workerd` runtime with remote binding sessions disabled. The project pins
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

Mutation testing uses Stryker with Vitest. `npm run mutation` performs an
explicit full mutation audit with the TypeScript checker against runtime
`src/**/*.ts` files while excluding declarations, unit tests, end-to-end tests,
and `src/test-support.ts`. It includes static mutants and the configured
detailed reports. `npm run mutation:affected` accepts an explicit Stryker
`--mutate` list, ignores static mutants, and retains concise clear-text and
progress reporting for a human-readable bounded signal. The automated
pre-push selector appends `--reporters progress` so its final option overrides
the base reporters. Pull-request mutation instead uses
`stryker.pr.config.mjs`, which requests console progress plus a JSON report and
disables Stryker's built-in raw break threshold only for that CI path.
`npm run mutation:incremental` enables Stryker incremental mode so repeated
full-surface local runs can reuse previous mutant results while ignoring static
mutants. Both local commands retain the configured TypeScript checker; a plain
project typecheck cannot determine whether each mutated program still compiles.
`npm run mutation:incremental:refresh` removes the ignored incremental report
before rebuilding it. It remains an explicit manual full-surface cache refresh;
the pre-push selector does not invoke it automatically.
GitHub runs `npm run mutation:ci` from a clean checkout for pull requests only.
The selector compares explicit base and head SHAs. A NUL-delimited
`git diff --name-status --diff-filter=ACMRD -z base...head` supplies added,
copied, modified, renamed, and deleted status while retaining both old and new
paths for renames. Deleted production sources are omitted because no head-side
file remains. For each surviving directly changed configured production source,
a zero-context diff supplies positive new/head-side hunk spans. Renamed sources
use `git diff --unified=0 --find-renames base...head -- old-file new-file` so a
move is not misread as a full addition; other changes use only the head-side
path. The selector projects those spans to Stryker
`file.ts:start-end` patterns and coalesces overlapping or adjacent ranges.
Stryker only mutates AST nodes fully contained by a range, so any deletion-only
hunk or absence of a positive new-side span promotes the surviving source to a
full-file pattern.

A changed, deleted, or renamed colocated Node unit test maps its surviving
production counterpart as a full-file pattern only when that source was not
directly changed. Direct range or safety-fallback selection takes precedence
when both source and test changed. Changes, deletions, or renames involving
`package.json`, `package-lock.json`, `stryker.config.mjs`, `tsconfig.json`,
`vitest.config.mts`, `.github/workflows/ci.yml`,
`scripts/affected-file-utils.mjs`, `scripts/run-ci-mutation.mjs`, or
`scripts/run-pre-push-quality.mjs` add `src/views/app-navigation.ts` as an
always-full-file stable canary. Full-file selection dominates ranges for the
same source, so the canary stays full-file even when it was also changed
directly. The selector requires full base and head commit SHAs to exist in the
checkout and fails explicitly when either is unavailable instead of falling
back to a full run. The required check succeeds without starting Stryker when
no line range, full-file fallback, test-mapped source, or canary is selected.
Otherwise it invokes the non-incremental affected command with an explicit
`--mutate` list, ignores static mutants, emits console progress plus JSON under
the existing disposable `reports/mutation/` target, and must finish within 30
minutes. After Stryker completes successfully, the selector postprocesses that
JSON report. `Killed`, `Timeout`, `Survived`, and `NoCoverage` are valid;
`Killed`, `Timeout`, and `Survived` are covered; and `Killed` plus `Timeout` are
detected. `CompileError` and `Ignored` are excluded. `Pending`, `RuntimeError`,
and a missing or malformed report fail the check. A report with zero valid
mutants passes; otherwise changed-mutant coverage (`covered / valid`) must be at
least 90% and covered mutation score (`detected / covered`) must be at least
68%.

The changed-line refinement follows an affected-file GitHub run that timed out
after 30 minutes 16 seconds with 5,015 of 6,930 mutants tested and one checker
and one test runner active. The 30-minute timeout remains a hard upper bound
rather than a target runtime.
The base `stryker.config.mjs` break threshold remains 68, rebased to the whole-
number score observed after the well-tested local Markdown renderer moved
behind the Scholarmark package boundary; the 80 and 90 warning bands remain
visible. It remains blocking for full, affected, incremental, and pre-push
mutation. The dedicated pull-request configuration disables that raw threshold
because Stryker's raw `detected / valid` score conflates uncovered changed
mutants with detection strength; the two postprocessed metrics above are the
pull-request authority instead.

The measured changed-line report had 3,154 valid mutants, 2,852 covered mutants
(90.42%), and 1,922 detected mutants (67.39% of covered mutants). It therefore
passes the coverage floor but misses the covered mutation floor. With the
covered denominator unchanged, reaching 68% requires 1,940 detections, or 18
more. Tests must harden that result rather than lowering the floor. This
pull-request result is not a repository-wide score; run `npm run mutation`
explicitly for a full audit.

The Vitest runner uses Stryker's per-test coverage
analysis and related-test narrowing, so each runtime mutant runs against the
tests Stryker can associate with the mutated file instead of blindly rerunning
the whole suite. Stryker worker concurrency is set to `50%` so mutation testing
can use parallel workers without assuming a fixed core count for every clone of
the template. Mutation reports and Stryker incremental data are written under
`reports/`, and Stryker's temporary `.stryker-tmp/` sandbox must stay untracked.
Ignored `.wrangler/` runtime state is excluded from the sandbox so live SQLite
WAL files cannot race its copy.

Near-cap complexity fixtures and inherently boundary-sized integration
fixtures use the centralized `src/test-support/mutation.ts` worker marker to
stay out of Stryker's instrumented repetitions. They still run in ordinary unit
and coverage CI. Small mutation-selected counterparts must cover the same
parser behavior and every production limit guard or accumulator, including the
accepted boundary, first rejected value, aggregate accounting where relevant,
and stable typed failure. This convention depends on the worker marker exposed
by the pinned Stryker release and must be reverified when that pin changes.

The TypeScript setup is generic too. `tsconfig.json` covers repo-level `.ts` files and `src/**/*.ts`, and `npm run typecheck` runs TypeScript 7. During the TypeScript 7.0 transition, `typescript` is intentionally pinned to the `@typescript/typescript6` compatibility package for tools that import the compiler API, while `typescript-7` provides the compiler used by the typecheck script.

Fallow provides advisory codebase readability diagnostics. `npm run diagnostics:readability` runs a syntactic changed-code audit for production-code complexity and duplication plus project dependency hygiene and cleanup findings while relaxing CRAP-score noise from untested tooling scripts. Fallow 3 compares the branch with its upstream through a temporary Git worktree so its new-only verdict can distinguish introduced findings from inherited context. `npm run diagnostics:type-aware` runs Fallow 3.10's optional TypeScript-Go pass against the explicit root, browser, and Workers-test TypeScript projects. It refines existing export, type, and class-member candidates with exact static-use and contract evidence while conservatively retaining dynamic or incomplete cases; ordinary TypeScript diagnostics remain owned by `npm run typecheck`. The type-aware pass stays separate because new-only audit baselines cannot compare different semantic identities. Unit and end-to-end tests are excluded from Fallow complexity and duplication because exact boundary fixtures intentionally repeat structures; generated Worker declarations are excluded entirely, and Durable Object RPC methods are registered as framework-invoked members. Esbuild-only diagnostic and spike inputs plus the unit-test Cloudflare runtime shim are explicit entry points, while development-only CLI dependencies are classified separately from production dependencies. Formatting, linting, typechecking, and test execution remain authoritative for excluded files. `npm run diagnostics:health` reports whole-repo health scoring, hotspots, refactoring targets, and advisory public-signature type coupling using the same explicit TypeScript projects. `npm run diagnostics:codebase` runs all three diagnostic views. These commands use `--no-cache`, so normal diagnostics do not create a persistent `.fallow/` cache. If a contributor runs cached Fallow commands manually, `.fallow/` is ignored and should stay untracked.

`npm run diagnostics:dependencies` reports direct production dependencies,
unique production package/version nodes, and raw plus deterministic gzip sizes
for the built browser application, lazy Markdown/PDF runtimes, and styles. Run
`npm run build` first. Pass `-- --json` for structured comparison output. The
command is read-only and advisory; it does not create a report or enforce a CI
budget.

The pre-push hook treats each selected command's exit status as blocking. It
replays the exact Git pre-push ref input to affected guardrails and the deep
check selector. Fallow runs only for affected JavaScript, TypeScript, package,
or Fallow configuration inputs. Stryker targets only affected configured
mutation sources; affected Node unit tests map back to their production source.
Passing pre-push runs print only Fallow's health score and Stryker's progress and
final score. Run `npm run diagnostics:codebase` or a focused
`npm run mutation:affected -- --mutate <source>` when detailed findings are
needed.
Changes to `package.json`, `package-lock.json`, `stryker.config.mjs`,
`tsconfig.json`, or `vitest.config.mts` add the stable production canary to any
affected configured sources. They do not automatically rebuild the full
incremental report; use `npm run mutation:incremental:refresh` explicitly when
that cache audit is needed.
`git push --no-verify` remains Git's explicit emergency bypass, while the clean
affected GitHub mutation check remains required for pull requests.

Build Week submission media is captured manually with
`npm run media:build-week` after starting the dedicated loopback-only Chrome
session documented in [Browser Debugging](./dev/BROWSER_DEBUGGING.md). The
project-specific command seeds synthetic data in an isolated end-to-end Worker,
owns a fresh browser context, validates the staged images and captions, and then
replaces `.generated/build-week-media/`. It stays outside routine development,
CI, remote workflows, README media, and the reusable template baseline.

Template update packs live under `.template/updates/`. Use them to port later template maintenance changes into projects that already use this template or one of its capability kits. Each pack has metadata, a migration guide, and a focused patch to try first; when the patch does not apply cleanly, use the guide to adapt the change to the target project's conventions.

## Write Boundaries

Keep workflow write targets explicit and documented. Generated CSS and browser bundles belong in `.generated/`, including versioned Markdown and PDF runtime assets under `.generated/assets/`; ignored Build Week submission images and captions belong in `.generated/build-week-media/`; Lighthouse reports belong in `reports/lighthouse/`; coverage reports belong in `reports/coverage/`; mutation reports belong in `reports/mutation/`; Stryker temporary sandboxes belong in `.stryker-tmp/`; Prettier's disposable content cache belongs in ignored `.cache/prettier`; optional Fallow caches belong in ignored `.fallow/`; Agent CI local caches belong under Agent CI's managed cache directory; template update packs belong in `.template/updates/`; and local secrets belong in untracked files such as `.dev.vars` or `.env.agent-ci`.

`npm run maintenance:clean` removes only the documented disposable targets:
`.stryker-tmp/`, `.wrangler/tmp/`, `.wrangler/logs/`, generated coverage,
mutation, and Lighthouse reports, `test-results/`, and `.cache/prettier/`. It
rejects symbolic-link targets and deliberately preserves local application data
under `.wrangler/state/` and all `.generated/` output.

When adding a new tool or workflow that writes files, document the target path in the same change and prefer ignored local output unless the artifact is intentionally reviewed.

## Security Baseline

Kirjolab keeps secret handling lightweight and explicit:

- Keep local secrets in untracked files such as `.dev.vars`.
- Commit example files such as `.dev.vars.example` with placeholder values only.
- Treat `npm run security:audit` as part of the baseline gate for shipped runtime dependencies.

## Quality Gate

Use this expectation for routine changes:

- `npm run ci:local` must pass before a change is considered ready; it delegates
  to `npm run quality:gate` without container overhead.
- Use `npm run quality:gate:fast` for quicker local iteration when browser coverage is not the immediate focus.
- `npm run ci:local:container` is optional and should be used for changes to
  GitHub Actions orchestration or when Linux-container parity is in question.
- The repo-managed `pre-push` hook runs affected guardrails automatically after
  `npm install`, then runs Fallow for affected codebase inputs and targeted
  Stryker when pushed files can affect its configured mutation sources.
  Mutation configuration changes add the stable production canary instead of
  falling back to a full incremental refresh.
  Documentation-only and Worker-only pushes skip irrelevant deep checks.

The quality gate runs the fast gate first, then the Playwright browser tests.
Mutation testing is explicit locally. GitHub's required clean pull-request job
mutates only the affected configured production scope, ignores static mutants,
and passes without starting Stryker when that scope is empty. The gate prints named
phase transitions and an elapsed-time heartbeat every 30 seconds while a phase
is still running, while preserving each child command's live output. The fast
gate includes both Node coverage and `npm run test:workers`, so the baseline
cannot omit real Durable Object persistence verification. GitHub Actions runs
separate fast, browser, and affected mutation jobs, with repository-shape
validation included in the fast job. Native local CI runs the same fast and
browser package scripts sequentially on the supported macOS host. The optional
`npm run ci:local:container` path executes the complete workflow with Agent CI
when its orchestration or Linux container environment is the subject under
test. Local browser installation should go through the pinned
`npm run playwright:install` script.
