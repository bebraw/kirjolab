# ADR-038: Store PDF Annotations Separately With Resilient Selectors

**Status:** Proposed

**Date:** 2026-07-10

## Context

Kirjolab must let researchers annotate PDFs and connect those annotations to
publications, claims, notes, and authored passages. Embedding annotations by
rewriting source PDFs makes imported artifacts mutable, complicates sync and
deduplication, and does not provide domain relationships outside the file.

Page coordinates alone reproduce a highlight precisely but are fragile when a
different edition or regenerated PDF changes layout. Quoted text alone is more
portable but can be ambiguous and cannot reproduce geometry faithfully.

## Decision

Kirjolab will preserve imported PDFs as immutable blob resources and store
annotations as separate scholarly resources.

Each PDF annotation will retain:

- the PDF resource identity and content fingerprint
- page identity and geometric selectors
- exact quoted text
- prefix and suffix text sufficient for contextual recovery
- creation provenance and optional author commentary

Annotation resolution will prefer the exact artifact and geometry, then use
textual selectors as a recovery and reconciliation mechanism. An annotation may
link through the common scholarly resource model to publications, claims, notes,
document passages, and other annotations.

## Trigger

The architectural vision makes PDF annotation part of the traceable scholarly
record rather than a viewer-only feature.

## Consequences

**Positive:**

- Original PDFs remain stable and deduplicable.
- Annotations participate in hypermedia and provenance workflows outside the
  PDF viewer.
- Combined geometric and textual selectors support both faithful rendering and
  recovery.
- Annotation sync does not require binary PDF rewriting.

**Negative:**

- Exporting annotations into standard PDF annotation objects requires an
  explicit conversion step.
- Selector reconciliation can be ambiguous and must surface uncertainty.
- The viewer must render an external annotation layer.

**Neutral:**

- Blob storage and annotation metadata storage may use different persistence
  systems.
- Standard selector vocabularies may inform the schema without becoming a
  mandatory public protocol initially.

## Alternatives Considered

### Write annotations directly into PDFs

This improves interoperability with some PDF tools but mutates source artifacts,
creates binary synchronization conflicts, and does not model scholarly links.

### Store only page coordinates

Coordinates are precise for one artifact but cannot reliably recover a passage
from another rendering or edition.

### Store only selected text

Text is portable but may occur multiple times and cannot recreate the original
highlight geometry.
