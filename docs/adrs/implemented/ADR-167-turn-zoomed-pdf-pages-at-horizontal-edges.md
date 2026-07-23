# ADR-167: Turn Zoomed PDF Pages at Horizontal Edges

**Status:** Implemented

**Date:** 2026-07-23

**Supersedes:** ADR-125

## Context

ADR-125 reserved every horizontal gesture on a zoomed PDF for panning. This
prevented trackpad and touch gestures from changing pages until the reader
returned to fitted zoom. Always treating a horizontal gesture as page
navigation would restore page turning but make magnified content unreachable.

## Decision

Keep horizontal gestures as native panning while a zoomed page has content in
the gesture direction. At the corresponding horizontal edge, accumulate the
same bounded trackpad gesture or accept the same qualified touch swipe used at
fitted zoom, then turn one page.

After a gesture turns forward, position the next page at its left edge. After a
gesture turns backward, position the previous page at its right edge. This
allows an immediate reverse gesture while keeping trackpad momentum inside the
existing cooldown.

Vertical scroll and control-wheel pinch zoom retain their existing meanings.
Page buttons and PDF link destinations remain independent of edge-aware
gesture navigation.

## Consequences

**Positive:**

- Trackpad and touch users can turn pages without leaving their chosen zoom.
- Interior horizontal gestures continue to pan magnified content.
- A reverse gesture works immediately after a page turn.

**Negative:**

- A reader must reach the relevant horizontal edge before a zoomed-page
  gesture changes pages.
- Edge tolerance and post-turn placement become part of the browser interaction
  contract.

## Alternatives Considered

### Turn on every horizontal gesture

This makes page navigation immediate but removes horizontal access to magnified
content.

### Keep page gestures disabled while zoomed

This preserves unambiguous panning but forces readers to zoom out or use page
buttons between pages.

### Add a separate gesture mode

An explicit pan-versus-page mode adds persistent controls and state for an
interaction that page edges can disambiguate directly.
