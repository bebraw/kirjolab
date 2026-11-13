# ADR-250: Resolve Current PDF Objects Before Editing

**Status:** Implemented

**Date:** 2026-11-13

## Context

A shared annotated paper retained its first page but lost later page content.
The source rendered correctly in independent readers: its final cross-reference
table selected current page and font objects. The editing library, pdf-lib 1.17.1,
instead scanned physical
objects and expanded an obsolete object stream, replacing current definitions
before annotations were added. Saving that in-memory document persisted the
damage. Changing output compression cannot repair an incorrect load.

The initial checks generated and inspected simple PDFs with the same editing
library. They covered annotations and delivery without independently testing
revision authority, all page text, or fonts. The production smoke used one page.

## Decision

Normalize PDF object authority before both private annotated export and share
creation. Start from the final `startxref`, follow traditional tables or
cross-reference streams and their `Prev` chains, and let the newest definition,
generation, or free entry win. A hybrid revision's supplemental stream overrides
its table. Expand only the compressed members selected by those references.
Serialize a fresh context without object-stream or cross-reference containers,
then pass that unambiguous document to the existing annotation renderer.
For a stream missing its length, permit only a bounded repair within the next
authoritative physical object boundary and an unambiguous terminal delimiter;
never search unrelated bytes to guess a stream boundary.

Use the existing pdf-lib object parser, stream codecs, and writer. Keep lexical
framing and reference resolution in a bounded adapter; do not modify global
parser behavior or add a second production PDF dependency. Guard each stream
decoder's allocation through its typed per-instance `ensureBuffer` hook. This
adapter is explicitly coupled to pinned pdf-lib 1.17.1 and must be revalidated
when that dependency changes.

Bound the source to 25 MiB, the normalized document to 50 MiB before allocation,
cross-reference entries to 100,000, revision sections to 128, and object nesting
and page-tree depth to 64. Check page counts and parent ancestry before editing.
Structure decoding permits at most 16 MiB per stream and a shared 32 MiB
work budget including decoded intermediates and allocated predictor/copy data.
Resolve shared decoding metadata once per object and reject dependency cycles.
Reject ambiguous, encrypted, unsupported, or over-budget input with a clear
error before storing or publishing a sharing copy. Preserve the original PDF
and the immutable-copy contract of ADR-249.

Use handcrafted synthetic PDFs for regressions, including incremental, stream,
hybrid, active-compressed, and obsolete-compressed objects. Verify all exported
pages' text and fonts with PDF.js, independently of the editing implementation,
and verify annotations on later pages. Do not commit private papers as fixtures.

## Trigger

A real multi-page LaTeX paper exposed the editing parser's replacement of
current objects with stale compressed definitions during annotated sharing.

## Consequences

**Positive:**

- Current page, font, and content objects survive annotation and sharing.
- Legitimate compressed PDFs remain supported without accepting stale objects.
- Independent compatibility tests cover behavior missed by same-library checks.

**Negative:**

- Normalization adds parsing and serialization work before annotation editing.
- The adapter adds PDF-format code and a pinned decoder-hook maintenance burden.
- Ambiguous files that permissive readers repair, and files beyond the explicit
  structural limits, are rejected for editing.

**Neutral:**

- Existing shared copies retain their bytes; the owner creates a new link to
  distribute a corrected copy.
- Original storage, annotation records, and access boundaries do not change.

## Alternatives Considered

### Ignore every object stream

This repaired the reported source diagnostically but would discard valid page
and font objects in ordinary compressed PDFs.

### Continue loading and saving directly with pdf-lib

Disabling output object streams does not prevent stale definitions from winning
during loading. Validation with the same parser also repeats its blind spot.

### Add a separate PDF rewriting engine

A new native or WebAssembly engine would add a dependency and Worker deployment
cost. The existing low-level parser and codecs can support bounded resolution
without introducing that operational dependency.
