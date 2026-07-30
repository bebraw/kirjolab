# ADR-210: Isolate E2E Artifact Analysis

**Status:** Implemented

**Date:** 2026-07-30

## Context

The Playwright suite replaces artifact-analysis HTTP results with deterministic
responses, but PDF uploads still enqueue the corresponding background jobs.
The local queue consumer then attempted to launch Browser Rendering, which is
outside the browser tests' asserted boundary. On macOS this produced repeated
spawn failures and retry logs even when every browser assertion passed.

## Decision

Keep artifact analysis enabled by default in Wrangler. Give the queue consumer
an explicit `enabled` or `disabled` execution mode and have the isolated E2E
launcher override that mode to `disabled`. In disabled mode, acknowledge queued
messages without opening Browser Rendering because the E2E persistence tree is
temporary and the suite supplies its own analysis responses.

Production, ordinary local development, and Worker-runtime tests continue to
use the enabled default. The bypass is available only through the explicit
per-process E2E variable override.

## Consequences

**Positive:**

- Passing E2E runs no longer emit irrelevant artifact-analysis failures and
  retries.
- Browser tests remain deterministic and do not depend on a locally launchable
  Browser Rendering process.
- Production behavior remains the committed default.

**Negative:**

- Playwright does not exercise the queue-to-browser analysis implementation;
  focused Worker tests remain responsible for that boundary.

**Neutral:**

- Disabled jobs are acknowledged only inside disposable E2E persistence.

## Alternatives Considered

### Ignore the Error Logs

Rejected because repeated expected failures obscure actionable server errors
and waste retry time.

### Disable the Queue Binding in a Second Wrangler Configuration

Rejected because duplicating the full Worker configuration would create a
larger drift surface than one typed execution-mode override.
