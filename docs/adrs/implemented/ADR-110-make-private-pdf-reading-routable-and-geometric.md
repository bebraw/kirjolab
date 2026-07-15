# ADR-110: Make Private PDF Reading Routable and Geometric

**Status:** Implemented

**Date:** 2026-07-15

**Supersedes in part:** [ADR-082](./ADR-082-capture-private-library-pdf-highlights.md)

## Context

The standalone Library made private PDF annotation useful without a project,
but iPad review exposed several connected gaps. An open PDF had no browser
location or history entry, saved text highlights lost their visual geometry,
and export represented every saved quotation as a margin note. Tablet controls
also consumed vertical space while page gestures affected the application
instead of the document.

The page-and-quote-only highlight contract in ADR-082 deliberately deferred a
schema migration. The implemented workflow has now demonstrated the need: a
saved highlight that disappears from the page is not an adequate reading
artifact.

## Decision

- Standalone private PDFs use `/library/pdfs/{artifactId}` with an optional
  `page` query. Opening a PDF pushes browser history, page changes replace the
  current location, and browser Back restores the Library.
- New private highlights retain bounded normalized selection rectangles in
  addition to artifact, page, quote, and comment. Existing rows migrate with
  empty geometry and remain readable. Selection capture waits briefly for
  native iPad selection handles to settle and coalesces adjacent PDF.js DOM
  fragments into one rectangle per visual line, following Zotero's line-based
  highlight model. Private capture retains up to the library's 512-rectangle
  bound instead of inheriting the project annotation limit.
- The viewer paints saved private geometry. Annotated export emits standard PDF
  highlight annotations when geometry exists. Every saved multi-line highlight
  becomes one annotation whose `QuadPoints` contain all visual lines, rather
  than one annotation per DOM fragment. Legacy quote-only rows remain page
  comments. Text notes include explicit popup relationships so readers can open
  their contents.
- Page note anchors remain normalized and can be moved through an owner-private
  update route. Drawing undo selects the newest stroke explicitly by creation
  time and stable id.
- At tablet widths, standalone PDF page navigation occupies a narrow left rail
  and annotation tools occupy a right rail. Horizontal swipes begun in the
  page surround change page; two-finger gestures zoom only the rendered PDF.
  Pen samples update one draft SVG path instead of rebuilding every markup.
- The tab action is labelled **Keep tab** / **Allow replacement**, exposing the
  behavior formerly hidden behind **Pin** / **Unpin** terminology.

## Consequences

- Saved highlights remain visually inspectable in the app and interoperable in
  exported PDFs.
- Multi-line selection no longer silently loses later lines when a browser
  exposes many small rectangles, and exported highlights have one continuous
  line band and one comment target per saved selection.
- Deep links and browser navigation become reliable standalone-library
  contracts without persisting reading state collaboratively.
- Old highlights cannot recover geometry retroactively and therefore retain
  their legacy page-comment export.
- Tablet interaction adds bounded gesture state to the shared PDF viewer but
  no new dependency or persistence authority.

## Alternatives Considered

Keeping quote-only highlights preserves the previous schema but continues to
erase the visible result after save. Rasterizing all annotations would make
export look consistent but would destroy standard PDF annotation semantics and
make note contents inaccessible. Persisting every page change as a new history
entry would make Back step through reading rather than return to the Library.
