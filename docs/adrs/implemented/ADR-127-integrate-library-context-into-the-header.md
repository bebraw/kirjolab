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
Settings, open private PDF tabs follow Library, and active PDF status,
navigation, Keep tab, and Close actions occupy the header's trailing context
region before global account controls.

Do not render a second context strip inside the standalone context surface.
Keep the existing pane-local strip unchanged in workspace mode. At tablet
widths, retain the integrated PDF tab but omit duplicate page and pin controls
that already exist in the left PDF rail.

The tab and control elements keep their existing ids, roles, keyboard behavior,
route synchronization, and application state; only their server-rendered host
changes by application mode.

## Consequences

**Positive:**

- Standalone PDFs gain 48 pixels of vertical reading space.
- Library, the active document, and its actions read as one navigation
  hierarchy.
- No duplicate tab state or client-side portal is introduced.
- Workspace context remains visually and semantically local to its pane.

**Negative:**

- The global header carries more controls while a desktop PDF is active.
- Responsive rules must truncate document titles and suppress controls already
  available in the tablet rail.
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
and explicit Keep/Close behavior rather than improving their placement.
