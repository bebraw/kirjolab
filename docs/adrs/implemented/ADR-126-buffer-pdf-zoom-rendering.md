# ADR-126: Buffer PDF Zoom Rendering

**Status:** Implemented

**Date:** 2026-07-15

## Context

Mac trackpad pinch events arrived as a rapid control-wheel stream. The viewer
responded to every event by resizing the live canvas before PDF.js rendered the
new pixels. Canvas resizing clears its backing store synchronously, so the page
flashed black between asynchronous paints. Repeated rendering also discarded
most frames when a newer pinch event arrived.

## Decision

Transform the last committed PDF page immediately during trackpad and touch
pinch input. Debounce trackpad rendering until 140 milliseconds after the last
event. Render the new PDF canvas and text layer into detached buffers, then
commit the pixels, text nodes, page dimensions, highlight geometry, and zoom
state together after both renders complete.

Invalidate an in-flight buffered render when a newer zoom gesture begins.
Navigation, resize, and document changes cancel any pending trackpad debounce
before starting their own render. Preserve the text layer's active pointer
behavior when swapping its buffered contents.

## Consequences

**Positive:**

- The previous page frame remains visible throughout Mac trackpad zooming.
- Continuous pinch input produces one final high-resolution PDF.js render
  instead of clearing and repainting the live canvas for every event.
- Page navigation also swaps completed frames without exposing an empty canvas.

**Negative:**

- A render temporarily holds both the committed and replacement canvas in
  memory.
- Text-layer rendering must remain valid in a detached container and preserve
  the live layer's interaction state at commit.

## Alternatives Considered

### Debounce direct rendering only

This removes repeated clears but the final live-canvas resize can still expose
an empty frame before PDF.js finishes.

### Hide the page behind a loading color

This masks the symptom while retaining unnecessary intermediate renders and
removing useful visual continuity during zoom.

### Render every wheel event offscreen

Buffering prevents the flash, but producing frames that continuous pinch input
immediately invalidates wastes CPU and increases drawing latency.
