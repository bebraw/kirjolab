# ADR-122: Separate PDF Selection from Creation

**Status:** Implemented

**Date:** 2026-07-15

## Context

Private PDF highlights, freehand lines, and page notes can all be changed after
creation, but their editing paths were split between the annotation list and
implicit note dragging. Draw also treated touch input as ink before the viewer
could recognize a two-finger pinch, which made navigation destructive on iPad.

## Decision

Use explicit Select, Text, Note, and Draw tools for private PDF annotation.
Select is the only mode that makes saved page annotations directly interactive:

- selecting a highlight opens its comment editor;
- selecting a line exposes color, width, and deletion actions;
- selecting a note exposes text and deletion actions, while dragging its pin
  updates the normalized page position.

Note creation renders a pending pin at the chosen position until save or cancel.
The annotation toolbar remains a single row and uses a compact, labelled export
action.

Touch input always belongs to PDF pan and pinch-zoom navigation while Draw is
active. Pen and mouse pointers create freehand ink. Imported PDF bytes remain
immutable; all edits update the external owner-private annotation resources.

## Consequences

**Positive:**

- Editing is discoverable from the page instead of depending on list scanning
  or hidden gestures.
- Selection cannot accidentally create another annotation.
- iPad touch navigation no longer leaves stray ink.
- Note placement is visible before the note is committed.

**Negative:**

- Finger drawing is unavailable; touch users need Apple Pencil for ink.
- The viewer must coordinate hit testing across highlight, drawing, note, text,
  and gesture layers.
- Drawing style updates add a mutable annotation API operation.

## Alternatives Considered

### Keep every saved annotation interactive in every tool

This makes note dragging convenient but allows editing gestures to conflict with
text selection, note placement, drawing, and pinch navigation.

### Delay touch ink until a pinch can be ruled out

This adds latency and still makes a one-finger navigation attempt ambiguous.
Reserving touch for navigation follows the established tablet distinction
between fingers and a precision pen.

### Edit only from the annotation list

The list remains useful for overview and sharing, but it does not communicate
which geometry on the current page will change.
