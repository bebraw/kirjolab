# ADR-071: Host the Reference Library in Context

**Status:** Implemented

**Date:** 2026-07-13

## Context

The owner-private reference library began as a modal reached from the header,
research rail, and project-reference actions. Its full-screen overlay interrupts
the authoring/preview comparison and duplicates navigation affordances around a
workspace that already has a tabbed research-context surface.

The library is a recurring research destination rather than a short
confirmation task. It benefits from stable navigation, preserved scroll, and
continued visibility of the manuscript editor. ADR-053 already establishes the
context pane as the home for preview, publications, PDFs, and revision review,
but only Preview is currently a permanent tab.

## Decision

Kirjolab will host the owner-private reference library as a permanent,
non-closable Library tab directly after Preview in the research-context tab
list. Preview remains the initial tab. Library retains local scroll state and
the same keyboard tab semantics as the rest of the context pane.

Opening or managing a library record activates the existing Library tab and
refreshes the authorized owner snapshot. It does not open a modal, create a
second Library tab, or mutate the project. Resource-keyed publication, PDF, and
candidate tabs remain closable and continue to follow the pinned and
replaceable-slot rules from ADR-053.

The persistent header and research rail will not duplicate the permanent
Library tab with generic **Library**, **Open library**, or **Browse private
library** buttons. Contextual actions such as **Manage in library** may still
activate the tab when they carry a specific navigation intent.

## Trigger

The post-review UI refinement identified the library modal and its repeated
entry points as avoidable interruption and chrome.

## Consequences

**Positive:**

- Library work no longer covers the manuscript editor or removes the current
  writing context.
- Preview and Library have predictable, permanent homes with keyboard tab
  navigation and local scroll restoration.
- Removing duplicate entry points simplifies the header and research rail.
- Existing owner-private authorization and explicit project-sharing boundaries
  remain unchanged.

**Negative:**

- The library has less horizontal space than the former wide modal, so dense
  filters, cards, and citation-network controls must adapt to the context pane.
- A large personal library now shares the context pane with document reading
  and may require later density or virtualization work.

**Neutral:**

- Import, export, web capture, citation assertions, and PDF identification keep
  their existing API and domain contracts.
- Other bounded tasks may still use dialogs; this decision removes the library
  modal rather than banning every modal categorically.

## Alternatives Considered

### Keep the modal and remove duplicate buttons

This reduces chrome but still interrupts the authoring and preview relationship
whenever the researcher manages sources.

### Make Library a closable resource tab

This matches publication and PDF tabs, but a singleton owner-level destination
does not have a resource identity within the current project and should not
compete for the replaceable follow-context slot.

### Move Library into the left rail

The rail is intentionally a compact navigator. The library's filters, metadata
editing, imports, citation network, and unidentified PDFs need a document-sized
surface rather than a narrow inventory column.
