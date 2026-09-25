# ADR-239: Link Member Library Sources to Project References

**Status:** Proposed

**Date:** 2026-09-25

**Would amend:** [ADR-155](../implemented/ADR-155-authorize-linked-pdfs-by-project-membership.md)

## Context

Researchers upload PDFs to their own private Libraries and reuse them across
projects. Today, linking a reference authorizes members to read every PDF
attached to the **project owner's** Library record for that reference. The
project API resolves the owner's Library at read time. Another project member
can upload a project-owned PDF, but cannot contribute a PDF from their own
private Library to the shared reference. PDF ownership and reuse therefore
depend on who supplied the paper.

The intended flow is to upload to a personal Library and then make its PDFs
available in chosen projects. A source link may expose all PDFs attached to
that Library reference, including later attachments. This matches the
existing rule for the project owner's linked source, but extending it to
member-owned Libraries requires an explicit cross-owner authorization edge.
That edge cannot be inferred from titles, DOI values, citation keys, or
filenames.

## Decision

Let an authenticated project member explicitly link one of their own private
Library references to a publication they can access in the project. The
member chooses the project and target publication. The link records the
project publication identity, the contributor's verified Library owner
identity, and the contributor's stable Library reference identity. It does
not copy PDFs into project storage or change the project's bibliographic
record.

After linking, every PDF currently attached to that private Library
reference is readable by authenticated members of that project. Later PDFs
attached to the same Library reference become available there too. A
contributor can link the same private source to several projects through
separate choices. The project owner's existing linked-reference PDFs retain
their current all-attached-PDF behavior under ADR-155.

The project-facing PDF catalog exposes only bounded metadata for artifacts
reached through active project-to-Library-source links. Streaming revalidates
project membership, the active link, the artifact's current attachment to
that contributor's Library reference, and the verified Library owner. Private
notes, highlights, tags, reading state, unrelated references, and Library
object keys remain private. Public read-only and edit bearer links do not
receive PDF access.

Warn the contributor before linking that all current and future PDFs attached
to the selected private Library reference will be readable by authenticated
project members. A member may contribute only from their own Library; access
to a project publication never grants write access to another person's
Library. The project publication remains the shared citation identity even
when several members link their separate private source records to it.

Collapse byte-identical PDFs connected to the same project publication into
one visible reader choice using the verified content identity from
[ADR-240](./ADR-240-deduplicate-pdf-bytes-across-libraries-and-projects.md). Keep
every underlying Library artifact and authorization edge separate while their
bytes share one physical object. When opening the choice, prefer the current
viewer's own authorized copy, if present, so their
private reading context remains available; otherwise select a stable
authorized copy. If that copy becomes unavailable, reconcile the choice
against the remaining authorized copies without exposing a private artifact
or losing the project-level PDF entry.

Do not add a request queue, owner approval workflow, or preferred-PDF marker.
The contribution is an explicit act by the member who owns that Library source.
PDF selection in
the reader remains a separate concern under
[ADR-238](../implemented/ADR-238-navigate-related-pdfs-from-reader.md).

Removing a contributor's project membership revokes future access through
that contributor's private Library source links. Retain the project's
bibliographic citation and bounded provenance for existing relationships and
revision history, without continuing to stream the contributor's PDF bytes.
The contributor or the project owner may also remove a contributed source
link. Removing the project link does not delete or modify the contributor's
private Library record or PDFs. Authored citations and bounded provenance
remain in the project, while PDFs no longer reachable through an active link
are shown as unavailable. Do not cascade the removal into manuscript text or
separately shared evidence.

## Trigger

A request-and-approval proposal and a project-owned upload proposal both
obscured the intended sequence: upload to a personal Library, then attach the
source to selected projects. The existing all-PDF access rule can remain;
the missing capability is linking a member's private source to a shared
project publication.

## Consequences

**Positive:**

- Contributors retain one private PDF collection and can reuse a source
  across projects without copying bytes.
- Project members can supply papers for shared references without asking the
  project owner to import them into the owner's Library.
- Explicit source links explain why each PDF appears in a project; unrelated
  private Library PDFs stay hidden.

**Negative:**

- Project PDF reads must resolve and authorize artifacts across different
  members' private Library authorities rather than only the project owner's.
- Linking a source exposes all its current PDFs and later attachments to the
  selected project's members until the link or artifact attachment changes.
- Exact-duplicate collapse must reconcile multiple underlying artifact and
  permission identities, especially when one contributor leaves or revokes a
  link.

**Neutral:**

- The project's canonical citation and bibliography remain project state;
  linking a private source does not overwrite their metadata.
- Existing project-owned PDFs and explicit publication-PDF links remain
  supported unless a later migration decides otherwise.
- Private annotations and other research material continue under their
  separate sharing rules.

## Alternatives Considered

### Require owner approval of member PDF requests

The owner would become a bottleneck for papers that a collaborator already
owns and is willing to share. It would also require a new durable request and
approval workflow without adding control over the contributor's Library.

### Upload every contributed PDF into project storage

This reuses existing project PDF APIs but duplicates private Library assets
across projects and makes a collaborator's paper project-owned rather than
reusable from their Library.

### Let members modify the project owner's Library reference

This avoids a cross-owner source link but crosses the private Library write
boundary. Project membership must not permit changes to another person's
Library.

### Grant access to selected PDF artifacts one by one

Per-artifact grants let a contributor share only some attachments, but would
diverge from the current linked-reference rule and make later PDFs unavailable
until separately approved. The source link is explicit, and its all-PDF
effect is disclosed before creation.
