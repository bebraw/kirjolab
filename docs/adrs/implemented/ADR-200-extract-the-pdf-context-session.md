# ADR-200: Extract the PDF Context Session

**Status:** Implemented

**Date:** 2026-07-30

## Context

The resource-context presenter coordinates canonical tabs, authorization,
cross-feature navigation, publication and candidate presentation, private PDF
annotation workflows, and project resource updates. It also retained the
mutable PDF viewer session: API scope, rendered context identity, active project
PDF identity, stale-load rejection, reader scroll restoration, navigation-panel
document setup, failure presentation, and the viewer handle used by workspace
layout.

That combination grew the presenter beyond 1,300 lines and made PDF load
behavior testable only through the broader context coordinator. The viewer
itself should remain responsible for PDF.js rendering and gestures, while
canonical research-context state must remain in the presenter.

## Decision

Introduce a bounded `PdfContextSession` between the resource-context presenter
and `PdfEvidenceViewer`.

The session owns only browser-local viewer coordination:

- the bound viewer and workspace API scope;
- rendered context and active project-PDF identities;
- the authorized active-load projection and stale-completion check;
- annotation and private-highlight projection into the viewer;
- reader scroll restoration, navigation-document setup, and failure routing;
- viewer state capture and the narrow resize handle consumed by layout.

The resource-context presenter continues to own canonical tab state,
authorization inputs, routes, selection destinations, Library and workspace
snapshots, and cross-feature outcomes. `PdfEvidenceViewer` continues to own
rendering, page interaction, selection geometry, and gestures.

## Consequences

**Positive:**

- PDF load/session behavior has a small, independently tested boundary.
- The context presenter no longer stores parallel viewer identity fields.
- Workspace layout receives the same narrow resize capability without knowing
  the concrete viewer or context presenter internals.

**Negative:**

- Active PDF loading now crosses one additional typed adapter.
- The session requires small ports back to the presenter-owned form, reader,
  and navigation panel.

## Alternatives Considered

### Keep the session fields in the resource-context presenter

This avoids a new file but preserves unrelated reasons for the presenter to
change and makes stale-load behavior expensive to test in isolation.

### Move context identity and routing into the PDF viewer

The viewer would then need scholarly resource catalogs and route knowledge,
mixing PDF.js rendering with application authorization and navigation policy.

### Adopt a global PDF store

A global store would be disproportionate for one bounded viewer session and
would duplicate the existing canonical research-context state.
