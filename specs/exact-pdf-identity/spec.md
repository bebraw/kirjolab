# Feature: Exact PDF Identity

## Blueprint

### Context

Researchers may select a PDF that their private Library already contains. Exact
repetition should lead them to the existing source instead of presenting a
database constraint as an upload failure.

### Architecture

- The owner-keyed reference-library Durable Object is the authority for exact
  PDF identity.
- A PDF identity is the R2 ETag-derived fingerprint already stored with its
  immutable artifact. It represents exact stored content, not bibliographic or
  semantic equivalence.
- Creating a PDF draft returns the canonical reference and artifact together
  with an explicit `created` boolean.
- A new fingerprint creates one draft and returns HTTP 201 with `created: true`.
- A fingerprint already attached to an active or archived source returns that
  original source with HTTP 200 and `created: false`.
- Before returning an existing source, the upload API awaits deletion of the
  redundant object just streamed to its temporary unique R2 key.
- An identity retained by a permanently deleted source returns a conflict rather
  than silently resurrecting or replacing it. The redundant R2 object is still
  deleted.
- Browser batch intake treats an existing source as completed, displays its
  reference key, and can reveal its Library card. It neither retries the file
  nor starts metadata refinement.
- Identity never crosses owner-library boundaries and never falls back to fuzzy
  title, author, DOI, or metadata matching.

### Anti-Patterns

- Do not expose a raw SQLite uniqueness error to the browser.
- Do not keep the redundant R2 object after resolving an existing source.
- Do not restore an archived source merely because its PDF was uploaded again.
- Do not treat exact duplicates as failed queue items.
- Do not turn exact byte identity into an automatic bibliographic merge.

## Contract

### Definition of Done

- [x] Exact repeat uploads resolve to the existing owner-private source.
- [x] The redundant R2 object is deleted before the duplicate response returns.
- [x] New and existing results have distinct HTTP and typed domain outcomes.
- [x] Batch progress shows a terminal **Already in library** state and stable
      reference key.
- [x] Researchers can reveal active or archived matching records.
- [x] Automated coverage protects Durable Object identity, API cleanup, queue
      semantics, and browser behavior.
- [x] The ADR is marked implemented after all quality gates pass.

### Regression Guardrails

- At most one reference and one canonical artifact represent a fingerprint
  inside one owner library.
- Exact duplicate intake never mutates reference metadata, archive state, tags,
  collections, reading state, notes, highlights, or project links.
- Existing results are terminal successes and are excluded from **Retry failed**.
- Another owner's reference identity is never queried or returned.
- Every noncanonical object written during duplicate intake is deleted on both
  resolved-duplicate and conflict paths.

### Scenarios

**Scenario: An active PDF is selected again**

- Given: the owner's Library already contains the same PDF bytes
- When: the PDF is uploaded again
- Then: the API deletes the redundant object and returns the original reference
  and artifact as already existing

**Scenario: An archived PDF is selected again**

- Given: the exact PDF belongs to an archived Library source
- When: batch intake resolves it as existing
- Then: the queue shows its reference key and the reveal action makes the
  archived card visible without restoring it

**Scenario: Similar metadata describes different bytes**

- Given: two PDFs share a title or DOI but have different fingerprints
- When: each is uploaded
- Then: exact identity does not merge them

**Scenario: A deleted identity is selected again**

- Given: permanent deletion retained the source identity tombstone
- When: the exact PDF is uploaded
- Then: intake returns a conflict and deletes the redundant object
