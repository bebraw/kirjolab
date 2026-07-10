# ADR-031: Use Agent CI Warm-Cache Serialization

**Status:** Implemented

**Date:** 2026-06-14

**Supersedes:** [ADR-027](./ADR-027-lock-local-agent-ci-installs.md)

## Context

ADR-027 added `scripts/ci-install-dependencies.sh` after local Agent CI jobs
could run in parallel but still raced when multiple `npm ci` steps wrote to the
same mounted warm `node_modules` cache.

The pinned Agent CI release now serializes the first cold warm-cache job wave
internally and verifies the warm cache before jobs use it. That makes the
template's local install lock redundant while keeping the useful local job
parallelism and pause-on-failure behavior.

## Decision

GitHub Actions install steps will run plain `npm ci`.

`npm run ci:local` will keep using the repo-pinned `agent-ci` binary with
default local parallelism and `--pause-on-failure`.

The template will not maintain a repo-local Agent CI install-lock wrapper.
Local install race protection belongs to Agent CI's warm-cache serialization.

## Trigger

The user asked to update project dependencies and noted that Agent CI improved
its parallel behavior enough that local workarounds might be removable.

## Consequences

**Positive:**

- CI dependency installation is easier to inspect because every job runs
  `npm ci` directly.
- The template carries one fewer maintenance script and no custom install-lock
  state.
- Local Agent CI keeps parallel job execution and pause-on-failure retry
  behavior.

**Negative:**

- The template now depends on Agent CI's warm-cache serialization for local
  parallel install safety.

**Neutral:**

- GitHub Actions still splits fast, browser, and mutation work into separate
  jobs.
- The browser job still uses the pinned Playwright container image.
- `npm run quality:gate` remains the local sequential baseline outside Agent CI.

## Alternatives Considered

### Keep the repo-local install wrapper

This was rejected because the wrapper duplicated behavior now provided by Agent
CI itself and kept an extra project-specific maintenance surface.

### Force one local Agent CI job

This was rejected because it gives up Agent CI's useful local parallelism even
though the install race is handled by the runner.
