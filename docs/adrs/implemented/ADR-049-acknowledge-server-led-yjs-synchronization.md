# ADR-049: Acknowledge Server-Led Yjs Synchronization

**Status:** Implemented

**Date:** 2026-07-10

## Context

Kirjolab previously initialized the browser from a REST workspace snapshot and
also joined the document's Yjs WebSocket. On connection the server sent its
current state while the browser immediately sent its own full state. Those
independent paths gave editor text two owners: a delayed snapshot could replace
a newer collaborative value, and a reconnect replay could advance the document
revision even when it introduced no new Yjs state.

The WebSocket also had no positive durability signal for a client update. A
browser could not distinguish an update persisted by the document room from one
lost with the connection, so reconnect behavior either risked data loss or had
to replay state without an idempotent acknowledgement contract.

Model operations exposed the same ownership problem across an asynchronous
boundary. Capturing the current revision after waiting for a local model could
label output based on older source as current. Resource mutations additionally
needed to refresh annotations, claims, publications, and candidates without
letting a REST response overwrite live editor state.

## Decision

Use an acknowledged, server-led Yjs protocol for each document connection.

On an authorized WebSocket connection, `DocumentRoom` sends the current full
binary Yjs state first and then sends the exact server control message
`{"type":"sync","protocol":1,"revision":n}`. WebSocket ordering makes the
control message the boundary after which the browser may treat the document as
synchronized. The browser sends no speculative state on open.

After synchronization, browser source and bibliography editors are projections
of their corresponding `Y.Text` values. Local input changes Yjs first, and
remote Yjs updates update the editors. REST workspace refreshes may update
resource metadata but must not assign editor text or the displayed
collaboration revision.

Retain every local binary update in an ordered in-memory queue until the server
answers with `{"type":"ack","revision":n}`. The server sends that
acknowledgement only after the update is durably reflected in the document room,
or after recognizing that a replay is already reflected there. On reconnect,
the browser resets only unacknowledged queue entries for replay after the new
server-led synchronization boundary.

Determine whether an update is new from Yjs update integration, not from a
visible-string comparison. Causally new state is persisted and materialized,
advances the workspace revision once, and is broadcast to collaborators. A
duplicate or replay that introduces no Yjs state is acknowledged at the current
revision without persistence, rebroadcast, or a revision increase. This keeps a
lost acknowledgement recoverable without turning reconnects into document
changes.

Keep JSON control messages server-owned and strictly versioned. Protocol version
one permits only these exact shapes:

- `{"type":"sync","protocol":1,"revision":n}`
- `{"type":"ack","revision":n}`
- `{"type":"revision","revision":n}`
- `{"type":"presence","collaborators":n}`
- `{"type":"resources"}`

Revision and collaborator counts are non-negative safe integers, and unknown or
extended message shapes are invalid. The `resources` message is an invalidation
signal, not a resource payload. It requests a coalesced authorized REST refresh
of non-editor workspace resources so bursts cannot create concurrent snapshot
writes.

Capture a model operation's source, selected range, source revision, and
selected evidence as one immutable base before awaiting the model provider.
Persist a returned candidate with that captured revision, and reject candidate
creation if the server's materialized revision has moved. Candidate application
continues to validate the revision again.

## Trigger

A strict collaboration review found that snapshot hydration and Yjs could
overwrite one another, reconnects could create false revisions, and an old
model result could be stamped with a newer revision after its asynchronous
request completed.

## Consequences

**Positive:**

- Editor text has one live owner after synchronization, preventing REST/Yjs
  last-writer races.
- An acknowledgement gives clients a precise durability boundary and makes
  replay after a lost connection safe.
- Replayed Yjs updates are idempotent and do not invalidate revision-bound
  candidates or passage operations unnecessarily.
- Resource metadata can refresh without replacing collaborative text.
- Model candidates retain the actual source and evidence base used to produce
  them.

**Negative:**

- The browser now carries an explicit synchronization state machine and an
  ordered outbound queue.
- The initial protocol still sends full Yjs state on every connection, which
  will need measurement and possibly state-vector synchronization as documents
  grow.
- A candidate produced during active collaboration is rejected more often,
  requiring the researcher to regenerate it from a current base.
- The in-memory outbound queue alone does not survive a tab or browser restart;
  ADR-106 layers an identity-scoped browser copy and acknowledged-state-vector
  replay over this protocol for offline authoring.

**Neutral:**

- Yjs remains a supporting collaboration representation; materialized Markdown
  and BibTeX remain the portable authored artifacts.
- This implements the first concrete synchronization protocol under ADR-037
  and sharpens the candidate validation boundary described by ADR-039 without
  changing either decision.
- REST workspace representations may still contain source fields for API
  consumers; the browser editor simply does not use refreshes as a text owner
  after synchronization.

## Alternatives Considered

### Exchange full client and server state immediately on open

Yjs updates are mergeable, but simultaneous initialization leaves readiness
ambiguous and turns reconnect traffic into false revision changes unless every
path independently handles idempotency.

### Hydrate editor text from every REST snapshot

This keeps rendering simple but creates a second writer outside the Yjs order.
A slow metadata request can then replace a newer local or remote edit.

### Send updates without acknowledgements

Fire-and-forget traffic has less protocol state, but the browser cannot know
whether a disconnect happened before or after durable persistence. Dropping the
update risks data loss; replaying it without an acknowledgement/no-op contract
creates unnecessary revisions.

### Stamp model candidates after the provider responds

This uses the latest revision number but not necessarily the source that
produced the output, allowing stale prose to pass a revision check under a new
label.
