# ADR-152: Use a Capability-Scoped Share Editor

**Status:** Implemented

**Date:** 2026-07-19

**Partially supersedes:**
[ADR-094](./ADR-094-use-revocable-read-only-share-links.md) and
[ADR-096](./ADR-096-recover-and-scope-share-links.md)

## Context

Kirjolab's read-only and editable bearer links already have deliberately narrow
server contracts. The read-only route rendered an output-oriented viewer,
while the edit route rendered a separate small editor. Their different page
structures made the two link types feel unrelated and caused project-file
navigation, responsive behavior, status, and preview presentation to drift from
the authenticated editor.

Using the authenticated application itself would create the wrong security
boundary. That client assumes identity-authorized workspace APIs, Yjs document
state, private research, comments, history, export, and administrative actions.
A disabled-control mode would make a bearer capability appear broader and
would risk treating client visibility as authorization.

The useful part to share is therefore the editor's presentation model, not its
authenticated runtime or API access.

## Decision

Render valid `/share/{locator}.{secret}` and `/edit/{locator}.{secret}` pages in
one shared editor shell. The shell uses the same project-file, source, preview,
responsive-layout, and status hierarchy for both capabilities, while its mode
is established by the already validated route:

- a read-only capability renders an actual read-only source surface and the
  current rendered PDF preview; revision/reset notices refresh the live view
  without granting mutable collaboration state;
- an edit capability renders the same source surface as writable and preserves
  bounded debounced whole-file replacement with expected-revision conflict
  checks, autosave feedback, snapshot refresh, and the existing presence-only
  caret/selection exchange; and
- the shell identifies the active read-only or edit capability plainly and
  includes only controls that the corresponding narrow server contract can
  perform.

Keep the two bearer routes, token lifecycles, and server APIs distinct. Every
page, source, preview, snapshot, mutation, and WebSocket request continues to
revalidate the appropriate current capability before resolving project state.
Edit mutations and both WebSocket upgrades retain their exact same-origin
checks; writes retain the 2 MB bound and expected revision. Rotation and
revocation continue to invalidate outstanding requests and close established
sockets. Invalid, rotated, and revoked URLs continue to return the ordinary
not-found response.

The common shell is not the authenticated application client. It receives no
identity session or general workspace API, and it exposes no member identities,
private research, stored PDFs, comments, history, general exports,
administration, or writable Yjs channel. UI visibility is never an
authorization decision: server-side capability validation and scope remain
authoritative even when a control is absent or a request is constructed
outside the interface.

Continue serving bearer pages and their scoped resources with non-cacheable,
no-referrer responses. Keep the deliberate Cloudflare Access bypass limited to
`/share/*` and `/edit/*`; authenticated application routes remain protected.

This decision supersedes only ADR-094's dedicated output-viewer presentation
and ADR-096's separate edit-page presentation. Their bearer-token validation,
revocation, response, API, origin, revision, data-exposure, and socket
boundaries remain in force. In particular, ADR-094's rejection of loading the
authenticated application in a disabled mode still applies.

## Trigger

The project-sharing experience should work like Overleaf's link flow: a
recipient lands in a recognizable editor interface, with the link's read or
write capability determining what that interface can do, and without creating
an account.

## Consequences

**Positive:**

- Read-only reviewers and external writers learn one project-file and preview
  layout instead of two unrelated share pages.
- The public experience can reuse editor presentation primitives without
  widening either bearer capability.
- Read-only behavior is represented by a genuinely read-only source control,
  while editable links retain clear save and conflict feedback.

**Negative:**

- The shared shell needs a capability-aware client adapter that remains
  separate from the richer authenticated application runtime.
- Presentation reuse can suggest feature parity, so capability labels and
  absent private or administrative actions must stay unambiguous.
- Changes to common shell primitives must be verified in read-only, editable,
  desktop, and phone modes.

**Neutral:**

- Anyone holding a current URL retains exactly the read or write authority of
  that bearer capability; account creation is still unnecessary.
- Public links remain live project views rather than pinned revisions.
- The authenticated editor continues to use its identity-authorized APIs and
  full Yjs collaboration channel.

## Alternatives Considered

### Load the authenticated application and disable unauthorized controls

This would maximize client-code reuse, but the authenticated runtime assumes
broad APIs and private state. Hiding or disabling controls cannot enforce a
bearer capability and would expand the public attack surface.

### Keep two independently designed share pages

This preserves the smallest immediate change but continues layout and behavior
drift between read-only, edit-link, and authenticated project experiences.

### Combine read-only and edit links into one route or token type

This would simplify routing superficially but blur materially different
authorities and make rotation, revocation, server validation, and user-facing
capability communication less explicit.
