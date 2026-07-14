# ADR-096: Recover and Scope Share Links

**Status:** Implemented

**Date:** 2026-07-14

**Partially supersedes:** [ADR-094](./ADR-094-use-revocable-read-only-share-links.md)

## Context

The original read-only capability stored only a SHA-256 hash and returned its
URL once. That minimized the effect of an access-object storage disclosure, but
an owner who closed the Share dialog could not copy the active link again. The
only recovery path was rotation, which needlessly invalidated a URL that may
already have been distributed.

Known collaborators can receive identity-based membership, but lightweight
external coauthors also need a deliberately narrower way to edit authored
Markdown without receiving private research, member, history, administration,
or general workspace access.

## Decision

Persist the current 256-bit token beside its SHA-256 validation hash in the
locator-keyed `WorkspaceAccess` Durable Object. Return a reconstructed URL only
from the existing owner-authorized read-only and edit status endpoints, and
mark those responses `Cache-Control: no-store`. Do not return a separate token
field. Continue validating public requests against the hash, and delete both
values on rotation or revocation.

Existing hash-only rows remain active after migration but cannot be recovered.
Report that state without a URL so the UI can explain that one replacement is
required. Every subsequently created link is recoverable.

Give each project at most one separate edit capability. Its public surface may
list authored Markdown files, render the canonical PDF, poll a bounded project
snapshot, and replace one authored file. Each mutation revalidates the token,
requires an exact same-origin `Origin`, enforces the existing 2 MB file bound,
and compares the expected revision before applying a Yjs splice. It exposes no
authenticated application client, member management, private research,
history, general API, or writable collaboration socket.
Permanent project deletion revokes both locator-scoped capabilities before
erasing the document room.

Hosted deployments must deliberately allow `/edit/*` through Cloudflare Access
so the Worker can enforce the bearer capability while authenticated workspace
and owner status routes remain identity protected.

Apply the token columns and edit-link tables through the existing ordered
SQLite migration ledger. These are schema changes inside an existing Durable
Object class and require no Wrangler class migration.

## Trigger

The Share control must let an owner retrieve an active link later, and edit
rights need the same create, retrieve, rotate, and revoke lifecycle.

## Consequences

**Positive:**

- Owners can copy an active read-only or edit URL after reopening or reloading
  the application.
- Rotation remains an intentional invalidation action rather than a recovery
  workaround.
- External writers receive a small, explicit editing surface instead of broad
  membership or the authenticated application.
- Revision checks prevent a link editor from silently overwriting concurrent
  project changes.

**Negative:**

- A disclosure of the locator access object's share rows reveals usable active
  URLs, so access to Durable Object storage and owner status routes remains a
  sensitive boundary.
- Links created before the token-retention migration cannot be reconstructed
  and require one replacement if their owner no longer has the URL.
- Anyone holding an edit URL can change authored Markdown until it is rotated
  or revoked.

**Neutral:**

- Bearer URLs remain revocable and independently validated on every request.
- Identity-based members continue to use the full collaborative application.

## Alternatives Considered

### Keep tokens only in browser storage

This would recover a link only in the browser profile that created it and would
still fail after storage clearing, device changes, or another owner session.

### Encrypt tokens with a deployment secret

This reduces direct database disclosure but introduces key configuration,
rotation, and recovery semantics for a small capability store. The existing
deployment has no suitable encryption-key lifecycle, so owner-only no-store
retrieval is the smaller explicit boundary.

### Give edit-link holders normal membership

Membership requires a known identity and exposes the full collaborative
workspace. It does not meet the narrow bearer-link use case.
