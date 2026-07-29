# ADR-185: Defer Graph Renderer Adoption

**Status:** Implemented

**Date:** 2026-07-29

## Context

Kirjolab has two graph-shaped browser views. The project map renders
keyboard-operable resource cards in deterministic provenance lanes and draws
decorative SVG connectors from measured card geometry. The citation network
draws a circular SVG overview and pairs it with ordinary provenance cards that
own every inspection and mutation action.

The modularization RFC proposed evaluating a graph renderer when any two
interaction or scale requirements become committed. This audit compares current
behavior with those triggers.

## Decision

Do not add a graph-rendering dependency yet. Retain the typed domain projections,
DOM-owned resource actions, accessible provenance lists, and bounded SVG
presentations.

One trigger is present: a citation projection may contain up to 512 assertions,
so a worst-case graph can cross the RFC's 500-edge scale threshold. The other
triggers are not current product requirements:

- neither view offers or requires pan and zoom;
- nodes are not draggable and positions are not persisted;
- each view has one deterministic presentation rather than selectable layouts;
- clustering, collapsing, and progressive neighborhood expansion are absent;
  and
- selection and keyboard navigation are not shared graph-runtime concerns.

Reevaluate Cytoscape.js when a second trigger becomes committed. Reevaluate a
WebGL-oriented renderer such as Sigma.js only when measured workloads reach
thousands of simultaneously visible nodes and DOM interaction is no longer the
primary accessibility model.

Any future renderer must consume the existing typed nodes and edges without
becoming a canonical graph authority. It may own layout, viewport, hit testing,
and visual selection, but ordinary keyboard-operable resource actions and
provenance inspection must remain available independently of the canvas.

## Consequences

**Positive:**

- The application avoids a substantial dependency before its interaction model
  needs one.
- Project-map accessibility remains native DOM behavior rather than canvas
  emulation.
- Domain graph contracts stay renderer-neutral and reusable by both views.

**Negative:**

- Dense citation overviews remain visually limited even though their complete
  provenance remains available in the list.
- The existing circular and measured-connector layouts remain application-owned.
- A second scale or interaction trigger will require another explicit audit.

## Alternatives Considered

### Adopt Cytoscape.js now

It would address dense layout and provide mature viewport interactions, but
those interactions are not currently part of either feature contract. Adoption
would duplicate established DOM actions for only one active trigger.

### Adopt Sigma.js now

Its WebGL model targets much larger visible graphs than Kirjolab currently
requires and would make rich DOM-backed interaction harder to preserve.

### Share the current layout implementation between both graphs

The project map is a provenance-lane layout over measured cards, while the
citation network is a source-to-source overview. Sharing their geometry would
couple different presentation policies without removing meaningful mechanics.
