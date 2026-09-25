# ADR-240: Deduplicate Private PDF Bytes Across Libraries

**Status:** Proposed

**Date:** 2026-09-25

**Would amend:** [ADR-087](../implemented/ADR-087-reconcile-exact-pdf-duplicates.md)

## Context

Each private Library currently stores a PDF under an owner-scoped R2 key and
deduplicates exact uploads only within that owner's Library. Two researchers
can therefore have separate stored copies of identical PDF bytes. Proposed
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
private, content-addressed R2 namespace. Keep separate owner-scoped Library
artifact records for each researcher who imports those bytes. Each artifact
retains its own identity, bibliographic association, filename, rights,
provenance, annotations, and project links, and points to the shared blob.
Treat the blob as bytes only; do not place owner-specific metadata on the
shared R2 object.

The upload path must receive and validate the complete PDF before resolving
the digest to a shared blob. A cross-owner match reuses bytes internally but
returns an ordinary owner-local artifact result. It must not report whether
another owner already stored the PDF, disclose that owner's metadata, or
offer a global fingerprint lookup. Owner-local duplicate handling remains
governed by ADR-087.

Use one server-side blob authority to coordinate creation and retention for
each digest. Register the owner's logical artifact before treating its blob
reference as committed. A deletion, owner backup cleanup, or migration must
not delete the shared bytes while any active Library artifact or retained
historical representation still requires them. Make incomplete upload and
cross-authority failure cleanup retryable and idempotent; reclaim a blob only
after the authority verifies that no retained reference remains.

Serve PDFs only through the existing authenticated Library or project routes.
Resolve the authorized logical artifact first, then read its blob; possession
of a digest or internal object key is never an access grant. Keep public
bearer routes and unrelated private Library records outside this access path.

Migrate existing owner-scoped PDF objects by verifying their bytes and
registering the shared blob before replacing any artifact's object pointer.
Retain the old object until its owner's new pointer and required backup or
historical references are safe. Do not infer byte identity from titles, DOI
values, filenames, or the existing R2 ETag alone.

## Trigger

Two contributors may bring byte-identical private PDFs into the same project
reference. The reader should present one document, and storage should likewise
retain one physical copy while preserving each contributor's separate
private ownership and project permission.

## Consequences

**Positive:**

- Exact duplicate PDFs consume one physical byte object across Libraries and
  projects without collapsing private artifact identities.
- Contributors can revoke or delete their own logical artifact without
  deleting bytes still used by another researcher.
- Project PDF discovery can collapse exact duplicates while retaining every
  underlying authorization edge.

**Negative:**

- Shared-blob coordination and garbage collection add a cross-owner storage
  authority and failure-recovery work.
- Uploads still transfer bytes to the server before a verified digest can be
  trusted; a match does not avoid upload bandwidth.
- Existing owner-scoped objects, backups, and deletion paths need a careful
  migration before old copies can be reclaimed.

**Neutral:**

- Library records, private annotations, project source links, and exact
  owner-local duplicate responses remain distinct from physical blob storage.
- Different revisions or encodings of a paper remain different byte objects.

## Alternatives Considered

### Keep owner-scoped physical copies and collapse only the reader list

This preserves the current storage lifecycle but continues to store duplicate
bytes for every contributor, contrary to the intended single-copy model.

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
