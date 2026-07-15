# ADR-121: Keep the Editor Toolbar to One Row

**Status:** Implemented

**Date:** 2026-07-15

## Context

The authoring toolbar split its controls into two complete groups and wrapped
those groups when the authoring pane narrowed. Ordinary desktop split widths
therefore consumed a second toolbar row and reduced the manuscript's vertical
space. Revision, History, Vim, Insert, file mutation, target, and save feedback
all competed as equally prominent controls even though their use frequency is
different.

## Decision

- Keep the editor toolbar on one non-wrapping row.
- Retain Write/Map, word count, Insert, current editor target, and save state as
  the visible hierarchy.
- Move lower-frequency History, revision, Vim, and file mutation actions into a
  labelled **More** menu. Controls keep visible text and accessible names inside
  that menu rather than becoming unexplained glyphs.
- Let the target status absorb remaining width and truncate visually while its
  full value remains in a native title. Hide the separately available word
  count only at the narrowest toolbar container width.

## Consequences

The manuscript keeps a stable top edge as the split pane changes size, and all
editing actions remain reachable without horizontal page overflow. History and
Vim require one additional menu activation. Revision becomes contextual to the
History action instead of occupying permanent width.

## Alternatives Considered

Allowing complete groups to wrap preserves every visible control but spends
vertical writing space unpredictably. Shrinking every label makes the toolbar
harder to scan. Replacing actions with icons saves more width but weakens
discoverability and conflicts with the workspace's labelled-control rule.
