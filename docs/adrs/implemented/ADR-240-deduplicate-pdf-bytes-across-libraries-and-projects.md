# ADR-240: Deduplicate PDF Bytes Across Libraries and Projects

**Status:** Implemented

**Date:** 2026-09-25

**Amends:** [ADR-087](./ADR-087-reconcile-exact-pdf-duplicates.md)
and [ADR-061](./ADR-061-preserve-project-revisions-and-milestones.md)

## Context

Each private Library currently stores a PDF under an owner-scoped R2 key and
deduplicates exact uploads only within that owner's Library. Project PDFs
have separate project-scoped objects, including copies made for duplicated
or revision-seeded projects. Multiple Libraries and projects can therefore
store identical PDF bytes independently.
[ADR-239](./ADR-239-link-member-library-sources-to-project-references.md)
lets several members link their private Library sources to one project
publication. Showing one choice for identical PDFs would still leave redundant
physical copies unless storage identity is separated from Library ownership.

An R2 ETag is not a general cross-upload content identity:
[multipart ETags](https://developers.cloudflare.com/r2/objects/upload-objects/)
depend on part boundaries. Existing owner-local fingerprints and tombstones
remain meaningful for owner-private intake, but a shared byte object needs a
verified content digest independent of upload method. Physical deduplication
must not merge Library records or reveal another researcher's holdings.

## Decision

Store one immutable PDF byte object per verified SHA-256 content digest in a
private, content-addressed R2 namespace, whether the PDF originates in a
private Library or a project. Keep separate owner-scoped Library artifact
records and project-scoped PDF resource records pointing to the shared blob.
Each logical record retains its own identity, associations, filename, rights
where applicable, provenance, annotations, and lifecycle. Treat the blob as
bytes only; do not place owner- or project-specific metadata on the shared
R2 object.

The upload path must receive and validate the complete PDF before resolving
the digest to a shared blob. A cross-owner match reuses bytes internally but
returns an ordinary result in the requester's Library or project scope. It
must not report whether another owner or project already stored the PDF,
disclose their metadata, or offer a global fingerprint lookup. Owner-local
duplicate handling remains governed by ADR-087.

Use one server-side blob authority to coordinate creation and retention for
each digest. Register each Library or project resource's logical reference
before treating its blob use as committed. Deletion, backup cleanup, project
duplication, revision seeding, and migration must not delete shared bytes
while any active artifact, project PDF, retained project revision, or
authorized backup still requires them. Make incomplete upload and
cross-authority failure cleanup retryable and idempotent; reclaim a blob only
after the authority verifies that no retained reference remains.

A retained project revision that owns a project PDF continues to require its
bytes under ADR-061. A historical project link to a member's private Library
source retains citation and provenance only; it does not by itself retain the
blob or authorize future reads after that source link or membership is
revoked. Owner-authorized Library backups may retain bytes under their
existing recovery contract.

Duplicated and revision-seeded projects retain independent PDF resource
records, authorization, and revision histories, while their identical bytes
may point to the same blob. Deleting or restoring a PDF in one project must
not change another project's logical resource. This narrows ADR-061's
independent-object requirement to independent logical ownership rather than
independent physical byte copies. Project images remain under their existing
storage rule.

Serve PDFs only through the existing authenticated Library or project routes.
Resolve the authorized logical artifact first, then read its blob; possession
of a digest or internal object key is never an access grant. Keep public
bearer routes and unrelated private Library records outside this access path.

Migrate existing owner- and project-scoped PDF objects by verifying their
bytes and registering the shared blob before replacing any logical pointer.
Retain old objects until their new pointers and required backup or historical
references are safe. Do not infer byte identity from titles, DOI values,
filenames, or the existing R2 ETag alone.

## Trigger

Two contributors may bring byte-identical private PDFs into the same project
reference, and legacy project PDFs may contain the same bytes. The reader
should present one document, and storage should retain one physical copy
while preserving every Library and project resource's independent authority.

## Consequences

**Positive:**

- Exact duplicate PDFs consume one physical byte object across Libraries and
  projects without collapsing private or project resource identities.
- Contributors can revoke or delete their own logical artifact without
  deleting bytes still used by another researcher.
- Project PDF discovery can collapse exact duplicates while retaining every
  underlying authorization edge.

**Negative:**

- Shared-blob coordination and garbage collection add a cross-owner storage
  authority and failure-recovery work.
- Uploads still transfer bytes to the server before a verified digest can be
  trusted; a match does not avoid upload bandwidth.
- Existing owner- and project-scoped objects, backups, duplication, revisions,
  and deletion paths need a careful migration before old copies can be
  reclaimed.

**Neutral:**

- Library records, project PDF resources, annotations, source links, and exact
  owner-local duplicate responses remain distinct from physical blob storage.
- Different revisions or encodings of a paper remain different byte objects.

## Alternatives Considered

### Keep owner- and project-scoped physical copies and collapse only the reader list

This preserves the current storage lifecycle but continues to store duplicate
bytes across contributors and projects, contrary to the single-copy model.

### Use the R2 ETag as a global blob key

An ETag reflects the storage upload method, especially multipart part
boundaries, and is not a stable content digest across all upload paths.

### Merge identical Library artifacts across owners

One global artifact would conflate private filenames, bibliographic links,
rights, annotations, deletion choices, and ownership. Only immutable bytes
should be shared.

### Delete the shared blob when one owner deletes their artifact

That would break other owners' authorized artifacts and retained history.
Blob reclamation must follow the last required logical reference.
