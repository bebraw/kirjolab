# ADR-177: Prevent Accidental iPad UI Zoom

**Status:** Superseded by ADR-196

**Date:** 2026-07-29

## Context

Kirjolab is a full authoring target on iPad. Safari can interpret a quick
second tap as viewport zoom, and it may zoom focused editable controls when
their text is smaller than its comfortable touch size. Either behavior can
leave the application chrome unexpectedly magnified while editing or moving
between dense controls.

The application also has legitimate zoom requirements. Researchers may use
Safari zoom for accessibility, while the PDF reader owns deliberate pinch zoom
inside its bounded reading surface. Preventing every viewport scale change
would solve the nuisance by removing useful and accessible behavior.

## Decision

Set `touch-action: manipulation` on the document root. This permits ordinary
panning and continuous pinch zoom while suppressing double-tap zoom throughout
the application.

On coarse-pointer devices, render input, textarea, and select text at no less
than `1rem` so focusing an editable control does not require Safari to enlarge
the viewport. Keep the viewport metadata at `width=device-width,
initial-scale=1`; do not add `user-scalable=no` or a fixed maximum scale.

Keep the PDF reader's explicit touch-action and custom pinch behavior unchanged.

## Trigger

Repeated accidental application zoom made routine iPad use frustrating even
though the responsive layout itself fit the tablet viewport.

## Consequences

**Positive:**

- Rapid taps no longer turn into accidental viewport zoom.
- Editable controls remain stable when focused on coarse-pointer devices.
- Deliberate pinch zoom and browser accessibility controls remain available.
- PDF pan and pinch ownership remains local to the reader.

**Negative:**

- Form controls may use slightly larger text on touch hardware, reducing the
  amount of text visible inside compact controls.
- Device emulation can verify the CSS contract but cannot replace a final
  physical-iPad interaction check.

**Neutral:**

- Mouse and trackpad typography is unchanged.
- No JavaScript gesture interception or browser-specific event API is added.

## Alternatives Considered

### Disable user scaling in viewport metadata

`user-scalable=no` or `maximum-scale=1` would communicate a stronger lock, but
it would also remove deliberate viewport zoom and weaken an important
accessibility fallback.

### Cancel Safari gesture events in JavaScript

Preventing `gesturestart` or touch events could block pinch zoom, conflict with
the PDF reader, and depend on browser-specific event behavior.

### Leave the viewport unchanged

This preserves all native gestures but leaves the reported iPad interaction
problem unresolved.
