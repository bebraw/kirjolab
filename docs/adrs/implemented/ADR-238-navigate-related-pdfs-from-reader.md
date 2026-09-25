# ADR-238: Navigate Related PDFs from the Reader

**Status:** Implemented

**Date:** 2026-09-25

## Context

A bibliographic reference can have several connected PDFs, including different
versions, supplements, or other representations of a work. A project PDF can
also be connected to several references. [ADR-054](../implemented/ADR-054-model-publication-pdf-associations-explicitly.md)
models these relationships explicitly and does not designate one PDF as the
canonical artifact. [ADR-053](../implemented/ADR-053-use-a-tabbed-research-context-pane.md)
gives each PDF its own resource-keyed Context tab and reading position.

[ADR-237](../implemented/ADR-237-discover-project-related-pdfs-in-references.md) adds
project-related paper discovery to the Research rail. Its multiple-PDF
action opens the publication Context to choose a paper. Once a researcher is
reading one of those PDFs, returning to the publication Context merely to
inspect another connected PDF interrupts reading. The reader already has an
**About this paper** panel that identifies references connected to the active
PDF, but opening that panel for a common reading action would keep the
alternatives out of sight.

The project can contain PDFs uploaded directly to the workspace and PDFs
attached to a linked owner-Library reference. The latter are available to
authenticated project members through the existing project-scoped metadata
and streaming endpoints. Unrelated private Library PDFs must remain outside
project navigation.

## Decision

In the project workspace PDF reader, show a compact, labelled PDF-switching
control when the active PDF has at least one other authorized PDF connected
through the same reference. The control opens a list of those papers without
leaving the reader. Derive the choices from explicit
publication-to-project-PDF links and the authorized project-scoped
reference-PDF catalog. Exclude the active PDF from its own choices. If the
active PDF has no connected reference or no alternative, omit the control.

Group alternatives by reference because a project PDF may represent several
publications. Name each alternative by its stored PDF name and identify its
project or linked-reference source where needed to distinguish choices. Do not
call these artifacts "versions" unless a separate, explicit version
relationship is introduced. Do not choose a primary PDF or infer relationships
from filenames, citation keys, titles, or manuscript citation text.

Selecting an alternative opens or focuses that PDF's existing resource-keyed
Context tab through the established project, private-Library, or
linked-reference PDF navigation path. Preserve each tab's local page, scroll,
and annotation state. Switching PDFs does not change reference links, PDF
bytes, manuscript content, or sharing rights. Reconcile the available choices
when project links or the authorized reference-PDF catalog change; do not
persist a separate reader-side relationship list.

This decision applies to the PDF reader inside an active project. Standalone
Library reading has no project-scoped reference-PDF catalog and is outside this
decision. Requesting access to an owner-private PDF and deciding where the
owner reviews or approves that request require a separate decision; this
reader control lists only PDFs the current project member may already read.

## Trigger

Discussion of multiple PDFs in the proposed Research rail discovery flow
identified a separate reading task: move between PDFs connected to the same
reference without leaving the active PDF reader. Keeping this as its own ADR
separates reader navigation from project PDF discovery.

## Consequences

**Positive:**

- Researchers can move between connected papers while reading, including
  project and linked-reference PDFs.
- The navigation uses established identities, authorization, and tab state
  rather than a new PDF model or reader-specific storage.
- Grouping by reference makes a PDF connected to several works understandable.
- The available alternatives are visible from the reader controls without
  opening the paper-details panel.

**Negative:**

- The reader must combine project snapshot relationships with a separately
  refreshed, authorized reference-PDF catalog.
- A PDF connected to several references can appear in more than one group
  when it is an alternative to papers for each of those references.
- The reader gains another visible control, which needs compact presentation
  and an accessible name on narrow screens.

**Neutral:**

- The publication Context remains the chooser when a reference has several
  PDFs and the researcher has not opened one yet.
- Each PDF keeps its own Context tab and reading location under ADR-053.
- This adds navigation only; it does not share private Library notes,
  highlights, tags, or reading state with project members.

## Alternatives Considered

### Replace the PDF tab when selecting another paper

This would make the alternatives feel like views of one document, but it would
discard the distinct artifact identity and independent reading position
established by ADR-053.

### Show one flat list of all project PDFs in the reader

A flat list would contain unrelated project evidence and give no reason why a
paper is relevant to the active PDF. Explicit reference links provide that
reason.

### Treat every connected PDF as a version of the same document

The current many-to-many association also covers supplements and compound
artifacts. Version ordering or a preferred version would require a separate
domain relationship and decision.

### Keep switching only in publication Context

The existing chooser is sufficient for initial selection, but repeatedly
leaving the reader makes comparison and follow-up reading cumbersome.

### Place alternatives only in About this paper

That panel already knows the active PDF's references, but it is a secondary
inspector. A visible reader control better supports repeated switching while
comparing papers.

## Future Decision

- Should a reference designate one preferred main PDF across projects, with
  appendices and other supplements remaining available through the switcher?
  A Library-owned preference would be stable across projects, but a legacy
  project-only PDF cannot be selected by a Library record without changing
  that ownership boundary. This ADR does not yet change the no-primary-PDF
  rule from ADR-054.
