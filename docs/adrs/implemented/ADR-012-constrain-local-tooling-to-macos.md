# ADR-012: Constrain Local Tooling to macOS

**Status:** Accepted

**Date:** 2026-03-29

## Context

The template is intended to stay lightweight, but its local development scripts already assume a macOS-style shell environment. The repo also uses local Agent CI as part of the normal verification path, and that workflow now benefits from using the pinned `agent-ci` dependency directly instead of relying on ad hoc invocation patterns.

Leaving the platform baseline implicit creates two problems:

- contributors may assume the local workflow is maintained as cross-platform when it is not
- the docs can drift into mixed guidance such as `npx` examples that bypass the repo's pinned toolchain contract

## Decision

We will treat macOS as the supported local-development and local-CI host baseline for this template.

We will also standardize local Agent CI usage around the repo-pinned binary:

- `npm run ci:local`
- `npm run ci:local:retry -- --name <runner-name>`

ADR-017 later narrows this script surface further by making `ci:local` the quiet local workflow command and removing redundant aliases.

The repo will ship:

- a checked-in `.env.agent-ci.example` for machine-local overrides
- direct npm-based CI and local workflow setup without extra package-manager wrappers
- docs that avoid recommending `npx` for normal Agent CI usage

## Trigger

The repo review identified that the template was already effectively macOS-first while still describing itself in a way that implied broader portability. The same review also identified that the Agent CI docs had drifted toward unpinned `npx` examples even though the repo already pins `@redwoodjs/agent-ci`.

## Consequences

**Positive:**

- The documented local workflow now matches the environment the template actually targets.
- Agent CI usage stays tied to the repo's pinned dependency version.
- Local CI setup and retry commands become easier to discover through package scripts.
- The repeated Corepack/pnpm workflow setup becomes easier to maintain.

**Negative:**

- The template now explicitly narrows its supported host platform baseline instead of implying broader support.
- Contributors on non-macOS hosts need to adapt the repo locally if they still want to use it.

**Neutral:**

- Remote GitHub Actions CI remains Linux-based.
- The project still uses the same underlying verification gates and Worker baseline.

## Alternatives Considered

### Maintain implied cross-platform local support

This was rejected because the current scripts and local workflow are not maintained to that standard, and leaving the constraint implicit is more misleading than helpful.

### Keep recommending `npx agent-ci`

This was rejected because it bypasses the repo's pinned Agent CI version and weakens reproducibility for a template that already treats exact tooling versions as part of the baseline contract.
