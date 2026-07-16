# ADR-139: Map Preview Elements Through Composition Source Spans

**Status:** Implemented

**Date:** 2026-07-16

## Context

Bidirectional source/Preview navigation needs a deterministic correspondence
between rendered elements and authored Markdown. Rendered text matching is
ambiguous after Markdown transformation and when a supporting file is included
more than once. Persisting DOM positions would also confuse disposable Preview
structure with durable manuscript anchors.

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
actions at the pane boundary. It may also follow deliberate source navigation
while both panes are visible, but ordinary typing will not cause Preview
scrolling or source focus changes.

## Consequences

**Positive:**

- Navigation remains exact across Markdown rendering and nested project
  includes.
- Supporting files can be selected automatically through stable file identity.
- Sync metadata stays within the existing sanitized Preview boundary.

**Negative:**

- Renderer position semantics and composition source-map semantics must remain
  aligned.
- Clicking a rendered element maps to its source range start rather than an
  exact character within its rendered text.

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
