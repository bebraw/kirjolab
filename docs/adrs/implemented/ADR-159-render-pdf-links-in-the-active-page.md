# ADR-159: Render PDF Links in the Active Page

**Status:** Implemented

**Date:** 2026-07-21

## Context

Kirjolab renders one PDF page at a time through PDF.js so it can compose text,
private highlights, notes, and ink without handing the document to the browser's
built-in viewer. The canvas and text layers did not expose PDF link annotations,
so tables of contents, cross-references, and external citations appeared inert.

Replacing the reader with an embedded browser viewer would recover links but
would remove Kirjolab's private annotation layers and routable page state. The
reader therefore needs link behavior without adopting PDF.js's complete viewer
application.

## Decision

Read standard link annotations from the pinned PDF.js page model and project
their rectangles into a dedicated interaction layer for the active page.
Resolve named and explicit internal destinations through the loaded PDF
document, render the destination page in Kirjolab, and restore its available
position. Open external URLs in a new tab with opener and referrer isolation.

Keep this layer bounded to links. Forms, embedded scripts, attachments, and the
rest of PDF.js's full annotation-viewer surface remain outside the reader.

## Consequences

**Positive:**

- PDF tables of contents and cross-references work without leaving the reader.
- External references follow familiar document behavior without gaining access
  to the Kirjolab window.
- The application retains its lightweight single-page renderer and private
  annotation composition.

**Negative:**

- Link geometry and destination handling become another active-page render
  concern that must stay compatible with the pinned PDF.js model.
- Unsupported PDF actions remain inert rather than inheriting the full PDF.js
  viewer feature set.

## Alternatives Considered

### Embed the browser PDF viewer

This would provide broad native PDF behavior but cannot host Kirjolab's private
highlight, note, ink, and research-context layers.

### Bundle the complete PDF.js viewer

The full viewer includes link handling, but also adds navigation, form, history,
download, scripting, and presentation infrastructure that duplicates the
bounded reader and conflicts with the repository's lightweight constraint.
