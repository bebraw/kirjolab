# ADR-013: Return to npm for Agent CI Compatibility

**Status:** Accepted

**Date:** 2026-03-29

**Supersedes:** ADR-010

## Context

The repo moved from npm to pnpm to improve repeated install speed and cache behavior.

That change worked for normal local development, but local Agent CI continued to fail under its warmed `node_modules` mount layout. The failures were not limited to one tool: Vitest, Playwright, and Wrangler all hit runtime resolution problems from `/tmp/warm-modules/...` when executed inside Agent CI runner containers.

Because the template treats local Agent CI as the preferred verification path, package-manager choice needs to optimize for reliable local CI behavior first.

## Decision

We will return to npm as the repo's pinned package manager.

The template now uses:

- `npm@11.12.1` in `package.json#packageManager`
- exact `node` and `npm` version enforcement through `engines` and `devEngines`
- CI alignment that upgrades npm to the repo pin after `actions/setup-node` and invokes the pinned npm CLI directly for workflow steps
- a committed `package-lock.json`
- npm-based repo scripts and documentation for routine development and verification
- CI-side npm cache restoration that does not depend on the Node-bundled npm version

## Trigger

This decision was triggered by repeated local Agent CI failures with pnpm under warmed dependency mounts, even after trying both isolated and hoisted layouts and tool-specific execution workarounds.

## Consequences

**Positive:**

- Local Agent CI should align better with Agent CI's warmed dependency model.
- The repo returns to a flatter dependency layout that is less likely to break runtime tool resolution in containers.
- The verification workflow becomes simpler again because it no longer needs pnpm-specific cache and environment setup.

**Negative:**

- The repo gives up pnpm's shared store and some repeated-install efficiency.
- The earlier pnpm migration work is partially reversed.

**Neutral:**

- Node remains pinned in `package.json`.
- The repo still uses exact tool versions and a committed lockfile.

## Alternatives Considered

### Keep pnpm and continue patching around Agent CI

This was rejected because the failures affected multiple tools and kept moving between packages. That pattern indicates a mismatch between Agent CI's warmed mount design and pnpm's runtime resolution behavior in this repo.

### Patch or fork Agent CI

This was rejected for now because the template should stay lightweight. Carrying a custom Agent CI fork would be a heavier maintenance burden than using the package manager that works more naturally with the current local CI model.
