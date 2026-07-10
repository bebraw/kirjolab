# ADR-015: Relax npm Version Enforcement

**Status:** Accepted

**Date:** 2026-04-19

## Context

ADR-013 moved the template back to npm because local Agent CI behaved more reliably with npm's flatter dependency layout than with pnpm's warmed mount behavior.

That decision also pinned npm to one exact patch release in `package.json`, local development guidance, and CI setup.

That level of strictness is higher than the repo needs and can create avoidable friction on platforms such as Cloudflare, where builds may run with a different npm 11 patch release than the one used during local development.

The template still needs one clear package-manager choice and a stable local CI story, but it does not need every environment to self-upgrade npm to the exact same patch version.

## Decision

We will keep npm as the required package manager, but relax npm version enforcement from an exact patch pin to an npm 11 compatibility constraint.

The template now uses:

- `npm@11` in `package.json#packageManager`
- `>=11 <12` in `package.json#engines.npm`
- `devEngines.packageManager.name = "npm"` without an exact npm patch requirement
- CI steps that use the npm bundled with the configured Node runtime instead of self-upgrading npm to one exact patch release

## Trigger

This decision was triggered by the need to reduce build-tooling friction on Cloudflare without undoing the earlier return to npm for local Agent CI compatibility.

## Consequences

**Positive:**

- Cloudflare and other hosted environments can use a compatible npm 11 patch release without fighting an exact repo pin.
- CI setup becomes simpler because it no longer mutates npm before install and verification steps.
- The repo still communicates one package-manager choice clearly.

**Negative:**

- Local, CI, and hosted environments may no longer report the exact same npm patch version.
- A future npm 11 patch regression would need to be handled with an explicit narrower range or an exact pin if it appears.

**Neutral:**

- Node remains pinned exactly in `package.json`.
- The repo still standardizes on npm rather than reopening package-manager choice.
- `package-lock.json` remains the dependency graph lock for reproducible installs.

## Alternatives Considered

### Keep the exact npm patch pin

This was rejected because the extra strictness does not buy enough reliability to justify the platform friction, especially for Cloudflare-hosted builds.

### Remove npm guidance entirely and trust whatever npm ships with each environment

This was rejected because the template still benefits from declaring npm as the expected package manager and from keeping environments inside one compatible major.
