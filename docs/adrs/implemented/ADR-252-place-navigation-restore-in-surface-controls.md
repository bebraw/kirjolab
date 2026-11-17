# ADR-252: Place Navigation Restore in Surface Controls

**Status:** Implemented

**Date:** 2026-11-17

## Context

The standalone Library persisted hidden top navigation and exposed a fixed
top-right **Show nav** button. The Library's **Add reference** action occupied
the same space, producing an overlap. An earlier PDF-inspector offset accounted
for that floating button in one surface but did not protect other controls.

## Decision

Give navigation restoration normal layout space in each standalone Library
surface. Render a labelled action in the Library's existing action row and an
icon action at the top of the private PDF control rail. Reuse one server-rendered
button helper for their accessible names and shared data attribute.

Keep the existing progressive Lit navigation owner, storage key, header toggle,
and body-state projection. The owner binds both restore triggers, updates them
together, and focuses the trigger with rendered geometry after hiding the
header. Hidden parent panels determine which trigger is available. Either
restore action shows the header and returns focus to its toggle. Listener
teardown covers both triggers.

Remove fixed positioning and the PDF-inspector clearance offset. The PDF reader
continues to use the full dynamic viewport when the header is hidden; the rail
absorbs the restore control without taking space from document content.

## Consequences

- Library actions and navigation restoration cannot compete for the same
  top-right overlay space.
- Existing toolbar and rail primitives preserve themes and touch targets.
- Two surface-specific triggers share one behavior and persistence owner.
- The PDF rail gains one visible control when navigation is hidden.
- Browser regressions cover 320–1440 pixel widths, both color themes, focus,
  persistence, Library menu use, and PDF-inspector separation.

## Alternatives Considered

- Additional top/right offsets would depend on unrelated surface geometry.
- A dedicated recovery bar would consume PDF reading height after hiding the
  header.
- Moving one button between DOM parents would add lifecycle and focus handling
  to a control that can bind two stable triggers directly.
- Separate navigation controllers would duplicate header listeners and state.
