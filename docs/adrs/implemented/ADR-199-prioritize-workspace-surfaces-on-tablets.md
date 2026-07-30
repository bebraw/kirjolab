# ADR-199: Prioritize Workspace Surfaces on Tablets

**Status:** Implemented

**Date:** 2026-07-30

## Context

The desktop workspace begins rendering the project rail, authoring pane, and
Context pane together at 72rem. An iPad in landscape crosses that breakpoint
with only enough width to satisfy the panes' hard minimums, leaving a private
PDF reader roughly 25rem wide after its tool rail. In portrait, selecting
Context hides authoring but leaves the project rail stacked above the PDF,
creating page scrolling around a separately scrolling document.

PDF search and document navigation also participate in the reader grid when
opened. A long outline can create a large implicit row, shrink the rendered page,
and then be clipped by the reader body's overflow boundary.

## Decision

Use three responsive workspace hierarchies:

- Narrow viewports show one task surface. Context hides both authoring and the
  project rail so the active research resource owns the available workspace.
- Tablet landscape Split shows authoring and Context side by side and omits the
  project rail. Explicit Editor-only mode retains the rail, while Context-only
  and PDF-only modes retain their existing focused behavior.
- The simultaneous project-rail, authoring, and Context layout begins at 90rem.

Render PDF search and document navigation as bounded overlays within the PDF
body. They may cover part of the document temporarily but must not add grid
tracks or change the reader's dimensions.

## Consequences

**Positive:**

- iPad portrait gives the PDF the complete workspace height.
- iPad landscape preserves side-by-side writing and evidence without reducing
  the PDF to its minimum width.
- Search and navigation cannot reflow or collapse the current page.

**Negative:**

- The project rail is one interaction away while using tablet Split.
- Auxiliary PDF panels temporarily cover part of the page.
- The layout now has a distinct intermediate-width hierarchy to maintain.

## Alternatives Considered

### Keep the three-pane breakpoint and auto-collapse only the project rail

An invisible zero-width rail would recover space, but the desktop grid and its
resizers would still govern tablet behavior and keep a marginal authoring/PDF
split at the breakpoint.

### Switch tablet landscape to one surface at a time

This maximizes each pane but removes the writing-beside-evidence workflow that
landscape tablets can support comfortably with two panes.

### Place PDF navigation below the page

This preserves the existing grid flow but spends vertical document space and
creates nested scrolling for long outlines. A transient overlay matches the
existing private annotation inspector hierarchy.
