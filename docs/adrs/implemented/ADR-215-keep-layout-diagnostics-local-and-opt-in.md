# ADR-215: Keep Layout Diagnostics Local and Opt-In

**Status:** Implemented

**Date:** 2026-08-03

**Amends:** [ADR-183](./ADR-183-report-deployment-and-shell-diagnostics.md)

## Context

Physical-iPad layout failures can depend on browser chrome, the software
keyboard, coarse-pointer controls, orientation, and Split View or Stage Manager
widths. Desktop responsive simulation and Chromium touch emulation cannot
reproduce every one of those states. A screenshot shows the symptom but not the
layout and visual-viewport geometry that caused it.

Continuous client telemetry would collect more browser information than this
diagnosis needs. An unrestricted DOM scan could also become expensive around a
PDF text layer or accidentally include authored identifiers in a copied report.

## Decision

Activate layout diagnostics only for the exact foreign query parameter
`layout-debug=1`. When the parameter is absent or has another value, the
application performs no diagnostic DOM measurement, adds no diagnostic event
listeners, and renders no diagnostic interface.

Inside the opted-in session, render a fixed, flow-neutral local control. Keep a
bounded history of resize, orientation, focus, and Visual Viewport changes so a
keyboard transition is not lost when the copy control receives focus. Keep the
control inside the current Visual Viewport when browser chrome, zoom, or the
software keyboard moves its edges. Refresh and copy measure only a bounded
inventory of stable header, workspace, toolbar, and editor elements plus their
visible direct controls. Report document and visual-viewport dimensions,
breakpoint and input media, safe structural labels, selected layout styles,
horizontal overflow, and sibling overlap.

Include the browser-shell fingerprint, but never include authored text, control
values, project titles, workspace identity, URL or query state, dynamic resource
identifiers, or application data. Copy remains an explicit local action through
the existing browser/PWA clipboard fallback. Do not upload, persist, or emit the
report as telemetry.

Treat `layout-debug` as diagnostic browser state rather than reconstructible
project state. Workspace route synchronization preserves it as a foreign query
parameter. Physical-iPad inspection remains the final check for keyboard and
browser-chrome behavior.

## Consequences

**Positive:**

- A failing physical iPad can produce actionable geometry without reloading or
  dismissing the keyboard first.
- Normal sessions perform no diagnostic measurement or event observation and
  expose no debug surface.
- Reports can distinguish breakpoint, visual-viewport, intrinsic-control, and
  stale-shell branches without collecting manuscript content.

**Negative:**

- The bounded inventory may need extension when a new persistent workspace
  surface becomes relevant to layout diagnosis.
- A copied report still requires the researcher to send it explicitly.

**Neutral:**

- Playwright coverage validates the opt-in and geometry contract but does not
  replace physical-device verification.

## Alternatives Considered

### Send continuous layout telemetry

This could capture intermittent failures automatically, but it creates a remote
data path and privacy policy disproportionate to a local layout investigation.

### Keep an always-running observer hidden in normal sessions

This removes the query step but adds production work and state to every editor
session without evidence that it is needed.

### Scan every DOM descendant on copy

This finds unknown elements, but PDF text layers can make it expensive and
dynamic identifiers make the report harder to keep content-free.

### Rely only on desktop responsive simulation

This is useful for regression coverage but cannot reproduce all iPad browser
chrome, keyboard, windowing, and native-control behavior.
