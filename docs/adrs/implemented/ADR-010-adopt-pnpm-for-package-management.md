# ADR-010: Adopt pnpm for Package Management

**Status:** Superseded by ADR-013

**Date:** 2026-03-28

## Context

The template already pins its JavaScript toolchain tightly so local development, CI, and cloned projects share the same baseline. That approach worked with npm, but package installation remained one of the slower recurring steps in both local iteration and CI.

The repo now has a broader verification baseline and a split CI workflow. At that point, keeping npm as the package manager no longer has a strong advantage over a package manager with a shared content-addressable store and better cache behavior.

The repo should still stay lightweight. The chosen package manager needs to work cleanly with pinned versions, lockfile-based installs, `actions/setup-node`, Corepack, and local contributors without requiring a separate runtime version file.

## Decision

We will adopt pnpm as the repo's pinned package manager.

The template now uses:

- `pnpm@10.33.0` in `package.json#packageManager`
- pnpm version enforcement through `engines` and `devEngines`
- exact Node pinning through `package.json#engines.node`
- a committed `pnpm-lock.yaml` instead of `package-lock.json`
- no `.nvmrc`; `package.json` is the single source of truth for the runtime pin
- a checked-in `.npmrc` with `node-linker=hoisted` for predictable local Agent CI dependency resolution
- Corepack-enabled CI jobs that read the Node version from `package.json` and run `pnpm install --frozen-lockfile`
- pnpm-based repo scripts and documentation for routine development and verification

This keeps an exact Node pin in `package.json` and replaces npm as the package manager contract for local development and CI.

## Trigger

After the verification workflow was split and optimized, dependency installation became a clearer remaining place to reduce recurring overhead. The repo had also accumulated enough package-manager-specific documentation and policy that leaving npm in place would keep future work tied to a slower baseline without a compensating simplification benefit.

## Consequences

**Positive:**

- Installs and repeated dependency resolution should benefit from pnpm's store and cache model.
- The repo now carries a single explicit package-manager contract instead of depending on whichever global tool happens to be installed.
- The runtime pin now lives in one repo file instead of being duplicated between `.nvmrc` and `package.json`.
- CI can use pnpm's lockfile and cache integration directly.
- Local Agent CI no longer depends on pnpm's isolated symlink layout behaving correctly inside warmed Docker mounts.

**Negative:**

- Contributors need Corepack enabled, or a matching pnpm installation, before repo commands work.
- Some command examples and helper scripts need to use `pnpm` or `pnpm exec` instead of npm-oriented defaults.
- npm is no longer an independently pinned repo tool; its version comes from the chosen Node release.
- The repo gives up pnpm's default isolated node_modules layout in favor of the hoisted linker.

**Neutral:**

- The repo still depends on Node; this decision changes the package-manager contract and keeps the runtime pin in `package.json`.
- Existing devDependency pins and repo scripts remain the main way contributors interact with the toolchain.

## Alternatives Considered

### Keep npm

This was rejected because the repo already depends on an exact package-manager contract, and npm no longer offered a strong enough advantage to offset slower installs and weaker cache/store behavior.

### Switch to a broader runtime toolchain such as Bun

This was rejected because it would change more than the package manager. The template already has a stable Node-based baseline, and the goal here is to improve package management without broadening the migration scope.
