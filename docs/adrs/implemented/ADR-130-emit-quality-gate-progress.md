# ADR-130: Emit Quality-Gate Progress

**Status:** Implemented

**Date:** 2026-07-16

## Context

The local `quality:gate` ran multiple npm scripts through a shell chain. npm
announced each child command, but a long browser phase could produce
no output for long enough to look hung. The gate must retain its sequential
fail-fast behavior, include Kirjolab's Worker-specific fast checks, and stream
the underlying tools' output without adding a dependency or persistent state.

## Decision

Run the full local gate through a small repository-owned Node script. The runner
names each phase, reports completion or failure with elapsed time, and emits a
heartbeat every 30 seconds while the current phase remains active. Child
processes inherit standard input and output so their native interactive behavior
and live logs remain available.

Keep `quality:gate:fast` and `e2e` as the canonical phase commands and run them
sequentially with fail-fast exit codes. Keep the existing Worker-specific
checks inside `quality:gate:fast`. Mutation commands remain separately
invocable under ADR-134.

## Consequences

**Positive:**

- Contributors can distinguish a slow active phase from a hung gate.
- Phase and child-tool output remain visible in terminals and agent command
  streams.
- The runner is covered by a dependency-free Node tooling test.

**Negative:**

- The repository owns a small process-orchestration script instead of expressing
  the full gate as a package-script shell chain.
- Long-running gate logs gain one line every 30 seconds.

**Neutral:**

- The phase order, Worker checks, and readiness baseline remain explicit.

## Alternatives Considered

### Enable more verbose output in individual tools

This would not provide a consistent liveness signal across formatting and
browser phases, and tool-specific verbosity can generate substantially
noisier logs.

### Keep only phase transition messages

Transitions identify the current phase but still leave an ambiguous quiet
period while a single phase runs for several minutes.
