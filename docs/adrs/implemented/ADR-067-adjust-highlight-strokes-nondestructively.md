# ADR-067: Adjust Highlight Strokes Non-Destructively

**Status:** Implemented

**Date:** 2026-07-12

## Context

Touch and pencil text selection on tablets is inherently approximate. Deleting
and repainting an entire annotation to correct a small geometry or quotation
error discards useful intent and can disrupt downstream evidence links. Pixel
erasing is also poorly matched to normalized PDF text rectangles.

## Decision

Extend the stroke model from ADR-064 with bounded in-place stroke adjustment.
A researcher can correct the stroke quotation, nudge normalized geometry in
four directions, and widen, narrow, lengthen, or shorten its rectangles. Every
operation addresses one stable annotation and stroke identity.

Geometry adjustments use small normalized page increments, clamp to page
bounds, and preserve a visible minimum rectangle size. Touch controls meet a
44-pixel minimum target. The source PDF remains immutable, annotation identity
and creation provenance remain stable, and the annotation update version
advances for evidence freshness.

Adjustment is separate from using the annotation in prose or claims. Removing
the final stroke retains the guarded annotation-deletion rules from ADR-064.

## Consequences

**Positive:**

- Tablet selection errors can be corrected without repainting.
- Existing links and claim identity survive ordinary refinements.
- Normalized geometry remains independent of zoom and device pixels.
- Pure geometry operations are deterministic and independently testable.

**Negative:**

- Controls adjust whole stored rectangles, not arbitrary freehand polygons.
- Quote correction and geometry correction can temporarily diverge from PDF
  text extraction.
- Dense multi-rectangle strokes require repeating an operation across all
  rectangles.

## Alternatives Considered

### Mutate PDF annotation objects

This violates the immutable imported-artifact boundary and makes collaboration
dependent on PDF writer compatibility.

### Add pixel-level erasing

Pixel masks do not retain text-selection semantics or scale cleanly with PDF
zoom.

### Delete and repaint

This is simple internally but needlessly discards stable evidence identity and
is frustrating with touch input.
