# ADR-209: Keep Workers Runtime Tests Local

**Status:** Implemented

**Date:** 2026-07-30

## Context

The Workers Vitest pool enables remote bindings by default. Once Kirjolab added
a Workers AI binding, every nominally local Worker test attempted to obtain a
Cloudflare preview token even though the suites do not call AI. Local CI became
dependent on account access and Cloudflare availability, emitted remote-binding
warnings, and could fail before a test worker started.

Workers AI is always remote during development. Leaving that fact implicit also
made Wrangler repeatedly warn instead of making the production boundary clear.

## Decision

Set `remoteBindings: false` in the Workers Vitest configuration. Worker-runtime
tests must use local Miniflare bindings and must not establish Cloudflare preview
sessions. Tests that eventually exercise AI behavior must provide an explicit
local test boundary rather than enabling all production remote bindings.

Mark the production Workers AI binding as `remote: true` in Wrangler because
that service has no local implementation. This documents runtime behavior while
the test-pool setting prevents the binding from opening a remote test session.

## Consequences

**Positive:**

- Worker tests run without Cloudflare credentials, quota, or preview service
  availability.
- Local CI no longer sends the Worker bundle to a remote preview session.
- Wrangler stops repeating an implicit-remote AI warning.

**Negative:**

- A future Workers AI integration test needs a separately designed test double
  or an explicit opt-in remote diagnostic outside the readiness gate.

**Neutral:**

- Deployed and interactive development AI behavior remains remote.
- Existing Worker tests do not call the AI binding, so their exercised behavior
  is unchanged.

## Alternatives Considered

### Retry Remote Preview Creation

Rejected because retries preserve the credential, availability, privacy, and
quota dependency in the local readiness baseline.

### Remove the AI Binding From Production Configuration

Rejected because queued OCR uses the binding in deployed artifact analysis.
