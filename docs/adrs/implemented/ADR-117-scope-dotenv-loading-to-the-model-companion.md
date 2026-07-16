# ADR-117: Supervise Local Model Development

**Status:** Implemented

**Date:** 2026-07-15

## Context

Starting the optional local-model companion separately from the Worker required
two long-running commands and repeated its upstream and allowed-origin
variables in the shell. These values are stable per local machine and fit an
ignored `.env`, but loading that file globally would expose companion
configuration to unrelated Worker, build, test, and deployment processes.
Adding a dotenv package would also duplicate functionality in the pinned Node
runtime.

## Decision

- `npm run dev` uses a small Node supervisor patterned after SlideOtter's local
  studio launcher. It starts the local Worker and starts the companion when
  `KIRJOLAB_MODEL_UPSTREAM` is configured.
- The supervisor loads the project-root `.env` with Node's
  `--env-file-if-exists` flag, removes every `KIRJOLAB_MODEL_*` value from the
  Worker child environment, and passes the configuration to the companion.
- Worker development, tests, and production Wrangler subprocesses set
  `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false`, the
  [documented Wrangler control](https://developers.cloudflare.com/workers/local-development/environment-variables/#controlling-env-handling)
  for disabling `.env` discovery. Worker-only local values remain in
  `.dev.vars`.
- Committed Worker bindings are generated only through
  `npm run worker:types`, which applies the same disabled-discovery setting.
  `npm run worker:types:check` enforces that projection in the fast quality gate
  and production preflight retains the same environment boundary.
- If either supervised process exits, the supervisor terminates its sibling.
- `npm run model:companion` remains available as a standalone troubleshooting
  command and loads the same file.
- Explicit process environment variables take precedence over matching file
  entries.
- `.env` remains ignored. `.env.example` documents only the companion's fixed
  loopback upstream, allowed browser scheme and port, loopback-host aliases,
  and optional listening port.
- No browser build, test, deployment, or standalone Worker script implicitly
  loads this file, and no dotenv dependency is added.

## Consequences

- Local Worker and companion startup becomes one `npm run dev` after the initial
  copy from `.env.example` to `.env`.
- Existing shell-based and CI configuration remains valid and authoritative.
- Generated Worker bindings are reproducible across developer machines and
  Cloudflare builds instead of depending on ignored local environment files.
- Companion settings do not enter the Worker process, leak into unrelated local
  processes, or become a deployment configuration mechanism.
- A companion startup failure also ends the Worker session instead of leaving a
  partially working development stack.
- A missing `.env` remains valid; the companion then reads explicit process
  variables and reports the existing bounded configuration error when the
  required upstream is absent.

## Alternatives Considered

Keeping two manual terminals preserves process isolation but makes the normal
local workflow needlessly easy to start only halfway. Shell backgrounding is
shorter but has brittle signal and failure propagation. Loading `.env` inside
the bundled module would add import-time filesystem behavior and complicate
tests that import its pure configuration functions. Loading dotenv globally
through npm would broaden the trust boundary. Adding a third-party parser would
increase dependencies without changing behavior provided by the pinned Node
release.
