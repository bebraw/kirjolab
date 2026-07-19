# ADR-075: Host Derived Bibliography in the Files Rail

**Status:** Superseded by
[ADR-156](../accepted/ADR-156-keep-bibtex-at-interoperability-boundaries.md)

**Date:** 2026-07-13

## Context

Kirjolab derives project BibTeX from stable reference-library snapshots linked
to the project. The projection is read-only and updates as project references
and aliases change. It is useful for inspection and interoperability, but it is
not canonical manuscript source or an editable bibliography authority.

The projection began in a collapsed drawer below the Markdown editor. That
placement gives secondary generated output persistent space in the primary
authoring column and groups it with authored content. The Library Context tab
already owns authoritative private source management, while export owns
publication artifacts.

## Decision

Kirjolab will place Derived project bibliography as a collapsed secondary
section in the Files rail below the authored project-file list. The existing
read-only BibTeX projection and synchronization behavior remain unchanged.

The editor-bottom bibliography drawer is removed, allowing the manuscript
editor to use the full remaining authoring height. The derived projection does
not become editable, a project file, or private-library state.

## Trigger

The UI refinement identified the derived bibliography as secondary
functionality that should not occupy the authoring stack.

## Consequences

**Positive:**

- Authored Markdown retains the full editor column.
- Generated project material is inspectable beside the project-file inventory.
- The UI reinforces that BibTeX is derived rather than a second editable
  authority.
- The placement needs no modal or new top-level navigation mode.

**Negative:**

- Inspecting long BibTeX is narrower in the 17-rem rail.
- Users must switch to Files and expand the section to inspect the projection.

**Neutral:**

- Reference metadata remains authoritative in the private Library Context tab.
- Export continues to scope and materialize bibliography output independently.

## Alternatives Considered

### Keep the editor-bottom drawer

This preserves a wide raw-text view but continues to reserve authoring space
for generated secondary output.

### Move it into Library

Library owns user-private source records, while this projection belongs to one
project. Combining them would blur the authorization and derivation boundary.

### Show it only during Export

Export is appropriate for final artifacts, but hiding the projection there
would make alias and interoperability inspection unnecessarily indirect.

### Add a dedicated rail mode or modal

Either approach would give a read-only generated artifact more prominence and
interaction overhead than its secondary role warrants.
