# ADR-029: Use Relative Stryker Concurrency

**Status:** Implemented

**Date:** 2026-05-31

**Amends:** [ADR-022](./ADR-022-add-mutation-testing-gate.md)

## Context

ADR-022 added Stryker mutation testing to the quality gate, and ADR-028 made repeated local runs faster through incremental mode. The Stryker configuration still used a fixed worker count, which underuses larger development machines while encoding an assumption that may be too aggressive or too conservative for downstream clones of the template.

Stryker supports percentage-based `concurrency`, computed from the available logical parallelism on the host. That keeps the template portable across different machines without adding local wrapper scripts or per-user configuration.

## Decision

Set Stryker worker concurrency to `50%` in `stryker.config.mjs`.

## Trigger

The user wanted faster Stryker execution but did not want the template to assume a specific number of CPU cores.

## Consequences

**Positive:**

- Mutation testing can use more parallelism on larger machines.
- The template avoids baking in a fixed core-count assumption.
- No new dependencies, scripts, or local configuration files are required.

**Negative:**

- Very small machines may still see noticeable load during mutation testing.
- Runtime can vary more by host than it did with a fixed worker count.

**Neutral:**

- Incremental local mutation and full CI mutation behavior remain unchanged.
- Stryker still owns worker scheduling for test runners and TypeScript checker processes.

## Alternatives Considered

### Keep `concurrency: 2`

This kept behavior predictable but left available host capacity unused on common development machines.

### Use a larger fixed worker count

This could speed up one known machine, but it would make the template less portable for users cloning it on smaller or larger systems.

### Remove the explicit setting

Stryker's default is also relative to host parallelism, but keeping `50%` documents the intended balance between speed and local machine responsiveness.
