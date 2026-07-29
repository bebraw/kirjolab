# ADR-191: Adopt Cytoscape for Citation Graphs

**Status:** Implemented

**Date:** 2026-07-29

**Supersedes:** [ADR-185](./ADR-185-defer-graph-renderer-adoption.md)

## Context

ADR-185 deferred a graph renderer while citation volume was the only committed
adoption trigger. Addressable reference trails now also need pan and zoom over
graphs larger than the viewport. The citation projection remains bounded at 512
assertions, but the circular SVG no longer provides a useful dense overview.

The project map has a different interaction model: native resource cards in
deterministic provenance lanes with decorative measured connectors. It has no
corresponding renderer requirement.

## Decision

Use pinned Cytoscape.js 3.34.0 only for the citation-network visualization. It
consumes the existing renderer-neutral node and edge projection and owns CoSE
layout, pan and zoom, viewport controls, hit testing, and visual selection.
Node selection follows the same addressable reference trail as the ordinary DOM
list. Layout, viewport, selection, and node positions remain derived browser
state and are never persisted.

Preserve the complete accessible provenance list as the authority for every
relationship, review, expansion, and navigation action. If the visual runtime
cannot load, that list remains usable and the graph reports the degradation.
Keep project-map resource actions and layout in native DOM with decorative SVG
connectors.

Build Cytoscape as a separate content-fingerprinted browser asset. Compile its
exact URL into the application, precache it with the offline shell, load and
parse it only for a non-empty citation graph, and include it in dependency-cost
diagnostics. At adoption, the isolated artifact measures 443,706 raw bytes and
141,335 deterministic gzip bytes; the production dependency audit reports no
vulnerabilities.

## Consequences

**Positive:**

- Dense citation graphs gain a mature automatic layout and viewport model.
- Domain contracts, persistence, and accessible actions remain independent of
  the renderer.
- The larger runtime is parsed only by people who open a citation graph.

**Negative:**

- The production closure gains Cytoscape and its maintenance surface.
- Offline installation fetches an additional 141-kilobyte gzip asset.
- Canvas nodes are a visual convenience; complete keyboard interaction remains
  in the adjacent DOM list.

**Neutral:**

- The project map does not adopt Cytoscape.
- Switching layout algorithms later does not migrate stored data.

## Alternatives Considered

### Extend the circular SVG

Application-owned pan, zoom, layout, hit testing, and resize behavior would
reimplement mature graph mechanics while remaining weak for dense projections.

### Adopt Sigma.js

Its WebGL focus is better suited to thousands of simultaneously visible nodes
than this bounded projection and does not improve the DOM-backed accessibility
model.

### Use Cytoscape for the project map too

The project map's measured DOM-card lanes are intentional product structure,
not a force-directed node layout. Sharing a runtime would remove neither its
native actions nor its presentation policy.
