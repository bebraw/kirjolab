# ADR-232: Adopt the Local CI Canonical Interface

**Status:** Implemented

**Date:** 2026-09-03

**Amends:** [ADR-092](./ADR-092-prewarm-agent-ci-dependencies-explicitly.md),
[ADR-148](./ADR-148-prefer-native-local-ci.md)

## Context

Kirjolab uses native `npm run ci:local` as its normal macOS readiness gate and
keeps a containerized GitHub Actions replay only for workflow or Linux parity.
That optional path still used the `@redwoodjs/agent-ci` compatibility package,
`agent-ci` executable, `.env.agent-ci`, `AGENT_CI_*` variables, capability-kit
name, and repository skill name.

The upstream project renamed the canonical package and interface to Local CI.
Version 0.18.1 of the compatibility package emits a migration warning and
delegates to `run-local-ci`, whose canonical executable, environment file, and
variables use the new name. Keeping the old interface would make active docs
and portable capability guidance disagree with the installed runner.

`vibe-template` published the migration as update pack
`2026-08-17-dependency-toolchain-refresh` in revision
`50058487687d0926c7fcc93e1d63033a1d96f697`.

## Decision

Replace the compatibility package with pinned `run-local-ci@0.18.1`. The
optional wrapper spawns the `local-ci` executable and continues to consume its
versioned NDJSON event stream, preserve exit status, report heartbeats, prewarm
through the stable workflow install step, and support paused-runner retry.

Rename the machine-local override example to `.env.local-ci.example`, use
`.env.local-ci` and `LOCAL_CI_*` variables, rename the capability kit to
`.capabilities/local-ci/`, and expose the project workflow as
`.codex/skills/local-ci/`. Keep `.env.agent-ci` ignored so a pre-existing local
secrets file cannot become tracked during migration.

Preserve ADR-148's main decision: `npm run ci:local` remains the native full
quality gate, while `npm run ci:local:container` and its retry command own the
optional container parity path.

## Trigger

The latest `vibe-template` sync exposed the compatibility warning during local
verification and the user authorized the obsolete-interface removals.

## Consequences

**Positive:**

- Active package, executable, environment, skill, and capability names agree.
- Optional container parity no longer starts through a warning-emitting shim.
- The native default and existing structured progress wrapper remain stable.

**Negative:**

- Contributors with `.env.agent-ci` must copy intentional overrides to
  `.env.local-ci`.
- Historical ADRs and update packs retain the former Agent CI terminology.

**Neutral:**

- Remote GitHub Actions behavior and the native quality-gate contract do not
  change.
- The old local env path remains ignored but is no longer loaded.

## Alternatives Considered

### Keep the Compatibility Package

Rejected because it emits a migration warning, advertises the new Local CI
interface at runtime, and leaves active documentation on obsolete names.

### Make Container Replay the Default Again

Rejected because ADR-148's faster native macOS baseline remains appropriate;
the renamed runner is still reserved for explicit workflow or Linux parity.

### Remove Container Parity Entirely

Rejected because local workflow orchestration and Linux-container parity remain
useful for workflow-sensitive changes and paused-runner diagnosis.
