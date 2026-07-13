# ADR-072: Report Local CI Progress

**Status:** Implemented

**Date:** 2026-07-13

## Context

The canonical local validation command runs the GitHub Actions workflow through
Agent CI. Its quiet renderer suppresses useful job and step boundaries, while
long browser, coverage, or mutation operations can produce no visible output
for enough time to look hung.

The workflow, single-job limit, pause-on-failure behavior, retry command, and
exit codes are already part of the quality-gate contract. Improving feedback
must not duplicate those checks in npm scripts or infer state from unstable
human-oriented logs.

## Decision

`npm run ci:local` will invoke a thin repository script that runs the pinned
Agent CI binary with its versioned NDJSON event stream. The script will format
run, job, and step boundaries, include durations, and print a heartbeat at least
every 15 seconds while work remains active.

The wrapper will continue to use `.github/workflows/ci.yml`, quiet agent mode,
one-job execution, and pause-on-failure. It will surface Agent CI's retry
command, remain attached for retry, and preserve the final child-process exit
code.

## Trigger

Local validation gave too little evidence that slow checks were still making
progress.

## Consequences

**Positive:**

- Contributors can see which job and step is active without weakening or
  reorganizing validation.
- Heartbeats distinguish slow work from a silent hang.
- The GitHub Actions workflow remains the source of truth for local and remote
  checks.

**Negative:**

- The repository owns a small formatter that must track Agent CI's versioned
  event schema when the dependency changes.
- Progress output is intentionally summarized and does not expose every line of
  the default human renderer.

**Neutral:**

- Local jobs remain sequential until the separate warm-install race is resolved.
- Retry continues through `npm run ci:local:retry -- --name <runner-name>`.

## Alternatives Considered

### Remove quiet mode

The human renderer can expose more output, but its behavior varies by terminal
mode and still gives no stable repository-owned heartbeat contract.

### Print raw NDJSON

This preserves all structured data but makes routine local validation harder to
scan and pushes schema interpretation onto every contributor.

### Split validation into more npm scripts

Smaller commands could expose progress, but they would duplicate orchestration
already represented by the GitHub Actions workflow and risk local/remote drift.
