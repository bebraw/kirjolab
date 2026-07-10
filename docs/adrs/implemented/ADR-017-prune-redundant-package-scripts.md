# ADR-017: Prune Redundant Package Scripts

**Status:** Accepted

**Amended by:** [ADR-022](./ADR-022-add-mutation-testing-gate.md)

**Date:** 2026-04-24

## Context

The template should stay easy to clone and easy to prune. Its `package.json` had grown several convenience aliases that pointed at the same underlying workflows, which made the command list longer than the project needs.

The baseline still needs named entry points for common checks and for commands that hide repo-specific details, but aliases that only vary verbosity or restate another script make the workflow harder to scan.

## Decision

We will keep one package script per normal workflow:

- `npm run ci:local` is the quiet local Agent CI workflow and uses Agent CI's default local parallelism.
- `npm run quality:gate` runs the fast gate and browser tests.
- `npm run e2e` is the browser-test command used by the full gate and CI.

We will remove redundant aliases:

- `ci:local:quiet`
- `ci:local:all`
- `quality:gate:browser`

Less common Agent CI modes can still use the repo-pinned binary directly through `./node_modules/.bin/agent-ci`.

## Trigger

The script list had become noisy enough that the same workflows appeared under multiple names, especially local CI and browser verification.

## Consequences

**Positive:**

- The package script list is shorter and easier to scan.
- Local CI has one canonical command.
- Local CI delegates warm-cache serialization to Agent CI instead of forcing one local job slot.
- Browser verification uses the same `npm run e2e` name in local use, the full quality gate, and CI.

**Negative:**

- Contributors who used the removed aliases need to switch to the canonical command names.

**Neutral:**

- The underlying quality gates and CI jobs remain split between fast and browser verification.
- Agent CI still runs from the repo-pinned dependency.
- Remote CI keeps normal GitHub Actions job scheduling.

## Alternatives Considered

### Keep every convenience alias

This was rejected because the aliases made the template feel heavier without adding a distinct workflow.

### Remove more low-level scripts

This was rejected because scripts such as `typecheck`, `security:audit`, and `test:coverage` are useful standalone debugging entry points and hide repo-specific flags or custom gate logic.
