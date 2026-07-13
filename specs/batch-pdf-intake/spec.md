# Feature: Batch PDF Intake

## Blueprint

### Context

Researchers often collect several papers before they are ready to review any
metadata. Requiring one file-picker round trip per paper interrupts that capture
phase even though the Library already treats PDF upload and metadata refinement
as separate operations.

### Architecture

- The Library accepts selection or drag-and-drop of at most 20 PDF files per
  browser batch.
- The browser snapshots the selected `File` objects immediately, clears the
  file input so the same files can be selected again, and uploads the queue in
  selection order.
- Uploads remain sequential calls to the existing atomic
  `POST /api/library/pdfs` contract. There is no server-side batch endpoint or
  cross-file transaction.
- Each file exposes a visible and announced `queued`, `uploading`, `added`, or
  `failed` state plus aggregate progress. One failure does not stop later files.
- The Library refreshes once after a batch that added at least one PDF. It does
  not run metadata extraction or provider lookup during intake.
- Failed `File` objects remain only in page memory and can be retried together.
  Successful files are never resubmitted by that retry action. Reloading the
  page intentionally discards the ephemeral retry queue.
- The single-file API remains authoritative for content type, size, storage,
  provisional reference creation, and stable reference-key behavior.

### Anti-Patterns

- Do not make a batch all-or-nothing across independent papers.
- Do not add a second upload endpoint when the existing atomic endpoint can be
  composed safely by the browser.
- Do not begin metadata refinement, DOI lookup, or project linkage as an upload
  side effect.
- Do not persist browser `File` objects or failed upload bytes for later retry.
- Do not hide partial success behind one undifferentiated toast.

## Contract

### Definition of Done

- [ ] Users can select or drop several PDFs in one bounded action.
- [ ] Progress identifies the active file and the completed count.
- [ ] A failed file does not block later files from being added.
- [ ] Failed files can be retried without re-uploading successful files.
- [ ] Intake preserves the existing collect-now, refine-later behavior.
- [ ] Automated tests cover success, partial failure, retry, and the batch bound.
- [ ] The spec and ADR reflect the implemented behavior.

### Regression Guardrails

- Each network mutation uploads exactly one PDF through
  `POST /api/library/pdfs`.
- At most one PDF upload is in flight for a browser batch.
- Library state refresh occurs at most once after the queue finishes.
- Per-file failures remain visible until another batch replaces the status.
- The upload input and drop target remain keyboard- and screen-reader-usable.

### Scenarios

**Scenario: Several PDFs are collected**

- Given: a researcher selects three valid PDFs
- When: the batch runs
- Then: each PDF is uploaded in order, progress reaches three of three, and the
  Library refreshes once

**Scenario: One PDF fails**

- Given: the second file in a three-file batch is rejected
- When: the batch completes
- Then: the first and third files remain added, the second remains visibly
  failed, and the Library refreshes once

**Scenario: Failed files are retried**

- Given: a completed batch contains failed files
- When: the researcher chooses **Retry failed**
- Then: only those failed files enter a new sequential queue

**Scenario: A batch exceeds its bound**

- Given: more than 20 files are selected or dropped
- When: intake begins
- Then: no upload starts and the researcher is asked to choose a smaller batch
