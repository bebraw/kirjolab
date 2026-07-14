# ADR-107: Open the Library Without a Project

**Status:** Implemented

**Date:** 2026-07-14

## Context

The owner-private Library, PDF reader, annotation tools, and annotated export
already have project-independent storage and API contracts. Their only browser
entry point lived inside a project's Context pane, however, so examining or
marking up a student PDF still required opening or creating an unrelated
project. Creating a project as UI scaffolding would blur the established
boundary between private research and collaborative project state.

## Decision

Kirjolab exposes `/library` as a first-class authenticated application surface.
It reuses the existing Library and kind-qualified private PDF reader, but its
client bootstrap stops before workspace catalog reads, workspace snapshots,
offline manuscript restoration, collaboration sockets, and manuscript runtime
loading. Project citation, rights handoff, and research-sharing controls are
absent in this mode.

The regular workspace retains its permanent Library context tab. Both surfaces
use the same owner-library API, annotation records, immutable source PDF, and
transient annotated-export pipeline.

## Consequences

- A researcher can import, annotate, and export a PDF without creating project
  state.
- Private annotations remain available when the same PDF is later opened from
  a project because both surfaces address the same owner-library records.
- The standalone surface shares a DOM shell and client bundle with workspaces,
  leaving some inactive project markup in the response and requiring explicit
  mode guards around project-only actions.
- Standalone library navigation is online-only in this slice; the manuscript
  offline cache remains scoped to authorized workspaces.

## Alternatives Considered

A temporary project would reuse the existing bootstrap unchanged, but would
create durable collaborative state for a private document-inspection task.

A separate Library application and bundle would make project isolation
structural, but would duplicate a large, actively evolving reference and PDF
interface. The guarded shared shell is the smaller change while the workflows
remain visually and behaviorally identical.
