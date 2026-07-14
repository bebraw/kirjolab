# ADR-106: Persist Offline Manuscript Edits

**Status:** Implemented

**Date:** 2026-07-14

**Amends:** [ADR-049](./ADR-049-acknowledge-server-led-yjs-synchronization.md)

## Context

Kirjolab retained unacknowledged Yjs updates only in memory. A transient socket
failure was recoverable while the tab remained open, but closing or reloading
the browser during a poor connection lost that queue. The Worker-rendered HTML,
application module, stylesheet, and preview runtime also required a network
response, so a previously opened project could not reopen on a train or other
intermittent connection.

Offline authoring must not create a second Markdown authority, send stale full
browser state before the server-led synchronization boundary, cache private
APIs or PDF bytes broadly, or let one hosted identity load another identity's
browser data.

## Decision

Install a same-origin service worker that uses network-first retrieval for the
authenticated workspace navigation and the small authoring shell. Cache only
successful, non-redirected workspace HTML plus the application, stylesheet,
favicon, and JavaScript Markdown preview runtime. Do not cache API responses,
WebSockets, exports, library data, or PDF bytes through the service worker.

Persist one browser-local IndexedDB record per authenticated email and
workspace. The record contains the last authorized workspace snapshot, the
current complete Yjs document update, the last acknowledged server state
vector, and an observation timestamp. It is a recoverable supporting copy, not
canonical project history.

On offline startup, validate the identity/workspace key and snapshot shape,
apply the stored Yjs state with a non-authoring origin, and enable editing of
the existing project files. Derive the pending update as the difference between
the restored document and the stored acknowledged server vector. After a new
connection receives the server's binary state and versioned `sync`, send that
delta through the existing FIFO acknowledgement protocol. Duplicate replay
remains harmless because the document room acknowledges already integrated
Yjs state without advancing the revision.

Update the stored server vector only from server binary state and acknowledged
client updates. Clear the workspace copy before applying a server reset, and
clear all Kirjolab IndexedDB and service-worker caches before following the
native Cloudflare Access logout link. If offline storage or service workers are
unavailable, retain ordinary online behavior.

The initial offline contract covers authoring, navigation among existing
Markdown files, local undo/redo, syntax highlighting, and preview. Mutations
that require Worker authority—project tree changes, comments, library changes,
uploads, sharing, model requests, and exports—wait for connectivity. PDFs are
not predownloaded.

## Consequences

**Positive:**

- A previously opened project can reopen and remain editable without a network.
- Reloading or closing the tab does not discard locally persisted manuscript
  changes.
- Reconnection preserves the server-led synchronization and durable
  acknowledgement boundary.
- Offline data remains scoped by hosted identity and project rather than being
  exposed through shared API caches.

**Negative:**

- Authenticated manuscript and snapshot data remain on the browser device until
  logout, browser site-data removal, eviction, or explicit application cleanup.
- Offline edits are durable only within browser storage quotas and are not a
  substitute for server history or exported source archives.
- Server-authoritative resource operations and PDFs remain unavailable offline.

**Neutral:**

- Canonical Markdown, project history, Durable Object storage, and protocol
  version remain unchanged.
- Browser cache and IndexedDB eviction can remove offline availability without
  affecting server data.
- The browser-only service-worker entrypoint is verified by the offline browser
  scenario rather than Node mutation testing; its registration and cache-policy
  helpers remain unit- and mutation-tested.

## Alternatives Considered

### Cache only the application shell

This makes the page open but leaves the editor without project state and loses
edits across reloads.

### Store only materialized Markdown in local storage

This is simpler but creates a second document representation, loses supporting
file and CRDT history, blocks the main thread for larger papers, and makes safe
collaborative merge harder.

### Add `y-indexeddb`

The existing Yjs update/state-vector boundary is small enough to persist
directly. A dependency would add setup and lifecycle surface without improving
the current bounded contract.

### Cache every project and library response

Broad request caching risks cross-identity disclosure, stale server mutations,
and large private PDF storage. The authoring-first allowlist is easier to reason
about and matches the offline writing use case.
