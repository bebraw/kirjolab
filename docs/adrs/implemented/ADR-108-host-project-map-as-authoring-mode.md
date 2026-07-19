# ADR-108: Host Project Map as Authoring Mode

**Status:** Implemented

**Date:** 2026-07-14

## Context

The Research rail mixed four different jobs: inventory, project search, typed
connection inspection, and a launcher for the private library citation
network. The launcher was especially misleading because “Project graph” opened
a literature network backed by different resources while the same accordion
listed the workspace evidence graph.

Project evidence relationships describe the structure around the manuscript,
not one narrow collection beside it. The visual projection also needs enough
space for readable nodes, search results, and an accessible alternative to the
canvas. Canonical Markdown must remain the only manuscript authority.

## Decision

Make `Write` and `Map` peer modalities in the central authoring surface. Write
continues to host the native collaborative textarea. Map hosts the derived
workspace graph, bounded resource search, and typed connection cards. Selecting
manuscript source from any resource action returns the surface to Write.

Keep Map read-only and reconstruct it from the authorized workspace snapshot.
The visual layout is presentation only; ordinary keyboard-operable resource
and connection actions remain available. Mode choice is ephemeral browser UI
state and never enters Yjs, project resources, or collaboration messages.

Limit the Research rail to project evidence, claims, and references. Remove its
search form, graph accordion, and the citation-network launcher. The library
citation network remains available from Library under its accurate name.

## Trigger

A workspace usability review found the Research rail confusing and proposed
project graph as an alternative modality for the text editor.

## Consequences

**Positive:**

- The Research rail has one clear job: inspect and act on research inventory.
- The project evidence graph gains enough space to communicate relationships.
- Project evidence and the private literature citation network no longer share
  a misleading entry point.
- Search, visual overview, and accessible connection navigation stay together.

**Negative:**

- Map temporarily hides the manuscript textarea and its editing controls.
- Dense projects can make the normal-flow visual projection taller; the
  connection cards remain the dependable complete relationship representation.
- The authoring toolbar gains one persistent two-option control.

**Neutral:**

- Search and graph API contracts do not change.
- The library citation network remains a separate private-library capability.

## Alternatives Considered

### Keep and rename the graph accordion

Renaming could distinguish the two graphs, but search and connection cards
would still compete with evidence inventory in a narrow rail and the project
overview would remain visually constrained.

### Put the project graph in Research Context

Context already hosts Preview, Library, PDFs, publications, and model reviews.
Adding a whole-project structural view there would make it another inspectable
resource rather than a peer way to work with the manuscript.

### Replace the editor with a graph-first interface

Making the graph primary would weaken direct writing, accessibility, and
portable Markdown ownership. A peer, read-only modality preserves both writing
and structural exploration without another document model.
