# ADR-125: Turn PDF Pages with Trackpad Gestures

**Status:** Implemented

**Date:** 2026-07-15

## Context

The PDF viewer recognized touchscreen swipes through touch events. MacBook
trackpads expose the equivalent two-finger horizontal movement as wheel input,
so the touch path never observed it and pages did not change. Handling every
horizontal wheel event directly would risk multiple page turns from one
gesture's momentum and would conflict with panning a zoomed page.

## Decision

Accumulate horizontally dominant wheel input while an open PDF is at its
fitted zoom. Turn one page after 64 normalized pixels, then consume horizontal
momentum during a 420 millisecond cooldown. Normalize line and page delta modes
before applying the threshold, and reset partial movement after a pause or
direction reversal.

Only a qualifying horizontal gesture is prevented from reaching browser
navigation. Vertical scrolling remains native. Control-wheel pinch zoom keeps
its existing PDF zoom behavior, and PDFs above fitted zoom retain horizontal
panning rather than turning pages. Touchscreen swipe handling remains
independent.

## Consequences

**Positive:**

- MacBook two-finger swipes follow familiar previous/next page behavior.
- Trackpad momentum cannot skip several pages from one gesture.
- Vertical reading scroll, pinch zoom, and zoomed-page panning retain their
  existing meanings.

**Negative:**

- A horizontal gesture at the first or last page is consumed inside the PDF
  instead of navigating browser history.
- Threshold and cooldown values encode a deliberate interaction policy that
  needs browser-level regression coverage.

## Alternatives Considered

### Change page on every horizontal wheel event

Trackpads emit a stream of events with inertial tails, so one swipe could skip
many pages.

### Reuse touch events

Desktop browsers do not represent trackpad scrolling as touch input, leaving
MacBook gestures invisible to that implementation.

### Page while zoomed

This would take horizontal panning away from readers inspecting a magnified
page.
