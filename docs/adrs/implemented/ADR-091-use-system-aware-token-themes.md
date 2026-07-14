# ADR-091: Use System-Aware Token Themes

**Status:** Implemented

**Date:** 2026-07-14

## Context

Kirjolab's workspace uses a restrained set of semantic `app-*` colors, but the
tokens previously contained only light values and the document declared only a
light color scheme. Adding dark mode could either duplicate component styles,
follow the operating system without an override, or make theme selection a
user/project setting.

Appearance is a device preference rather than scholarly project state. It must
not affect collaborators, portable Markdown, or server-owned resources. The
workspace also needs native controls and scrollbars to match the selected
scheme without adding a theming dependency or inline startup script.

## Decision

Every themed component continues to consume the shared semantic `app-*` color
tokens. Each token uses the CSS `light-dark()` function, governed by the root
`color-scheme`. System is the default and allows the browser to follow the
operating system. Explicit Light and Dark options set a root `data-theme`
attribute and matching `color-scheme` value.

The selected preference is stored only in browser `localStorage` under
`kirjolab:theme`. Invalid or unavailable storage falls back to System and never
prevents the application from starting. Theme behavior remains in the external
typed browser bundle; Worker-rendered HTML contains no inline executable code.

## Consequences

**Positive:**

- The whole workspace, including native browser controls, changes through one
  compact palette rather than parallel component rules.
- New components inherit both schemes when they use the existing semantic
  tokens.
- The default tracks operating-system changes without JavaScript media-query
  listeners.

**Negative:**

- Explicit stored overrides apply when the external module starts, so a brief
  system-colored first paint remains possible on a cold load.
- Supported browsers must implement `light-dark()`.

**Neutral:**

- The PDF page itself stays white to represent the rendered document; its
  surrounding reader surface follows the application theme.
- Appearance does not change project data, collaboration, exports, or APIs.

## Alternatives Considered

### Duplicate component rules under a dark selector

This works in older browsers but scatters two palettes through a large shared
stylesheet and makes new components easier to leave light-only.

### Follow the operating system without an override

This is smaller, but does not let researchers choose a stable reading
environment independently of their device setting.

### Store appearance in workspace or account state

That would synchronize a device-specific presentation preference and add a
server mutation for behavior that belongs locally in the browser.
