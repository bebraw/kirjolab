# ADR-155: Authorize Linked PDFs by Project Membership

**Status:** Implemented

**Date:** 2026-07-19

**Partially supersedes:**
[ADR-059](../implemented/ADR-059-separate-private-research-from-projects.md)

## Context

ADR-059 requires a researcher to link a bibliographic reference, review PDF
redistribution rights, and explicitly pin a PDF snapshot before collaborators
can read an attachment. In practice, collaborators reasonably understand an
authenticated project invitation to include the papers that support its linked
references. The separate artifact-share state duplicates the reference link,
creates misleading “attached but unavailable” UI states, and makes ordinary
collaboration harder.

Kirjolab also supports read-only and editable bearer links that may be posted
publicly. Those capabilities deliberately expose only authored project files
and the rendered manuscript. Treating a public bearer as project membership
would redistribute reference PDFs to anyone who obtains the URL and would
violate the narrow capability boundary established by ADR-152.

## Decision

An authenticated project member may read every current PDF artifact attached
to a library reference linked to that project. The project reference UUID is
the durable authorization edge; access is derived at request time without
copying the PDF into project storage or creating an artifact `researchShare`.
Attaching another PDF later makes it available to current members, while
unlinking the reference or removing project membership removes future access.

The project API resolves linked artifacts through the project owner's library
and streams bytes only after independently verifying current authenticated
membership, the project-reference link, and the artifact-to-reference
relationship. It does not expose the owner's general Library API or unrelated
attachments.

Read-only and editable bearer capabilities do not grant reference-PDF access.
Their pages, document routes, sockets, and server contracts remain limited to
authored project files and the rendered manuscript, even when a bearer URL is
publicly visible. No reference-artifact endpoint accepts a share-link or
edit-link secret.

Notes, highlights, tags, collections, reading state, web captures, and other
private research remain owner-private unless their existing explicit sharing
contract says otherwise. Legacy project-local PDFs and their explicit
publication links remain supported. New artifact shares are no longer needed;
historical pinned artifact snapshots remain readable only through retained
revision history.

Artifact-rights metadata no longer gates authenticated member reading. It may
remain available for future export or redistribution policy, but project
membership itself is the deliberate access decision.

## Trigger

Publication context exposed that a project could contain a linked reference
whose attached PDF was visible only to the library owner. The collaboration
model should make related papers available to invited members without widening
public bearer links.

## Consequences

**Positive:**

- Linking a reference is sufficient for authenticated collaborators to read
  its attached PDFs.
- The UI no longer needs a rights-and-snapshot workflow for ordinary project
  collaboration.
- PDF bytes stay deduplicated in owner-scoped storage and unrelated Library
  state remains private.
- Public read-only and edit links retain their existing narrow authority.

**Negative:**

- Linking a reference now exposes all of its current PDF attachments to every
  authenticated project member.
- Artifact access follows live reference attachment state rather than a pinned
  project snapshot, so later attachment or deletion changes current access.
- Owners must treat project membership as permission to distribute linked
  papers within that authenticated collaboration group.

**Neutral:**

- Private notes and annotations continue to require separate sharing choices.
- Legacy project-local PDFs remain separate resources until a later migration
  explicitly removes them.

## Alternatives Considered

### Keep explicit artifact shares

This preserves the narrowest privacy default but retains the redundant staged
workflow and the confusing difference between a linked reference and its PDF.

### Grant PDFs to every project bearer link

This is mechanically uniform, but a bearer URL may be posted publicly. It
would turn manuscript review or editing access into uncontrolled source-PDF
redistribution.

### Copy every linked PDF into project storage

This would make ownership simple inside the project but duplicate large files,
create synchronization and deletion ambiguity, and discard the shared
reference library as the artifact authority.
