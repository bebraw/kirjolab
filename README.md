# Kirjolab

Kirjolab is a collaborative workspace for scientific writing. It brings
Markdown manuscripts, references, PDF annotations, and evidence-aware writing
suggestions into one place while keeping the underlying `.md` and `.bib` files
portable.

You can import research material, annotate it, connect evidence to a manuscript,
review a locally generated revision, collaborate with other writers, and export your
work again.

**Repository:** [github.com/bebraw/kirjolab](https://github.com/bebraw/kirjolab)  
**Build Week disclosure:** [How Codex and GPT-5.6 were used](#built-with-codex-and-gpt-56)

Kirjolab's hosted deployment runs on Cloudflare Workers, Durable Objects, and
R2. A Docker Compose profile is available for local, single-user evaluation;
local source development is supported on macOS.

## What You Can Do

- Write Markdown and BibTeX collaboratively with live Yjs synchronization.
- Organize several isolated writing projects under stable URLs.
- Invite collaborators with owner or member access through Cloudflare Access.
- Create separate revocable review and edit links for external manuscript collaborators.
- Preview standard Markdown, GFM, and scientific-writing syntax through a
  local pure-JavaScript pipeline.
- Import PDFs, highlight passages, and link evidence back to manuscript text.
- Import BibTeX, enrich references through Crossref, and review DOI metadata
  before associating it with a PDF.
- Plan an SLR or MLR with versioned PICOC framing, research questions, concept
  groups, query calibration, and source-specific search syntax
- Import and deduplicate search results, run attributed staged screening,
  appraise and extract evidence, and publish revision-pinned synthesis into the
  project
- Accelerate screening and typed extraction with auditable local-model
  candidates that require explicit researcher disposition.
- Export lossless JSON, long-form CSV, scoped BibTeX, accessible PRISMA flow,
  and a deterministic digest-manifested review package.
- Follow a DOI-backed reference trail from trusted seed papers, review
  backward-snowball candidates, and save each accepted source with its
  discovery provenance.
- Ask a local model to revise a selected passage using selected evidence, then
  accept or reject the proposed change.
- Export portable Markdown and BibTeX files.

## Try It with Docker Compose

From a checkout, the only prerequisite is Docker with Compose:

```bash
docker compose up --build
```

Open <http://127.0.0.1:8787>. The image includes the pinned Node.js and Wrangler
versions, runs as a non-root user, and needs neither local Node.js nor a
Cloudflare account. Stop the foreground process with `Ctrl-C`; the named Docker
volume retains workspace and uploaded-file state. `docker compose down` also
removes the container while preserving that volume.

This profile is for one researcher evaluating Kirjolab on the same computer.
It is not a public, production, highly available, or supported multiplayer
deployment. Browser/AI artifact analysis, scheduled backups, Cloudflare Access,
and the GitHub App integration are unavailable. Its Miniflare state directory
is opaque runtime state rather than a portable backup; export important
Markdown and BibTeX through Kirjolab.

To rebuild an updated checkout without deleting local state:

```bash
docker compose down
git pull --ff-only
docker compose up --build
```

To inspect a failed start, run `docker compose ps` and
`docker compose logs kirjolab`. To deliberately reset all evaluation data, run
`docker compose down --volumes`; **that reset permanently deletes the named
volume**. More detail is in [docs/development.md](./docs/development.md#docker-compose-evaluation).

## Develop It Locally

You need [nvm](https://github.com/nvm-sh/nvm) and the project-pinned Node.js
version. The local workflow uses Wrangler's Durable Object and R2 emulation, so
you do not need a Cloudflare deployment to get started.

```bash
nvm use
npm install
npm run dev
```

Open <http://127.0.0.1:8787>.

`npm install` also configures the repository's pre-push hook. The hook runs
affected guardrails, Fallow for affected codebase inputs, and targeted Stryker
checks for affected Node-testable sources. Mutation configuration changes add
the stable canary source. Generated browser assets are written to the ignored
`.generated/` directory.

## Use a Local Writing Model

Kirjolab does not require a model API key. A revision request contains only the
selected passage, your instruction, the evidence you selected, and the model
identifier. It is sent directly from the browser to a credential-free,
OpenAI-compatible service running on your computer.

If the browser cannot reach that service directly, use the optional local
companion. Configure it once, then restart the ordinary development command:

```bash
cp .env.example .env
npm run dev
```

Then choose **Local companion** in Writing assistant. The companion listens on
`127.0.0.1:8790` by default and never sends model requests through the hosted
Worker. Edit the ignored `.env` to set `KIRJOLAB_MODEL_UPSTREAM` and
`KIRJOLAB_MODEL_COMPANION_ORIGIN`; explicit shell variables override the file.
When no upstream is configured, `npm run dev` starts only the Worker.
`npm run model:companion` remains available for standalone troubleshooting.

The deployed app can use a model on the same computer. Set
`KIRJOLAB_MODEL_COMPANION_ORIGIN` to the deployed app's exact origin, such as
`https://write.example.com` with no path, query, or trailing slash, then restart
`npm run model:companion`. The companion reads `.env` only at startup. A browser
on another device cannot use this loopback-only companion.

Open **Model connection** and choose **Find loaded models** to read the live
model identifiers exposed by the provider. Focused revision and claim tasks
default to reasoning off for responsive local inference; deeper reasoning can
be selected when a model and task benefit from it.

## Deploy to Cloudflare

Production uses Cloudflare Access for authentication. Do not deploy production
with a bare `wrangler deploy`: the repository defaults to loopback-only local
authentication and will reject a public hostname.

Follow the [production runbook](./docs/operations/production.md) to create the
R2 bucket, configure Cloudflare Access, validate the deployment, release it,
and test recovery. Once the required production variables are set, deploy with:

```bash
npm run deploy:dry-run
npm run deploy
```

For Cloudflare Git builds, set the production deploy command to
`npm run deploy` and provide the `KIRJOLAB_PRODUCTION_URL`,
`KIRJOLAB_ACCESS_TEAM_DOMAIN`, and `KIRJOLAB_ACCESS_AUD` build variables.
`KIRJOLAB_CROSSREF_MAILTO` is optional.

Research Corpus is a separate Worker over the existing private Library, R2,
and analysis Queue authorities. Deploy Kirjolab first, then follow the
[production runbook](./docs/operations/production.md#research-corpus-service)
to validate and release its versioned HTTP API and private stateless MCP
endpoint. Bare corpus deploys also default to loopback authentication and fail
closed on a public hostname.

## Development and Tests

Use the smallest useful check while working, then run the baseline gate before
considering a change ready.

| Command                        | Purpose                                    |
| ------------------------------ | ------------------------------------------ |
| `npm run quality:affected`     | Check files affected by the current change |
| `npm run quality:gate:fast`    | Run the fast local verification gate       |
| `npm run quality:gate`         | Run the full baseline quality gate         |
| `npm run ci:local`             | Run the full local gate natively           |
| `npm run ci:local:container`   | Run optional container workflow parity     |
| `npm test`                     | Run unit tests                             |
| `npm run e2e`                  | Run browser tests                          |
| `npm run mutation`             | Run mutation tests                         |
| `npm run diagnostics:codebase` | Report advisory readability diagnostics    |
| `npm run dev:corpus`           | Run Corpus plus its local authority Worker |

Install the pinned Playwright browser with `npm run playwright:install`. The
container parity path can pause after a failure; resume it with
`npm run ci:local:container:retry -- --name <runner-name>`. More setup and
troubleshooting details are in [docs/development.md](./docs/development.md).

## Built With Codex and GPT-5.6

Kirjolab is developed collaboratively with Codex. Repository-owned instructions,
specifications, and architecture decisions define the boundaries before
implementation; Codex then helps inspect the existing system, propose focused
changes, implement them, and run the same local quality gates used for human
review.

During Build Week, Codex accelerated work across Kirjolab's integrated research
context, evidence-backed claims, local-model operations, collaboration,
scientific import and export, structured reviews, and automated tests. The
author retained the product and architecture decisions, including portable
Markdown authority, explicit scholarly relationships, the local-model boundary,
and the rule that model candidates require researcher disposition.

The largest single integrated implementation thread used GPT-5.6 under the
exact model label `gpt-5.6-sol`. The qualifying `/feedback` upload is Session ID
`019f6472-5ece-7cd3-b66f-ba344ba9e812`; it covers PDF annotation, the research
library, reviewable writing assistance, templates, editor and preview behavior,
citations, settings, and the internal design system.

The implementation was followed by exploratory browser reviews. Findings were
recorded before fixes, and the corrected workflows were re-run through focused
tests and the native local CI gate. The contest scope, eligible commit
range, demo outline, and remaining evidence requirements are documented in
[the Build Week submission notes](./docs/build-week-2026-submission.md).

Build Week judges can follow the
[credential-free macOS walkthrough](./docs/build-week-2026-judge-guide.md),
which includes an integrated research-to-authoring path and an optional
structured-review deep dive. The submission notes distinguish the official
submission-period implementation range from Kirjolab's earlier foundation.

## Project Guide

- [VISION.md](./VISION.md) explains the product direction.
- [ARCHITECTURE.md](./ARCHITECTURE.md) records global technical constraints.
- [specs/](./specs/) contains implemented feature contracts.
- [specs/self-hosting/spec.md](./specs/self-hosting/spec.md) defines the bounded
  Docker Compose evaluation and SQLite portability contracts.
- [docs/adrs/](./docs/adrs/) contains architecture decisions and their status.
- [docs/operations/](./docs/operations/) contains production runbooks.
- `src/worker.ts` is the Worker entry point and top-level router.
- `src/durable-objects/` contains coordination and persistent metadata.
- `src/domain/` contains portable resource contracts and Markdown semantics.
- `src/api/` contains the HTTP API routes.
- `src/client/` contains the browser application and local-model operations.
- `src/views/` contains the server-rendered workspace shell.
- Tests live next to the code they exercise under `src/`.

## Agent Skills

Repository-local skills in [`.codex/skills/`](./.codex/skills/) help coding
agents follow Kirjolab's conventions. Describe a job normally or request a
skill by name, such as `$security`. `$wayfinder` and `$to-spec` are
explicit-only, so they run only when explicitly requested.

### Product Work

- [`$brainstorming`](./.codex/skills/brainstorming/SKILL.md) — compare approaches and clarify trade-offs before implementation.
- [`$wayfinder`](./.codex/skills/wayfinder/SKILL.md) — map a large, uncertain, multi-session initiative. Explicit invocation required.
- [`$to-spec`](./.codex/skills/to-spec/SKILL.md) — capture settled behavior in the owning feature spec. Explicit invocation required.
- [`$tdd`](./.codex/skills/tdd/SKILL.md) — implement observable behavior through focused red-green slices.
- [`$debug`](./.codex/skills/debug/SKILL.md) — reproduce and isolate failures, then add regression guards when fixing them.
- [`$simplify`](./.codex/skills/simplify/SKILL.md) — clarify recently changed code without altering behavior.

### Review and Risk

- [`$review`](./.codex/skills/review/SKILL.md) — find prioritized regressions, risks, and readiness gaps.
- [`$correctness-review`](./.codex/skills/correctness-review/SKILL.md) — inspect changed logic for concrete behavioral errors and broken contracts.
- [`$test-review`](./.codex/skills/test-review/SKILL.md) — evaluate meaningful test gaps and brittle or redundant coverage.
- [`$security`](./.codex/skills/security/SKILL.md) — review authentication, secrets, access control, and data-handling risks.

### Interface and Performance

- [`$frontend-design`](./.codex/skills/frontend-design/SKILL.md) — design substantial production UI while preserving Kirjolab's reusable conventions.
- [`$minimal-visual-style`](./.codex/skills/minimal-visual-style/SKILL.md) — extend the minimal, editorial, token-driven visual language.
- [`$web-perf`](./.codex/skills/web-perf/SKILL.md) — audit Core Web Vitals, loading behavior, layout shifts, and accessibility signals.

### Cloudflare and Validation

- [`$durable-objects`](./.codex/skills/durable-objects/SKILL.md) — implement and review Kirjolab's stateful Cloudflare coordination layer.
- [`$workers-best-practices`](./.codex/skills/workers-best-practices/SKILL.md) — author and review production Cloudflare Worker code.
- [`$wrangler`](./.codex/skills/wrangler/SKILL.md) — guide Wrangler configuration, development, deployment, and resource commands.
- [`$agent-ci`](./.codex/skills/agent-ci/SKILL.md) — run Kirjolab's native local gate and optional container parity checks.

## Template Maintenance

This repository also retains reusable tooling from its starter-template roots:

- [`.capabilities/`](./.capabilities/) contains focused upgrade kits that can
  be applied to other projects without copying the entire repository.
- [`.template/updates/`](./.template/updates/) contains maintenance packs for
  projects already based on this template.
- [`.asdlc/`](./.asdlc/) contains the vendored ASDLC reference material used by
  maintainers.
- [AGENTS.md](./AGENTS.md) contains project rules for coding agents.

These directories are not required for running Kirjolab. They exist to keep
maintenance practices explicit and portable.

## License

Kirjolab is available under the [MIT License](./LICENSE).
