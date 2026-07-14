# ADR-092: Prewarm Agent CI Dependencies Explicitly

**Status:** Implemented

**Date:** 2026-07-14

**Partially supersedes:** [ADR-072](./ADR-072-report-local-ci-progress.md)

## Context

Kirjolab temporarily constrained local Agent CI to one job after interrupted
warm-cache preparation could leave concurrent jobs mutating the same writable
dependency tree. That protected correctness but serialized the independent fast
and browser workflow jobs.

Agent CI 0.17.1 adds explicit prewarming and isolated writable dependency views
for parallel jobs. Kirjolab already owns a small NDJSON formatter around the
runner, so the new lifecycle must fit that wrapper without losing progress,
heartbeat, pause, retry, or exit-code behavior.

## Decision

Pin Agent CI 0.17.1. Give the fast workflow's deterministic `npm ci` step the
stable id `install`, and select
`.github/workflows/ci.yml:quality-fast:install` with `--prewarm-through` from
the local wrapper.

Remove the one-job limit. Agent CI prepares dependencies once, then supplies
each concurrent job with its own writable dependency view. The wrapper remains
the canonical local entrypoint and continues to consume versioned JSON events.

## Consequences

**Positive:**

- Independent local workflow jobs can run concurrently without sharing one
  mutable dependency tree.
- One explicit prewarm boundary avoids duplicate cold installs.
- Existing progress and attached retry behavior remain unchanged.

**Negative:**

- The local command now depends on a stable workflow, job, and step identity.
- Renaming the selected install step requires updating the prewarm selector.

**Neutral:**

- Remote GitHub Actions still performs ordinary per-job `npm ci` installs.
- The full mutation job remains GitHub-only in local Agent CI.

## Alternatives Considered

### Keep one-job local execution

This remains safe but unnecessarily serializes independent work after the
runner introduced isolated dependency views.

### Remove explicit prewarming

Per-job isolation prevents cross-job mutation, but every cold job would repeat
the dependency setup instead of sharing one verified preparation boundary.
