# ADR-087: Reconcile Exact PDF Duplicates During Intake

**Status:** Implemented

**Date:** 2026-07-13

## Context

PDF intake stores bytes in R2 before the owner-keyed reference-library Durable
Object creates the corresponding draft. R2 supplies an ETag after that streamed
write, and the library already uses the derived fingerprint as a unique identity
key. Uploading the same bytes twice therefore reaches the correct identity
constraint, but currently exposes its SQLite error as a failed upload and leaves
the browser unable to locate the source that is already present.

Duplicate handling must remain owner-private, preserve immutable PDF artifacts,
and avoid turning lightweight collection into metadata matching. An exact byte
match is reliable enough for idempotent intake; similar titles, DOI values, or
editions are not.

## Decision

The owner-keyed reference-library Durable Object will resolve a PDF fingerprint
to either a newly created draft or the existing reference and artifact. Its
result will explicitly distinguish `created` from `existing`.

The upload API will stream every accepted PDF to a new R2 key so it can obtain
the storage fingerprint. When the Durable Object resolves that fingerprint to
an existing artifact, the API will await deletion of the redundant new R2
object before returning the existing source with HTTP 200. New drafts continue
to return HTTP 201.

An identity retained by a permanent-deletion tombstone cannot be silently
recreated. That case remains a conflict, and the redundant upload is deleted.

The browser batch queue will represent `existing` as a successful terminal
state, show the stable reference key, and offer an action that reveals the
existing Library record. It will not retry such files or initiate metadata
refinement.

Fingerprint reconciliation is scoped to one owner's Durable Object. It does not
compare or disclose another owner's library and does not perform fuzzy title,
author, DOI, or semantic matching.

## Consequences

**Positive:**

- Repeated exact uploads become idempotent and point back to the canonical
  private-library source.
- Redundant R2 objects are removed as part of the request lifecycle.
- Batch progress distinguishes an already-collected paper from a failure.

**Negative:**

- The bytes must still be uploaded once because the storage ETag is not known in
  advance.
- R2 deletion becomes part of the successful duplicate response path and can
  delay or fail that request.
- Different encodings or revisions of the same paper remain separate sources.

**Neutral:**

- Archived sources remain canonical exact matches and may be revealed by the
  browser without being restored automatically.

## Alternatives Considered

### Hash the PDF in the browser before upload

This could avoid uploading a known duplicate but would require a lookup endpoint
and duplicate hashing work in the browser. The server would still need to treat
its owner-scoped authority as canonical, so the extra protocol is not justified
for the first slice.

### Treat the uniqueness collision as an ordinary failure

This preserves storage identity but gives the researcher no useful resolution
and incorrectly encourages retrying an operation that already succeeded in an
earlier intake.

### Merge by title, DOI, or extracted metadata

Metadata can be incomplete or wrong during collect-now, refine-later intake.
Fuzzy merging risks combining editions or unrelated works and belongs in a
separate reviewed reconciliation workflow.
