# ADR-148: Prefer Native Local CI

**Status:** Implemented

**Date:** 2026-07-17

## Context

The canonical `npm run ci:local` command executed the complete GitHub Actions
workflow through Agent CI containers. Even with dependency prewarming, isolated
writable views, and structured heartbeats, a routine run could remain opaque
for several minutes and repeat container startup and dependency work already
covered by the native quality gate.

The supported local platform is macOS. `npm run quality:gate` already executes
the same `quality:gate:fast` and `e2e` package scripts used by the remote fast
and browser jobs, preserves live child output, and reports phase heartbeats.
GitHub Actions remains the clean Linux authority and additionally runs full
mutation testing.

## Decision

`npm run ci:local` will delegate directly to `npm run quality:gate` on the host.
This native command is the routine non-documentation readiness baseline.

The existing Agent CI wrapper remains available as
`npm run ci:local:container`. It is an explicit parity and workflow-debugging
tool, not a second mandatory gate. Its retry entrypoint becomes
`npm run ci:local:container:retry`.

## Trigger

A locally green full quality gate completed in about ninety seconds while the
equivalent Agent CI run remained active and mostly opaque for more than eight
minutes. The user explicitly accepted skipping container overhead.

## Consequences

**Positive:**

- routine readiness avoids Docker startup, warm mounts, and duplicate installs
- contributors retain live phase and test output
- local and remote checks share package-script authorities rather than copied
  command lists
- container parity remains available when a workflow or Linux-specific change
  warrants its cost

**Negative:**

- routine local readiness does not validate GitHub Actions YAML orchestration
  or the pinned Linux browser image
- native runs reuse the installed dependency tree rather than proving a clean
  `npm ci`

**Neutral:**

- GitHub Actions remains the clean-environment and full-mutation authority
- ADR-072's progress formatter remains implemented for the optional container
  path, but its choice of Agent CI as the canonical local command is superseded

## Alternatives Considered

### Keep Agent CI mandatory and improve its renderer

The repo already added structured events and heartbeats. Those improve status
visibility but do not remove container, install, and filesystem overhead.

### Remove Agent CI completely

This would simplify the script list further, but it would discard a useful
reproduction path for workflow orchestration and Linux-container failures.

### Duplicate workflow commands in a new local script

This was rejected because `quality:gate` already owns the required ordering and
progress contract. Delegation keeps a single native authority.
