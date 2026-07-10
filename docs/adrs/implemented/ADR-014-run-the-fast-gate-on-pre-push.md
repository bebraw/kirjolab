# ADR-014: Run The Fast Gate On Pre-Push

**Status:** Accepted

**Date:** 2026-04-19

## Context

The repo already documents `npm run quality:gate` and `npm run ci:local` as part of done work, but that expectation still relies on contributors remembering to run them manually.

That gap is large enough to let obvious regressions escape the local machine. Cheap deterministic failures should stop before a push starts remote CI.

We want that safeguard without adding a heavyweight Git hook dependency and without forcing the full browser gate on every commit or push.

## Decision

We will manage Git hooks inside the repo with a committed `.githooks/` directory and configure that path from `npm install` through `scripts/setup-git-hooks.mjs`.

The repo-managed `pre-push` hook will run:

- `npm run quality:gate:fast`

This keeps the push-time check aligned with the repo's existing fast gate contract while leaving the full gate and local Agent CI workflow as the definition of done for ready changes.

The CI workflow will upgrade npm to the repo pin after `actions/setup-node` and then invoke `npm` directly in later steps so the pinned npm behavior stays aligned across hosted runners and local Agent CI containers without depending on environment-specific executable paths.

## Consequences

**Positive:**

- Cheap local failures block the push before remote CI starts.
- Hook setup stays lightweight and repo-local without adding Husky or similar tooling.
- New clones pick up the hook automatically through the normal `npm install` path.
- The pinned npm CLI path is more robust across local and hosted CI environments.

**Negative:**

- Pushes now pay the fast-gate cost even for small changes.
- Contributors can still bypass hooks deliberately, so this improves the default path rather than making failure impossible.

**Neutral:**

- The full quality gate and local Agent CI remain required before considering a change ready.
- Browser tests stay out of the push hook so routine pushes do not pay the heavier Playwright cost.

## Alternatives Considered

### Keep the workflow fully manual

This was rejected because documentation alone is a weak guardrail for cheap deterministic checks.

### Run the full quality gate on pre-push

This was rejected because Playwright coverage is materially heavier than formatting, type checking, audit, and unit coverage. The existing fast/browser split should remain meaningful at push time.

### Add a dedicated Git-hook dependency

This was rejected because the template should stay lightweight and reusable, and Git already provides the hook mechanism we need.
