# ADR-048: Secure the Browser Collaboration Boundary

**Status:** Implemented

**Date:** 2026-07-10

## Context

Kirjolab renders collaboratively authored Markdown as HTML and accepts
collaborative document updates over a browser WebSocket. Both paths carry data
chosen by another workspace member into a researcher's authenticated browser
session.

Escaping authored raw HTML and filtering unsafe URL schemes is necessary but
not sufficient. Satteri heading attributes can reach the final hast tree, so an
event-handler attribute could otherwise survive parsing and execute when the
preview is inserted into the DOM. The application also needs a browser security
policy that limits the impact of a future sanitizer regression.

The WebSocket upgrade is an authenticated `GET`, while the existing
same-origin mutation check applies only to non-GET requests. Authentication and
workspace membership alone therefore do not prove that an upgrade was
initiated by Kirjolab's own browser origin. Once connected, accepting arbitrary
text frames would also let a client impersonate server-owned presence and
revision messages, while an invalid binary Yjs update could interrupt the room
before being rejected cleanly.

## Decision

Treat preview output and collaborative WebSocket traffic as one secure browser
collaboration boundary.

Sanitize the final Satteri hast representation after all semantic and heading
plugins have run. Keep an explicit tag/property allowlist for the generated
preview vocabulary, preserve only the safe identity, presentation, semantic,
and accessibility properties the syntax needs, and remove event handlers,
active embeds, unsafe URL protocols, and unknown properties before
serialization. Authored raw HTML continues to render as text.

Return a Content Security Policy on application HTML as defense in depth. The
policy permits the self-hosted scripts, styles, workers, media, and browser
connections required by the current editor and documented local-model
integration, but does not permit inline or evaluated scripts. It also disables
plugin objects, base-URL rewriting, and framing. The policy does not replace
output sanitization.

Require every browser WebSocket upgrade to carry an `Origin` whose serialized
origin exactly matches the request URL's origin. Apply this check in addition
to authentication, catalog discovery, and workspace role authorization before
the request reaches `DocumentRoom`; missing and cross-origin values fail
closed.

Define and validate the WebSocket frame boundary. Clients may send bounded
binary Yjs updates and one bounded, versioned selection-metadata text message.
The document room verifies the selection against the current revision, file,
and text length, replaces any claimed identity with its server-assigned socket
identity, and never persists it. JSON presence, revision, selection-clear, and
protocol-error messages remain server-owned and cannot be accepted or
rebroadcast from a client. Reject malformed, oversized, stale, or unsupported
input without persistence, and close invalid senders with an appropriate
WebSocket protocol status.

## Trigger

A strict review of the first collaborative slices found executable Satteri
heading attributes, a same-origin check that did not cover WebSocket upgrades,
and an untyped text-frame path through the document room.

## Consequences

**Positive:**

- Collaboratively authored preview content cannot introduce executable browser
  attributes through supported Markdown syntax.
- A sanitizer regression has a separate browser-enforced script-execution
  boundary.
- A third-party site cannot join a workspace socket with the researcher's
  ambient browser credentials.
- Collaborators cannot impersonate server-owned revision or presence events.
- Invalid Yjs input is isolated to the offending connection instead of being
  persisted or broadcast.

**Negative:**

- New Satteri output elements or properties must be added deliberately to the
  sanitizer vocabulary.
- New browser-hosted resources and model connection modes may require an
  intentional Content Security Policy update.
- Browserless WebSocket clients must supply the expected origin or use a future
  separately authenticated protocol.

**Neutral:**

- Workspace authentication and membership remain necessary; origin validation
  is an additional browser-request boundary, not an identity mechanism.
- Yjs remains the collaborative data format and Durable Objects remain the
  coordination boundary.
- This decision strengthens the security portion of ADR-045 without changing
  the scientific Markdown syntax.

## Alternatives Considered

### Rely on raw-HTML escaping and URL filtering

This leaves executable attributes introduced by supported parser features and
offers no defense in depth if output filtering regresses.

### Rely on Content Security Policy alone

Policy support and future policy changes should not decide whether stored
preview output is safe. Sanitizing the final representation keeps the content
boundary explicit and testable outside a browser.

### Treat every authenticated WebSocket upgrade as same-origin

Authentication proves who the browser represents, not which site initiated the
upgrade. Ambient authentication can accompany a cross-site WebSocket request.

### Broadcast arbitrary client text frames

This is simple, but it lets clients forge server control messages and prevents
the protocol from enforcing a stable trust boundary.

## Implementation Note

ADR-037 introduced the sole client text-frame exception: an exact-key,
size-bounded `protocol: 1` selection message. The server owns collaborator
identity and validates revision and range before peer broadcast. All other
client text remains unsupported.
