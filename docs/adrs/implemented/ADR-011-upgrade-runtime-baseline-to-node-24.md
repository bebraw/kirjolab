# ADR-011: Upgrade Runtime Baseline to Node 24

**Status:** Accepted

**Date:** 2026-03-28

## Context

The template pins Node exactly through `package.json`, and both local and remote CI consume that pin directly. That makes the runtime version a durable architectural constraint rather than a local preference.

The repo was still pinned to Node 22 even though the current active LTS line is Node 24. Keeping the older LTS line longer than necessary would leave new template clones on an older runtime baseline without a clear repo-level reason.

## Decision

We will move the repo runtime baseline from Node 22 to Node 24 LTS.

The template now uses:

- `24.15.0` in `package.json#engines.node`
- `.nvmrc` as a convenience mirror for contributors who use `nvm`
- the existing npm-based workflow and lockfile model
- the same CI behavior, with `actions/setup-node` continuing to read the version from `package.json`

## Trigger

The project treats `package.json` as the runtime source of truth and keeps `.nvmrc` aligned as a contributor convenience. That keeps the Node baseline explicit while still letting `nvm use` pick up the same pinned runtime locally.

## Consequences

**Positive:**

- New template clones start from the current Node LTS line instead of the previous one.
- Local development and CI stay aligned through the same pinned runtime source.
- The repo remains explicit about its toolchain contract while still supporting `nvm use` as the expected local setup path.

**Negative:**

- Contributors who still have only the previous Node 22 baseline installed need to install Node 24 before repo commands pass cleanly.
- Some upstream tools may expose new warnings or compatibility changes that only appear once verification is run under Node 24.

**Neutral:**

- npm remains the package manager contract.
- CI still reads the runtime version from `package.json`; only the pinned value changes.

## Alternatives Considered

### Stay on Node 22

This was rejected because the repo no longer had a compelling template-level reason to stay on the older LTS line once Node 24 was the current active LTS.

### Track Node Current Instead of LTS

This was rejected because the template aims for a stable default baseline. The LTS line is a better fit than the more frequently changing Current release for a reusable starter.
