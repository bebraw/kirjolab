# ADR-183: Report Deployment and Shell Diagnostics

**Status:** Implemented

**Date:** 2026-07-29

**Amends:** [ADR-143](./ADR-143-fingerprint-browser-shell-assets.md)

## Context

Preferences exposed the offline-shell fingerprint as the “application
version.” That value identifies the browser assets and service-worker cache,
but it does not identify the Worker deployment serving API requests. A report
could therefore show a current shell while an older Worker was deployed, or an
older installed shell while the Worker was current, without distinguishing
those cases.

Cloudflare Workers provides an in-process version metadata binding containing
the active version id, optional tag, and upload timestamp. Local development
does not provide meaningful deployment metadata.

## Decision

Bind `CF_VERSION_METADATA` through Wrangler and include its value in the public
`/api/health` response under `deployment`. Return `null` when the Worker
environment is absent or the application runs in local-auth mode, and mark the
response `no-store` so deployment diagnostics cannot survive a rollout in an
intermediary cache.

Let the existing bounded diagnostics control load and validate that response.
Present a compact deployment tag, or a shortened version id when the tag is
empty, beside the browser-shell fingerprint. Copy a stable multiline report
containing the full version id, tag, timestamp, and shell fingerprint. When the
health request fails or deployment metadata is absent, identify the deployment
as local and retain the shell fingerprint.

Keep the shell fingerprint as the offline cache identity. It remains
deterministic build metadata and must not be replaced with a deployment
timestamp or Worker version id.

## Consequences

**Positive:**

- Error reports distinguish the server deployment from the installed browser
  shell.
- A full Worker version id can be matched directly to Cloudflare deployment
  history while an available tag can carry source-control context.
- Diagnostics remain useful in local or temporarily offline sessions.
- Health and diagnostics responses do not become stale across deployments.

**Negative:**

- Application startup makes one small same-origin health request.
- The public health response exposes non-secret Worker version metadata.

**Neutral:**

- The deployment metadata does not authorize access or expose application
  state.
- Offline shell caching, activation, and refresh behavior remain unchanged.

## Alternatives Considered

### Replace the shell fingerprint with the Worker version id

This would identify the server but lose the only direct evidence of the
installed browser shell and cache generation.

### Embed deployment metadata into every rendered page

This avoids a health request but couples all server-rendered shells to the
deployment contract and does not provide one reusable diagnostic endpoint.

### Continue reporting only the shell fingerprint

This is deterministic but cannot diagnose a stale or unexpected Worker
deployment.
