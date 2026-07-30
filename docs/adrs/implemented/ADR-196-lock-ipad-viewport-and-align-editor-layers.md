# ADR-196: Lock iPad Viewport and Align Editor Layers

**Status:** Implemented

**Date:** 2026-07-30

## Context

ADR-177 suppressed double-tap zoom and raised editable controls to 16px on
coarse-pointer devices while preserving browser pinch zoom. Physical-iPad use
still allowed the application viewport to zoom. The generic textarea rule also
raised the transparent native manuscript textarea from 14.4px to 16px without
raising its visible syntax-highlight mirror. The native caret and visible
glyphs therefore used different geometry only on coarse-pointer Safari, which
explains why desktop Safari did not reproduce the caret defect.

## Decision

Application HTML surfaces will declare a device-width, fixed-scale viewport
with `maximum-scale=1` and `user-scalable=no`. The document root will allow
ordinary horizontal and vertical panning through `touch-action: pan-x pan-y`
without opting into browser pinch zoom. The PDF reader retains its narrower
touch-action rules and custom zoom implementation.

On coarse-pointer devices, the manuscript syntax-highlight mirror will use the
same 16px font size as the native textarea. Both layers continue to share the
same integral line height, padding, wrapping, scrolling, and text autosizing
policy.

## Consequences

**Positive:**

- iPad interactions cannot accidentally magnify the application viewport.
- The native caret and visible source glyphs use identical tablet geometry.
- Desktop typography and PDF-owned zoom behavior remain unchanged.

**Negative:**

- Browser viewport pinch zoom is no longer an accessibility fallback inside
  Kirjolab; operating-system text and display accessibility settings remain
  available.
- Device emulation verifies the declared contract but a physical iPad remains
  the final WebKit interaction check.

## Alternatives Considered

### Preserve viewport pinch zoom and intercept only double taps

This is ADR-177's behavior and did not satisfy physical-iPad use.

### Hide syntax highlighting while the iPad editor is focused

This would make caret geometry stable but unnecessarily remove useful syntax
feedback. Matching the two existing layers fixes the underlying mismatch.

### Add Safari-specific gesture event cancellation

Declarative viewport and touch-action policy is smaller, easier to test, and
does not add document-wide non-passive event listeners.
