# ADR-094: Use Revocable Read-Only Share Links

**Status:** Implemented

**Date:** 2026-07-14

## Context

Kirjolab's existing share flow grants a known Cloudflare Access identity full
member collaboration. Reviewers often need to inspect a manuscript without
joining its editing and research workspace. An identity invitation is too broad
for that job, while a stable public project URL would make accidental disclosure
hard to contain.

## Decision

Give each non-demo project at most one active read-only bearer link. The link
contains the opaque workspace id and a 256-bit random secret. Store only the
secret's SHA-256 hash in the project `WorkspaceAccess` Durable Object. Creating
a replacement atomically invalidates the previous link; revocation deletes the
hash.

Resolve valid links before identity authentication, then render a dedicated
server-side page from the current project snapshot. Expose only the composed
Markdown and authored project files. Do not load the authenticated
client application or expose member identities, private-library material,
project PDFs, comments, history, exports, API access, or a WebSocket.

Return the link only when it is created. Later status reads reveal whether a
link is active and when it was created, but cannot recover the secret. Send the
page with `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. Invalid,
rotated, and revoked links all return the ordinary not-found response.

Hosted deployments must deliberately allow `/share/*` through Cloudflare
Access so the Worker can perform the bearer-token check while the rest of the
application remains identity protected.

## Trigger

The product adds an Overleaf-style read-only link alongside identity-based
collaboration.

## Consequences

**Positive:**

- Reviewers can inspect live composed Markdown without gaining edit capability.
- Rotation and revocation contain forwarded or accidentally disclosed links.
- A storage leak does not reveal usable share URLs.
- The public surface stays small and independent from the authenticated app.

**Negative:**

- Anyone holding the current URL can read the shared manuscript and source.
- The owner must copy a newly created URL before closing the dialog because the
  plaintext secret cannot be recovered later.
- Hosted routing needs a narrow Cloudflare Access bypass policy for the share
  path.

**Neutral:**

- The page is a live view rather than a pinned project revision.
- Link readers do not appear as collaborators or receive live WebSocket pushes;
  reloading fetches the latest state.

## Alternatives Considered

### Give link holders the authenticated application in disabled mode

The existing client assumes broad workspace APIs and collaboration state. A UI
flag would leave a much larger authorization surface and make read-only safety
depend on every client control being disabled correctly.

### Persist the plaintext token so the link can always be copied

This improves convenience but turns an application-storage disclosure directly
into active share URLs. Rotation is a small, explicit recovery flow.

### Publish a permanent public workspace URL

This avoids token management but provides no meaningful secrecy or containment
when a manuscript was shared unintentionally.
