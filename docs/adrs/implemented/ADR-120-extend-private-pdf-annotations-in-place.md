# ADR-120: Extend Private PDF Annotations in Place

**Status:** Implemented

**Date:** 2026-07-15

## Context

Private Library PDF highlights initially treated every saved text selection as
a new resource. Re-selecting part of an existing passage therefore painted
stacked annotations and produced duplicate exported comments. Saved highlight
comments and page-note bodies also became immutable after creation, even though
their anchors and geometry remained useful.

Project annotations already establish that overlapping paint should extend a
stable scholarly resource. Private annotations need the same interaction while
remaining inside the owner-scoped Reference Library boundary.

## Decision

- Highlight creation checks saved geometry on the same artifact and page in the
  Reference Library Durable Object. When any normalized rectangles intersect,
  the most recently updated matching highlight keeps its id and creation time;
  its line geometry, quotation text, and distinct comments are merged within
  the existing bounds. A non-overlapping selection creates a new highlight.
- Owner-private update routes replace a saved highlight comment or a page-note
  body without replacing its resource id, page, or geometry. Page-note updates
  continue to accept normalized position changes so editing and dragging share
  one bounded mutation contract.
- The private reader exposes explicit **Edit note** actions in the collapsed
  annotation list and reuses the contextual composers for saving changes.
- Research shares remain snapshots. Editing a private annotation does not
  silently revise content already shared with a project.

## Consequences

Repeated touch selections behave additively, exported highlights no longer
multiply for ordinary overlap corrections, and researchers can revise their
own notes. Merge authority lives beside owner-scoped storage, so refreshes and
multiple clients cannot bypass it. A selection bridging several existing
highlights extends one deterministic recent match rather than deleting other
stable resources that may already have independent shares.

## Alternatives Considered

Client-only overlap detection would provide immediate behavior but could race
or be bypassed. Deleting every intersecting highlight and replacing them with a
new record would break stable links and share identities. Treating comments as
append-only preserves history but prevents correcting mistakes; full note
revision history can be introduced separately if required.
