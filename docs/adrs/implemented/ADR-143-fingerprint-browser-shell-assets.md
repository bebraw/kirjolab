# ADR-143: Fingerprint Browser Shell Assets

**Status:** Implemented

**Date:** 2026-07-17

**Amends:** [ADR-101](./ADR-101-split-browser-runtimes.md),
[ADR-102](./ADR-102-use-javascript-for-live-markdown-preview.md),
[ADR-106](./ADR-106-persist-offline-manuscript-edits.md)

## Context

Kirjolab published the lazy Markdown runtime at the permanent
`/markdown-module-1.js` URL, served it for one year with `immutable`, and stored
it in the permanent `kirjolab-offline-shell-v1` service-worker cache. A citation
rendering change altered that module without changing either identifier. An
installed PWA could therefore keep the old renderer while the Worker and fresh
browsers ran the new release. PDF.js used the same manual-versioning pattern.

Long-lived caching is useful only when an immutable URL identifies exact
content. Releases must also change the service-worker script whenever an
allowlisted shell resource changes so browsers discover and install the new
offline shell.

## Decision

Build the Markdown and PDF.js browser runtimes before the application bundle,
derive a 16-hex-character SHA-256 fingerprint from each emitted file, and
publish the fingerprint in its filename. Compile those exact URLs into the
application. The Worker accepts only fingerprint-shaped runtime paths and
continues to serve them with a one-year immutable cache policy.

Build a provisional application bundle and derive the offline-shell version
from its bytes plus the generated stylesheet and both runtime assets. Compile
that version into the final application and service worker. The service worker
uses it as the Kirjolab Cache Storage namespace and precaches the exact
fingerprinted Markdown runtime. Activation deletes every older Kirjolab shell
cache.

On application startup, explicitly ask the existing registration to check for
an update. When an already-controlled page receives a new controller, persist
its current offline workspace and reload once. The newly activated worker then
serves the matching application, stylesheet, and runtime generation. A first
installation does not reload merely because it gains its initial controller.
Expose the same shell fingerprint as a copyable application version in
Preferences so error reports can identify stale clients directly.

Keep authenticated navigation network-first and keep APIs, WebSockets, exports,
library data, model requests, and private PDF bytes outside service-worker
caching. Generated outputs remain disposable under the existing `.generated/`
write target.

## Consequences

**Positive:**

- A runtime behavior change cannot reuse an immutable URL from an older build.
- Every shell-content change produces different service-worker bytes and a new
  Cache Storage namespace.
- Installed PWAs update after activation without requiring manual Safari site
  data removal.
- Error reports can identify the exact browser-shell generation from
  Preferences.
- Old Kirjolab shell caches are bounded by activation cleanup.

**Negative:**

- The browser-shell build becomes an ordered orchestration step and builds the
  application provisionally before emitting its final version.
- An activated update reloads an open application after persisting its current
  offline workspace.

**Neutral:**

- Canonical project state, collaboration, and server APIs do not change.
- An OS-suspended PWA cannot update until the operating system resumes it and
  permits a service-worker update check.
- Immutable runtime assets remain safe for long-lived browser and edge caches
  because their URLs now identify their content.

## Alternatives Considered

### Increment manual version numbers

This is small but repeats the failure mode: every feature author must remember
to update multiple unrelated constants in the same release.

### Disable browser caching

Using `no-store` for large unchanged runtimes avoids staleness but gives up the
load-time and offline benefits of immutable assets.

### Use a deployment timestamp

A timestamp busts caches but makes identical builds produce different output.
Content fingerprints are deterministic and explain exactly why a URL changed.
