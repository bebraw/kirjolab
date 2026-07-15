# ADR-124: Host Private PDF Tools in the Left Rail

**Status:** Implemented

**Date:** 2026-07-15

## Context

The private PDF reader kept Select, Text, Note, Draw, drawing style, export,
status, editors, and the annotation list in a permanent right sidebar. On an
iPad this reduced the width available to the page even when the researcher was
only reading. The reader already had a narrow left page-navigation rail, so two
persistent control regions competed with the document.

## Decision

Use the left rail as the only persistent private PDF control surface. It hosts
page navigation, icon controls for Select, Text, Note, and Draw, annotated
export, and an annotation-list trigger. Every icon retains an accessible name,
tooltip, pressed state where applicable, keyboard focus treatment, and a
touch-sized target. Draw color, width, and undo appear contextually beside the
Draw icon.

On short tablet and desktop viewports, widen the rail just enough to arrange
page navigation and annotation actions in two columns. This preserves every
touch target and keeps the full toolbar within the reader; taller viewports
retain the narrow single-column rail.

Replace the permanent right sidebar with a transient annotation inspector that
overlays the page. Text capture, note placement, and selecting an existing
highlight, line, or note open the inspector automatically. The annotation-list
icon opens its overview explicitly. Closing the inspector clears unsaved
annotation drafts and restores focus to its rail trigger.

The external annotation resources, immutable source PDF, tool semantics, and
annotated export format do not change.

## Consequences

**Positive:**

- The PDF receives all horizontal space except the narrow tool rail.
- Navigation and annotation modes have one stable location in both the library
  and workspace readers.
- Editing controls remain discoverable without occupying space during reading.
- The rail scales to compact viewports without introducing another layout mode.

**Negative:**

- Editing temporarily covers part of the page.
- Icon-only controls depend on accessible labels and tooltips for unfamiliar
  symbols.
- Drawing style opens as a small flyout that must remain above the page layers.

## Alternatives Considered

### Keep a narrower permanent right sidebar

This still spends page width on controls that are idle for most reading time
and leaves navigation split across both sides.

### Move every editor into the left rail

Text fields, annotation cards, and sharing controls cannot fit in a useful
narrow rail. Expanding it for editing would recreate the original space cost.

### Use a bottom toolbar

A horizontal toolbar preserves width but consumes scarce vertical space on an
iPad and competes with browser and gesture regions.
