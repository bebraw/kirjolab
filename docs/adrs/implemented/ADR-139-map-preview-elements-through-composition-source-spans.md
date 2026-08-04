# ADR-139: Map Preview Elements Through Composition Source Spans

**Status:** Implemented

**Date:** 2026-07-16

**Amended:** 2026-08-04 — interpolate linked scrolling between source-span boundaries

## Context

Bidirectional source/Preview navigation needs a deterministic correspondence
between rendered elements and authored Markdown. Rendered text matching is
ambiguous after Markdown transformation and when a supporting file is included
more than once. Persisting DOM positions would also confuse disposable Preview
structure with durable manuscript anchors.

The initial scroll-lock implementation reused discrete passage-reveal
operations on every animation frame. Because source lines and rendered blocks
have unequal heights, the following pane remained fixed on one semantic target
and then jumped when the nearest target changed.

## Decision

Kirjolab will retain parser positions as allowlisted `data-source-from` and
`data-source-to` attributes in sanitized Preview HTML. The browser will map
those composed-input offsets through the active `CompositionSourceSpan` list to
stable file-qualified source positions.

The Preview DOM attributes and active source map are derived browser state.
They will not be persisted, synchronized, exported, or reused for durable
passage relationships. Repeated source occurrences will resolve to the matching
Preview element nearest the current viewport.

The interface will expose explicit source-to-Preview and Preview-to-source
actions at the pane boundary plus an opt-in scroll-lock action. While locked,
the most recent deliberate scroll intent selects the leading pane and
the other pane follows through the same source-span mapping. Programmatic
follower movement must not feed back into the leader. Preview-led continuous
scrolling only recenters the active source file and does not move the caret,
focus the editor, or switch files. Ordinary typing clears the active scroll
leader and does not cause Preview scrolling or source focus changes.

For linked scrolling, the leading viewport center maps to a fractional offset
within its logical source line or outermost rendered block. The following pane
maps that offset through the composition source spans and linearly interpolates
its viewport center within the matching boundary or between adjacent valid
boundaries. The follower position is assigned directly at most once per
animation frame; browser smooth-scroll animations and whole-pane percentage
mapping are not used. Preview element references and source ranges may be
cached for one render, but layout geometry remains live, disposable browser
state. Malformed markers are excluded from the derived boundary index. Gaps
interpolate only when their endpoints are adjacent and ordered alike in both
the source and visual indexes; source-reordered blocks remain direct targets
without interpolating across intervening or reversed boundaries. After a valid
mapping is found, leading-pane top and bottom endpoints pin the follower to the
same endpoint. When no valid mapping exists, or a Preview-led mapping belongs
to another file, the follower remains unchanged.

## Consequences

**Positive:**

- Explicit element-to-source navigation remains deterministic across Markdown
  rendering and nested project includes.
- Supporting files can be selected automatically through stable file identity.
- Sync metadata stays within the existing sanitized Preview boundary.
- Locked scrolling remains semantically aligned while moving continuously
  across unequal source and rendered heights.

**Negative:**

- Renderer position semantics and composition source-map semantics must remain
  aligned.
- Clicking a rendered element maps to its source range start rather than an
  exact character within its rendered text.
- The browser must rebuild the rendered-block index after Preview replacement
  and read current layout geometry while scrolling.

**Neutral:**

- Durable comments, claims, and evidence links continue to use manuscript
  anchors rather than this disposable navigation mapping.

## Alternatives Considered

### Match source and Preview text

Rendered text differs from Markdown syntax and may repeat, so matching is
heuristic and cannot identify the correct included file reliably.

### Persist a separate synchronization index

This duplicates composition provenance and introduces migration and
collaboration concerns for state that can be derived on every render.

### Follow the caret after every edit

Continuous scrolling while typing is visually disruptive and makes the
Preview compete with the author's active task.

### Smooth every snapped target

Starting a new browser smooth-scroll operation on each animation frame keeps
retargeting the animation, which adds lag without removing the discrete target
steps.

### Map whole-pane scroll percentages

Raw percentages are continuous but lose semantic alignment when Markdown
rendering changes relative heights or project composition includes supporting
files.
