# ADR-256: Use PDF.js Viewer Components for Paper Navigation

**Status:** Implemented

**Date:** 2026-11-23

**Amends:** [ADR-041](./ADR-041-render-pdfs-with-pdfjs.md),
[ADR-126](./ADR-126-buffer-pdf-zoom-rendering.md), and
[ADR-222](./ADR-222-keep-pdf-display-and-annotation-modes-independent.md)

## Context

The Library and project readers used PDF.js to paint each page but calculated
page sizes, buffered redraws, and rendered nearby pages themselves. Separate
fixes were needed to zoom around the pointer, keep a scrolled page anchored
when its dimensions changed, and prevent blank frames as zoom settled.

## Decision

Use the `PDFViewer` component from the pinned `pdfjs-dist` package for
single-page, continuous, and spread layouts. Its scroll container sits inside
the workspace pane. PDF.js measures pages, schedules visible-page rendering,
draws the canvas and selectable text, and applies scale, fit, and rotation.
Kirjolab's controls and gesture handlers send commands to the component. Page
changes feed the existing tab, route, and reading-position owners.

Load the matching viewer module and its styles on demand. Keep PDF document
loading and extraction available independently to metadata and analysis
callers. The reader uses the same compatibility runtime and worker as those
callers.

Keep evidence capture, link policy, highlights, notes, and ink in Kirjolab.
Their overlays attach to the rendered page. When a flowing page is evicted
and rendered again, its annotation layer recovers the canonical markups, tool,
selection, and pending drawing state from the presenter. Derived artifacts
and stored geometry retain their existing formats.

## Consequences

The application shares one upstream page layout and rendering engine across
the three display modes. PDF.js now determines when pages and text layers
enter and leave the DOM. Reader upgrades must exercise that lifecycle as well
as pinch anchoring, redraw continuity, and annotation alignment. The viewer
module and stylesheet add a download the first time a reader opens.

## Alternatives considered

- Maintaining the two custom renderers would retain independent layout,
  gesture, and redraw behavior for single and flowing pages.
- Embedding the complete PDF.js application would introduce another toolbar,
  history owner, and annotation editor inside the workspace.
- The browser's PDF iframe remains suitable for a read-only shared copy. Its
  selection and page DOM are inaccessible to the workspace's evidence tools.
