# ADR-086: Coordinate Batch PDF Intake in the Browser

**Status:** Accepted

**Date:** 2026-07-13

## Context

ADR-084 separated source capture from later metadata refinement. The Library's
PDF endpoint consequently has a useful atomic contract: one bounded upload
creates one private artifact and one provisional reference. The visible intake
surface still accepts only one file-picker selection at a time, which makes the
collection phase unnecessarily repetitive.

A server-side batch endpoint could receive several files in one request, but it
would need multipart parsing, aggregate limits, partial-transaction semantics,
and a new response contract. It would also duplicate an already tested upload
authority solely for browser convenience.

## Decision

Kirjolab will coordinate bounded batch PDF intake in the authorized browser.
One batch contains at most 20 files and calls the existing
`POST /api/library/pdfs` endpoint sequentially in selection order. Each file is
an independent mutation, so a failure does not roll back earlier uploads or
prevent later uploads.

The browser will expose aggregate and per-file progress, refresh the Library
once after any successful uploads, and retain failed `File` objects in page
memory for an explicit retry. Retry will submit only failed files. The queue
will not survive a page reload and will never persist file bytes outside the
existing successful upload path.

File selection and drag-and-drop will feed the same queue. Intake will continue
to create sparse provisional records without extracting metadata, contacting a
provider, linking a project, or finalizing a reference key.

## Consequences

**Positive:**

- Multi-paper collection becomes one visible workflow without a new API.
- Independent mutations give partial success and straightforward retry.
- Sequential requests keep memory, network pressure, and progress ordering
  predictable.
- Existing upload validation, storage, provenance, and reference-key tests
  remain authoritative.

**Negative:**

- Large batches take longer than parallel uploads.
- Retry state disappears on reload because browser `File` objects are not
  persisted.
- The browser owns a small queue state machine and accessible progress UI.

**Neutral:**

- Users can submit another batch after the first completes.
- The per-file server size limit and failure responses remain unchanged.
- Metadata refinement remains an explicit later action.

## Alternatives Considered

### Add a multipart server-side batch endpoint

This centralizes orchestration but adds parsing, aggregate bounds, partial
failure rules, and another mutation contract without improving storage
atomicity.

### Upload several files concurrently

Limited concurrency could reduce elapsed time, but it complicates deterministic
progress and increases simultaneous browser and Worker pressure. Sequential
upload is sufficient for the first bounded slice.

### Treat the whole batch as one transaction

Rolling back already stored PDFs when another file fails would require cleanup
coordination across Durable Object and R2 state. Independent papers do not need
cross-file atomicity.

### Persist failed files for retry after reload

Persisting private PDF bytes in browser storage adds quota, cleanup, and privacy
policy that is disproportionate to a convenience retry.
