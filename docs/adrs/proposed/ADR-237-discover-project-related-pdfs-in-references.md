# ADR-237: Discover Project-Related PDFs in References

**Status:** Proposed

**Date:** 2026-09-25

## Context

Researchers can upload PDFs to a project and connect PDFs to bibliographic
references. The left Files rail shows manuscript files and images, while the
Research rail already lists project PDFs under Project evidence and contains a
References collection. A reference's Context view can open its connected
papers, but the References inventory does not show whether a paper is available.
This makes PDFs related to the current project harder to discover.

The private Library can contain many PDFs unrelated to the current project.
Project relevance must come from stable relationships, not a title, filename,
citation key, or a search for citation text in the manuscript. A project
reference link identifies a relevant Library reference; the existing
project-scoped reference-PDF endpoint returns only PDFs attached to those
linked references. Explicit publication-to-project-PDF links identify the
project PDFs connected to a publication. These relationships preserve the
boundaries established by [ADR-054](../implemented/ADR-054-model-publication-pdf-associations-explicitly.md)
and the project-member access contract in
[Private Research Sharing](../../../specs/private-research-sharing/spec.md).

## Decision

Use the existing Research rail for project-related PDF discovery. Extend its
References collection to indicate PDF availability and offer a direct route to
connected papers. Derive that projection from the current project's explicit
reference and publication-PDF relationships and the authorized project-scoped
reference-PDF catalog. Do not enumerate unrelated private Library PDFs or infer
relevance from manuscript citation text or mutable metadata.

When exactly one PDF is connected to a reference, its rail action opens that
paper directly. When several are connected, the action opens the existing
publication Context so the researcher can choose among the named papers. A
reader control for switching among PDFs connected to the same reference is a
separate architectural decision.

Label the reference-row action **Open PDF** for one connected paper and
**Choose PDF** for several. Do not elevate one filename as the reference's
default paper. Keep the existing Research tab and References heading without a
separate PDF count or availability badge; the action appears on a reference
row when a connected PDF exists.

Keep project-uploaded PDFs discoverable in the existing Project evidence
collection, including PDFs that are not yet connected to a reference. A project
PDF connected to a publication may also appear as a paper available from that
reference; both entries address the same resource and open it through the
existing Context reader. The Files tree remains focused on authored files and
project images. This is a navigation projection, not a new PDF association,
copy, storage location, or authorization grant.

## Trigger

The request to expose project PDFs in the left tree raised a broader discovery
need: researchers should find PDFs relevant to the current project without
browsing every PDF in their private Library. The existing Research rail and
reference relationships provide a narrower place and stable relevance rule.

## Consequences

**Positive:**

- Related PDFs become visible where researchers already browse project
  references and evidence.
- Stable project relationships determine inclusion without a new persisted
  catalog or heuristic matching.
- Paper opening continues through the existing Context reader and project
  authorization checks.

**Negative:**

- Researchers must select Research rather than Files to find these PDFs.
- A paper connected to a reference may be reachable from both References and
  Project evidence; the UI must make these routes consistent.
- Library PDF availability may change independently of the project snapshot,
  so the rail must refresh when the authorized reference-PDF catalog changes.

**Neutral:**

- Linking a reference makes its currently attached PDFs available to project
  members under the existing access rules; an in-text citation is not required.
- Private Library highlights, notes, tags, and reading state remain outside
  this project PDF projection.

## Alternatives Considered

### Add every PDF to the Files tree

This would place papers beside manuscript files, but Library artifacts have no
project file path and different ownership. It would also duplicate the Research
rail's existing Project evidence and References inventories.

### Show only project-uploaded PDFs

Project evidence already does this. It would leave PDFs attached to linked
Library references undiscoverable from the project inventory.

### Show all private Library PDFs

The Library can contain sources unrelated to the project. Showing them in a
project rail would obscure relevance and imply project access that may not
exist.

### Require a citation in manuscript text

A project-linked reference may be useful before it appears in prose. Parsing
citation text would make discovery depend on mutable manuscript content rather
than the established project-reference relationship.
