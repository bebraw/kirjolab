# ADR-127: Integrate Library Context into the Header

**Status:** Implemented

**Date:** 2026-07-15

## Context

The standalone Library used a 64-pixel global header followed by a second
48-pixel context strip for the permanent Library tab, active PDF tab, document
status, page navigation, and resource actions. The second row repeated the
navigation hierarchy and reduced the vertical space available to PDF pages.

Workspace mode also uses the context strip, but there it belongs specifically
to the context side of a split authoring surface. Promoting those tabs globally
would incorrectly imply that they control the editor as well.

## Decision

Render the existing context tab model in the global header when the application
is in standalone Library mode. The permanent Library tab follows Kirjolab and
Settings, and open private PDF tabs follow Library. Each document tab contains
its own labelled close icon; tabs remain open until that icon is activated.
Omit private PDF help text and page navigation from this header because the
annotation inspector provides contextual feedback and the persistent left rail
already owns page navigation. Omit the project layout selector as well: the
standalone Library already gives its context surface the full content area, so
"PDF only" does not offer another meaningful layout.

Do not render a second context strip inside the standalone context surface.
Keep the existing pane-local strip unchanged in workspace mode. At tablet
widths, truncate the document title while retaining its close icon.

The tab and control elements keep their existing ids, roles, keyboard behavior,
route synchronization, and application state; only their server-rendered host
changes by application mode.

## Consequences

**Positive:**

- Standalone PDFs gain 48 pixels of vertical reading space.
- Library, the active document, and its actions read as one navigation
  hierarchy.
- The private PDF reader has one page-navigation control instead of duplicate
  header and rail affordances.
- No duplicate tab state or client-side portal is introduced.
- Workspace context remains visually and semantically local to its pane.

**Negative:**

- The global header carries more controls while a desktop PDF is active.
- Responsive rules must truncate document titles without obscuring their close
  icons at tablet widths.
- The server view has one shared tab fragment with two conditional hosts.

## Alternatives Considered

### Position the lower strip over the header with CSS

Fixed positioning would only simulate integration, complicate collision and
focus behavior, and leave the DOM hierarchy in the wrong region.

### Integrate context tabs in every application mode

Workspace tabs belong to the right-hand context pane and should not appear to
govern the authoring editor.

### Remove resource tabs and actions entirely

This saves more space but loses multi-resource context, keyboard navigation,
and explicit document closure rather than improving their placement.
