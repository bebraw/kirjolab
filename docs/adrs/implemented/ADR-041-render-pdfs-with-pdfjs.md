# ADR-041: Render PDFs With the PDF.js Display Layer

**Status:** Implemented

**Date:** 2026-07-10

## Context

Kirjolab needs text selection, page-aware geometry, external highlights, and
bidirectional navigation inside imported PDFs. A browser PDF plug-in can display
the artifact but isolates its selection and rendering DOM from the application.
Embedding the complete stock PDF.js viewer would add a second application shell
and expose far more editing surface than the evidence-capture workflow needs.

Stored geometry must remain meaningful when the viewer width, pixel density, or
zoom changes. Canvas pixels and viewport CSS coordinates are rendering details,
not stable selectors.

## Decision

Use the `pdfjs-dist` display layer to render one visible page at a time into an
application-owned canvas and text layer. Serve the matching PDF.js worker as a
generated typed-client asset.

Store each selection as one or more rectangles normalized to the rendered page
in top-left coordinates, with every `x`, `y`, `width`, and `height` value in the
inclusive zero-to-one page space. Retain the exact quote and normalized prefix
and suffix alongside geometry. Geometry restores a highlight for the exact PDF
artifact; textual selectors remain the recovery path.

Kirjolab will not expose PDF.js annotation editing or mutate imported PDF bytes.

## Trigger

The second product slice replaces manual annotation entry with in-app PDF
evidence selection and durable source-to-manuscript navigation.

## Consequences

**Positive:**

- Kirjolab owns the selection DOM and can create typed scholarly resources.
- Normalized rectangles survive viewer resizing and device-pixel-ratio changes.
- Rendering one page bounds canvas memory for long papers.
- Stored highlights remain separate from immutable PDF bytes.

**Negative:**

- PDF.js adds about one megabyte each to the generated browser and worker assets.
- Selection quality still depends on the PDF's text layer; scanned documents
  require a later OCR workflow.
- Text reconciliation across different editions remains uncertain and must not
  silently relocate annotations.

**Neutral:**

- Page navigation is application UI rather than the stock PDF.js viewer.
- Selection geometry is an ordered list because one quotation may span lines.

## Alternatives Considered

### Embed the browser PDF viewer

The plug-in is lightweight to integrate but its cross-origin or privileged DOM
does not provide a dependable application selection contract.

### Embed the complete PDF.js viewer

This supplies mature controls but duplicates Kirjolab's shell and introduces
annotation-editing behavior outside the scholarly-resource model.

### Store viewport pixels

Pixel rectangles are easy to capture but drift as soon as the viewer width,
zoom, rotation, or device pixel ratio changes.
