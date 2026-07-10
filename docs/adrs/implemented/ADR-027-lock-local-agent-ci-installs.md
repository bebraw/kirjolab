# ADR-027: Lock Local Agent CI Installs

**Status:** Superseded by [ADR-031](./ADR-031-use-agent-ci-warm-cache-serialization.md)

**Date:** 2026-05-31

**Amends:** [ADR-017](./ADR-017-prune-redundant-package-scripts.md)

## Context

The canonical local CI script forced `--jobs 1` to avoid warmed dependency races
observed in local Agent CI runs. That made the workflow slower because the
fast, browser, and mutation jobs ran serially, but it kept each job's `npm ci`
step from writing to the same mounted dependency tree at the same time.

We tested removing `--jobs 1` after upgrading Agent CI. The parallel run started
all three jobs immediately, but concurrent `npm ci` steps still failed with
install-time `ETXTBSY` and `ENOENT` errors inside `node_modules`. The failure is
not job parallelism itself; it is concurrent writes to Agent CI's shared warm
`node_modules` mount.

The same test also showed a useful agent-facing improvement: failed runs can
pause and expose retry commands when the canonical script passes
`--pause-on-failure`.

## Decision

CI dependency installation will go through
`scripts/ci-install-dependencies.sh`.

On GitHub Actions, the wrapper runs plain `npm ci`.

Under local Agent CI, the wrapper uses a lock in the mounted tool cache and a
ready marker keyed by `package-lock.json` so only the first parallel job runs
`npm ci` against the shared warm `node_modules` mount. Later jobs wait for the
lock, observe the marker, and reuse the warmed dependency tree.

`npm run ci:local` will remove the forced `--jobs 1` limit and keep
`--pause-on-failure`.

## Trigger

The user asked whether the Agent CI workflow could be improved for agents
because local Agent CI runs felt slow, then asked whether temporary directories
or another workaround could avoid install-time races.

## Consequences

**Positive:**

- Independent local workflow jobs can run in parallel after the shared
  dependency install is ready.
- Local Agent CI avoids concurrent `npm ci` writes to the same warm
  `node_modules` mount.
- Failed local workflow steps can pause for targeted retry instead of requiring
  a full restart.

**Negative:**

- The workflow has one extra install wrapper script to maintain.
- If the warm `node_modules` tree is corrupted while the ready marker remains,
  a contributor may need to clear Agent CI's local cache.

**Neutral:**

- The remote GitHub Actions job split is unchanged.
- Remote dependency installation still uses `npm ci`.
- `npm run quality:gate` remains the sequential local baseline outside Agent CI.
- The repo still uses the pinned Agent CI dependency through package scripts.

## Alternatives Considered

### Keep forcing one local job slot

This was rejected because it preserves the slowest local Agent CI behavior even
though the race can be narrowed to the install step.

### Put each job in a temporary workspace

This was rejected because it would drift farther from GitHub Actions' normal
workspace layout and give up Agent CI's warm `node_modules` cache.

### Use plain auto concurrency with no install guard

This was tested and rejected because concurrent local jobs still race during
`npm ci` and fail while writing or executing files under the mounted
`node_modules` tree.
