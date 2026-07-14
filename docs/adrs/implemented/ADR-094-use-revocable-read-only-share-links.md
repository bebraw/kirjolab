# ADR-094: Use Revocable Read-Only Share Links

**Status:** Partially superseded by [ADR-096](./ADR-096-recover-and-scope-share-links.md)

**Date:** 2026-07-14

## Context

Kirjolab's existing share flow grants a known Cloudflare Access identity full
member collaboration. Reviewers often need to inspect a manuscript without
joining its editing and research workspace. An identity invitation is too broad
for that job, while a stable public project URL would make accidental disclosure
hard to contain.

## Decision

Give each project at most one active read-only bearer link. The link contains
an opaque public locator and a 256-bit random secret. Store the secret's
SHA-256 hash in the project `WorkspaceAccess` Durable Object. Creating a
replacement atomically invalidates the previous link; revocation deletes the
hash. ADR-096 supersedes the hash-only storage and one-time-return constraints
so owners can retrieve active links later.

ADR-095 refines locator routing for owner-scoped workspace identities while
preserving this token, rendering, and revocation contract.

Resolve valid links before identity authentication, then render a dedicated
server-side project viewer from the current project snapshot. Default to the
canonical bounded PDF rendering and provide explicit navigation to the composed
Markdown and each authored project file. Serve the PDF from a share-scoped
subroute that independently revalidates the bearer secret and sends inline,
no-store, same-origin-only headers. Keep same-origin frame restrictions on the
viewer, but omit cross-origin embedder isolation there because Chromium's
native PDF viewer runs in an extension frame that isolation blocks. Keep the
authenticated authoring application isolated. Do not load the authenticated
client application or expose member identities, private-library material,
stored PDFs, comments, history, other exports, API access, or a writable
collaboration WebSocket.

Keep an open viewer current through a separate share-scoped WebSocket. Validate
the bearer secret and exact same-origin `Origin` before connecting it to the
document room as a reader. Reader sockets receive revision/reset controls only,
never Yjs state or collaboration metadata, and reject all inbound frames. The
small share client reloads its selected server-rendered view after changes
settle. Rotation and revocation actively disconnect established readers.

Send the page with `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.
Invalid, rotated, and revoked links all return the ordinary not-found response.

Hosted deployments must deliberately allow `/share/*` through Cloudflare
Access so the Worker can perform the bearer-token check while the rest of the
application remains identity protected.

## Trigger

The product adds an Overleaf-style read-only link alongside identity-based
collaboration.

## Consequences

**Positive:**

- Reviewers can inspect the rendered result, composed Markdown, and its authored
  sources without gaining edit capability.
- Rotation and revocation contain forwarded or accidentally disclosed links.
- The public surface stays small and independent from the authenticated app;
  navigation uses ordinary server-rendered GET requests.
- Open reviewers see settled live edits without joining the writable
  collaboration protocol.

**Negative:**

- Anyone holding the current URL can read the shared manuscript and source.
- Hosted routing needs a narrow Cloudflare Access bypass policy for the share
  path.
- Opening the shared viewer renders the PDF through an additional authenticated
  share request and incurs its bounded generation cost.
- Each open viewer maintains one hibernatable reader WebSocket and reloads its
  selected output after a short editing quiet period.

**Neutral:**

- The page is a live view rather than a pinned project revision.
- Link readers do not appear as collaborators and receive only revision/reset
  notices; each refresh fetches the latest state through the bearer URL.

## Alternatives Considered

### Give link holders the authenticated application in disabled mode

The existing client assumes broad workspace APIs and collaboration state. A UI
flag would leave a much larger authorization surface and make read-only safety
depend on every client control being disabled correctly.

### Persist the plaintext token so the link can always be copied

This was initially rejected because it turns an application-storage disclosure
directly into active share URLs. ADR-096 later accepts that trade-off for
owner-recoverable links while retaining a validation hash and narrow retrieval
boundary.

### Publish a permanent public workspace URL

This avoids token management but provides no meaningful secrecy or containment
when a manuscript was shared unintentionally.
