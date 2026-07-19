# ADR-156: Keep BibTeX at Interoperability Boundaries

**Status:** Implemented

**Date:** 2026-07-19

**Supersedes:**
[ADR-075](../implemented/ADR-075-host-derived-bibliography-in-files-rail.md)

## Context

Kirjolab began with project-local BibTeX as an authored source. The shared
Reference Library later became the authority for bibliographic metadata,
stable source identity, provenance, PDFs, and reusable research. Projects now
link library records and derive citation-scoped bibliography output.

The interface still exposes a raw generated BibTeX projection in the Files
rail and a project-level BibTeX import control. Those surfaces imply that
researchers should inspect or manage an implementation format during ordinary
writing, even though neither surface is authoritative. BibTeX remains valuable
for LaTeX tooling, source archives, and exchange with existing reference
managers.

## Decision

BibTeX will not appear as ordinary project authoring or navigation state.
Kirjolab will remove the raw derived bibliography from the Files rail and
remove project-level BibTeX import from the Research rail. Reference intake
belongs to the Library, where BibTeX and CSL JSON remain available as explicit
file-import formats under the Add reference workflow.

Project export will keep cited `.bib` output, but place it under a collapsed
interoperability section and describe the task before naming the file format.
LaTeX export, archival bundles, templates, legacy migration, APIs, and internal
derived bibliography state continue to use BibTeX where required. The authored
`::bibliography[]` directive remains visible because it controls publication
placement rather than exposing BibTeX syntax.

This is a presentation and workflow boundary, not a storage migration. A later
decision may remove legacy bibliography text from project persistence only if
the remaining compatibility contracts no longer need it.

## Trigger

The structured Library, reviewed metadata intake, citation aliases, and
reference-aware editor have evolved beyond the early assumption that users
need a raw BibTeX surface during normal work.

## Consequences

**Positive:**

- Everyday navigation reflects user concepts: references, papers, citations,
  and publication output.
- The UI no longer suggests that generated BibTeX is editable or canonical.
- LaTeX and reference-manager interoperability remain available when needed.
- The change avoids a risky persistence migration.

**Negative:**

- Users who inspect generated BibTeX while writing must download the cited
  bibliography from Export.
- Project-level `.bib` intake moves to the Library and then requires explicit
  project linkage.
- Some legacy client and storage machinery remains temporarily invisible.

**Neutral:**

- Export artifacts and API contracts retain their current BibTeX semantics.
- Review-study import and export keep their format-specific contracts.

## Alternatives Considered

### Keep the Files-rail projection

This preserves immediate inspection but continues to elevate a derived
implementation format beside authored Markdown.

### Remove BibTeX completely

This would simplify terminology but weaken LaTeX portability, source archives,
reference-manager exchange, and legacy migration while requiring a separate
data-model change.

### Rename the raw projection

Calling it “Reference data” would hide the format name without fixing the more
important problem: generated syntax would still occupy ordinary project
navigation.
