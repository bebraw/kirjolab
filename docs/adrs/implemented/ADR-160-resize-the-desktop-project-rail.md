# ADR-160: Resize the Desktop Project Rail

**Status:** Implemented

**Date:** 2026-07-22

## Context

The project rail used one fixed 17rem desktop track for Files, Research,
Comments, and Writing guide. That default is compact, but longer file paths and
dense research material benefit from more room, while writing-focused sessions
benefit from reclaiming rail width. Authoring and Context already establish an
accessible, locally persisted resize interaction.

The rail cannot grow without limit. The desktop breakpoint is chosen so the
17rem rail and the minimum Authoring and Context measures fit without horizontal
page overflow.

## Decision

- Add a pointer- and keyboard-operable separator between the project rail and
  Authoring at desktop widths only.
- Bound the preferred rail width from 13rem through 24rem, keep 17rem as the
  default, and let `Home` restore that default.
- Dynamically contract the effective maximum when a split workspace needs the
  remaining width to preserve its 26rem Authoring and 28rem Context minimums.
- Persist one browser-local rail preference across projects. Keep the value out
  of URLs, project snapshots, Yjs state, and server storage.
- Allow the desktop rail to collapse independently of its preferred width. A
  rail control collapses it and a labelled editor-toolbar control restores it;
  the browser remembers that cross-project state without overwriting width.
- Retain the stacked, non-resizable rail below the desktop breakpoint.

## Consequences

- Long project paths and dense rail content can receive more readable space.
- Researchers can reclaim authoring room without changing collaborative state.
- The separator follows the established pane-resize interaction and remains
  keyboard accessible.
- The rail may stop growing before 24rem in a constrained split viewport.

## Alternatives Considered

### Keep the fixed 17rem rail

This preserves the smallest implementation, but forces one compromise width on
material with substantially different density.

### Encode collapse as the minimum width

This would avoid a second preference, but it would make resizing accidentally
hide navigation and lose the researcher's last useful expanded width.

### Persist the width per project or in the URL

The width expresses a local display preference rather than a meaningful project
location. Per-project storage would produce inconsistent navigation geometry,
while URL state would make incidental resizing part of sharing and history.
