# ADR-082: Capture Private Library PDF Highlights

**Status:** Implemented

**Date:** 2026-07-13

## Context

ADR-081 lets an owner read a private library PDF without sharing or importing
it into a project, but deliberately suppresses every selection callback. The
library already owns private highlight records with an artifact, page, quote,
and optional comment. Without capture in the reader, that implemented storage
contract has no direct reading workflow and researchers must copy quotations
manually into a separate library surface.

Project evidence annotations include resilient text context and normalized
geometry because they anchor collaborative scholarly claims. Private library
highlights are intentionally smaller personal-memory records. Treating a
private selection as project evidence would cross authorization and authorship
boundaries; expanding the private schema to project annotation geometry would
also add a migration before the simpler workflow has demonstrated that need.

## Decision

The kind-qualified `library-pdf:` reader uses a distinct private-highlight
capture mode. Selecting PDF text creates an ephemeral draft containing the
current artifact, page, and exact quote. The owner may add a comment and must
explicitly save the draft through the owner-private library highlight route.
Selection alone never mutates durable state.

Saved private highlights appear beside the active artifact and navigate back
to their recorded page. They do not paint persistent PDF geometry because the
library highlight schema does not store geometry. The existing transient draft
overlay may show the selection until it is saved or cancelled.

Private highlight capture never exposes project annotation tools, inserts a
citation, links manuscript prose, changes the workspace snapshot, or shares the
highlight. Sharing remains the separate explicit snapshot action established
by ADR-059. ADR-081's kind-qualified authorization and local reading-state
rules remain in force; only its blanket read-only selection rule is replaced.

## Consequences

**Positive:**

- Upload, metadata review, reading, and private excerpt capture form one usable
  library workflow.
- Existing owner-private storage and API contracts gain a direct reader UI
  without another dependency or persistence authority.
- Explicit save preserves the distinction between inspecting text and creating
  durable personal research memory.
- Project evidence and sharing remain separate, deliberate actions.

**Negative:**

- Saved private highlights navigate by page and quote but cannot repaint exact
  geometry after the transient selection is cleared.
- Private and project PDF modes now have different selection semantics in the
  shared reader.
- Editing and deleting private highlights remain outside this slice.

**Neutral:**

- The library highlight schema and existing sharing API remain unchanged.
- Workspace PDF annotation behavior remains unchanged.

## Alternatives Considered

### Keep private PDFs fully read-only

This preserves ADR-081 exactly but leaves the existing private-highlight API
disconnected from the normal reading workflow.

### Save every selection automatically

Project highlight painting uses automatic persistence, but private reading
often includes exploratory selection. Automatic save would turn ordinary text
selection into an unexpected library mutation.

### Store full geometric selectors immediately

This would allow persistent painted highlights, but requires a library schema
migration and editing semantics before the smaller page/quote/comment workflow
has established the need.
