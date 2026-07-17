# Kirjolab

Kirjolab is a collaborative workspace for scientific writing. It brings
Markdown manuscripts, references, PDF annotations, and evidence-aware writing
suggestions into one place while keeping the underlying `.md` and `.bib` files
portable.

You can import research material, annotate it, connect evidence to a manuscript,
review a locally generated revision, collaborate with other writers, and export your
work again.

Kirjolab runs on Cloudflare Workers, Durable Objects, and R2. Local development
is supported on macOS.

## What You Can Do

- Write Markdown and BibTeX collaboratively with live Yjs synchronization.
- Organize several isolated writing projects under stable URLs.
- Invite collaborators with owner or member access through Cloudflare Access.
- Create separate revocable review and edit links for external manuscript collaborators.
- Preview standard Markdown, GFM, and scientific-writing syntax through a
  local pure-JavaScript pipeline.
- Import PDFs, highlight passages, and link evidence back to manuscript text.
- Import BibTeX, enrich references through Crossref, and review DOI metadata
- Plan an SLR or MLR with versioned PICOC framing, research questions, concept
  groups, query calibration, and source-specific search syntax
- Import and deduplicate search results, run attributed staged screening,
  appraise and extract evidence, and publish revision-pinned synthesis into the
  project
  before associating it with a PDF.
- Follow a DOI-backed reference trail from trusted seed papers, review
  backward-snowball candidates, and save each accepted source with its
  discovery provenance.
- Ask a local model to revise a selected passage using selected evidence, then
  accept or reject the proposed change.
- Export portable Markdown and BibTeX files.

## Run It Locally

You need [nvm](https://github.com/nvm-sh/nvm) and the project-pinned Node.js
version. The local workflow uses Wrangler's Durable Object and R2 emulation, so
you do not need a Cloudflare deployment to get started.

```bash
nvm use
npm install
npm run dev
```

Open <http://127.0.0.1:8787>.

`npm install` also configures the repository's pre-push hook. Generated browser
assets are written to the ignored `.generated/` directory.

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

## Development and Tests

Use the smallest useful check while working, then run the baseline gate before
considering a change ready.

| Command                        | Purpose                                    |
| ------------------------------ | ------------------------------------------ |
| `npm run quality:affected`     | Check files affected by the current change |
| `npm run quality:gate:fast`    | Run the fast local verification gate       |
| `npm run quality:gate`         | Run the full baseline quality gate         |
| `npm run ci:local`             | Run the GitHub Actions workflow locally    |
| `npm test`                     | Run unit tests                             |
| `npm run e2e`                  | Run browser tests                          |
| `npm run mutation`             | Run mutation tests                         |
| `npm run diagnostics:codebase` | Report advisory readability diagnostics    |

Install the pinned Playwright browser with `npm run playwright:install`. If a
local CI run pauses after a failure, fix the problem and resume it with
`npm run ci:local:retry -- --name <runner-name>`. More setup and troubleshooting
details are in [docs/development.md](./docs/development.md).

## Project Guide

- [VISION.md](./VISION.md) explains the product direction.
- [ARCHITECTURE.md](./ARCHITECTURE.md) records global technical constraints.
- [specs/](./specs/) contains implemented feature contracts.
- [docs/adrs/](./docs/adrs/) contains architecture decisions and their status.
- [docs/operations/](./docs/operations/) contains production runbooks.
- `src/worker.ts` is the Worker entry point and top-level router.
- `src/durable-objects/` contains coordination and persistent metadata.
- `src/domain/` contains portable resource contracts and Markdown semantics.
- `src/api/` contains the HTTP API routes.
- `src/client/` contains the browser application and local-model operations.
- `src/views/` contains the server-rendered workspace shell.
- Tests live next to the code they exercise under `src/`.

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
