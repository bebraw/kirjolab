# ADR-249: Share Immutable Annotated PDF Copies

**Status:** Implemented

**Date:** 2026-11-13

## Context

A researcher can export a colleague's PDF with private highlights, comments,
page notes, and drawings, but handing over that review currently requires a
separate file-hosting service. The recipient needs one link for browser reading
or download without joining a project or signing in.

Project bearer links remain manuscript capabilities under ADR-155. They must
not become a way to browse the owner's Library. An annotated review also needs
a stable boundary: later private notes must not silently appear in an already
distributed link.

## Decision

Add a separate owner-created capability for an immutable annotated PDF copy.
Creation captures the selected artifact's saved annotations through the existing
annotated-export renderer and stores the resulting bytes in the existing
`PAPERS` R2 binding at `pdf-shares/{sha256(token)}.pdf`. Original PDF blobs and
private annotation records remain authoritative and unchanged. Updated feedback
requires another explicit share creation.

Read the source annotations by artifact identity rather than through the
Library's bounded navigation snapshot. Reject a source exceeding 10,000 combined
highlights and markups or the 4 MiB serialized-input bound with `413`; never
publish a truncated subset of saved feedback.

The owner's existing `ReferenceLibrary` Durable Object owns the share records
and their revocation state. Each capability has a cryptographically random
256-bit token. Following ADR-096, retain the current token so only the verified
owner can recover the same URL later; validate public access through its digest.
Keep owner token listings, internal storage keys, and owner identity out of
public responses; the recipient page uses only its own capability in PDF URLs.
Bound active shares and source PDF rendering using the feature specification's
limits. No additional binding, dependency, or external file host is introduced.

Expose the capability at `/share/pdf/{token}`, separately from manuscript URLs
of the form `/share/{locator}.{secret}`. The page and its `/document.pdf` route
independently validate active access and the source artifact's continued
existence. Both are read-only, non-cacheable, and carry no-referrer policy;
`?download=1` serves the same stored bytes as an attachment. Revocation or
permanent deletion of the source removes future access. Revocation cannot
remove files already downloaded by a recipient.

Null the bearer token before deleting a generated copy, including within the
source's permanent-deletion transaction. Retain its digest and cleanup state
after the artifact disappears so failed R2 deletion remains retryable. Sweep at
most 100 pending records after permanent reference deletion and on subsequent
authenticated PDF-share API operations; mark cleanup complete only after R2
deletion succeeds.

Owner-only API routes list recoverable links, create copies, and revoke them.
Creating or revoking a copy requires the existing exact same-origin mutation
boundary. A share never authorizes a Library API, project API, or annotation
mutation. The `/share/pdf/` prefix reuses the deployed `/share/*` Access bypass,
with the Worker retaining capability validation.

Generated sharing copies and bearer records are delivery state, excluded from
portable Library/project exports and owner-backup projections. Restoring a
portable research archive must not restore active public capabilities. Original
PDFs and annotations retain their existing backup contract.

## Trigger

A researcher reviewing a colleague's paper needs to send its annotated PDF as
one readable, downloadable link directly from the private PDF reader.

## Consequences

**Positive:**

- A recipient can read or download one reviewed copy without an account.
- The owner can retrieve and revoke links after reopening the reader.
- Later private annotations remain private until deliberately shared again.
- Existing storage, annotation rendering, and authentication boundaries remain
  reusable.

**Negative:**

- Each active share stores another derived PDF, and updated annotations require
  a new link.
- Anyone possessing a link can read and download its copy until revoked;
  retaining tokens for owner retrieval makes their storage sensitive.
- Portable recovery preserves the research but requires the owner to create
  new sharing copies.

**Neutral:**

- Project membership and manuscript bearer capabilities keep their existing
  scope.
- The reader makes sharing all saved annotations in the selected PDF an
  explicit action rather than a side effect of saving a note.

## Alternatives Considered

### Render current annotations on every public read

This avoids storing a derived copy, but later private feedback would become
public through an earlier link and every read would repeat PDF rendering.

### Add Library PDFs to manuscript share links

This would couple paper review to project creation and broaden a capability
that intentionally excludes private research.

### Require export and an external file host

This preserves the current implementation but leaves the requested handoff
outside Kirjolab and makes link management depend on another service.
