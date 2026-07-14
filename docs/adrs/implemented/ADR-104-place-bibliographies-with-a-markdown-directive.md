# ADR-104: Place Bibliographies with a Markdown Directive

**Status:** Implemented

**Date:** 2026-07-14

## Context

Kirjolab already derives citation-scoped BibTeX and renders inline citations,
but its publication targets disagree about reference lists. Generated LaTeX
implicitly appends a bibliography, while the direct PDF renderer omits it.
Neither behavior lets an author choose where references belong, and adding an
automatic heading would conflict with Markdown ownership of visible document
structure.

The canonical manuscript needs a portable, explicit placement marker that the
browser preview and both publication materializers can consume consistently.

## Decision

Kirjolab will support the exact leaf directive `::bibliography[]`. It places
the citation-scoped reference list at that point in the composed manuscript.
Authors provide a `References`, `Bibliography`, or other heading with ordinary
Markdown when they want one.

The browser preview and bounded PDF renderer format readable entries according
to the selected citation profile. LaTeX emits its bibliography style and
`\bibliography{bibliography}` commands at the marker. For compatibility,
LaTeX manuscripts that contain cited BibTeX but no marker keep the prior
end-of-document fallback; direct PDF requires the explicit marker.

The Insert menu exposes the marker, and unchanged starter manuscripts receive
a migration that appends a References section and marker. Customized
manuscripts are not rewritten. Export identities advance to
`kirjolab-article-v4` and `kirjolab-pdf-lib-v3@1.17.1`.

## Trigger

Direct PDF inspection showed that cited sources never appeared as a reference
list and there was no authored syntax capable of placing one.

## Consequences

**Positive:**

- Authors control bibliography location without an editor-only document model.
- Preview, PDF, and LaTeX share one explicit semantic marker.
- Headings remain author-owned Markdown rather than generated output.
- The demo teaches the syntax in both source and the Insert menu.

**Negative:**

- Existing customized manuscripts must add the marker before direct PDF shows
  a reference list.
- The bounded preview and PDF formatter remains less complete than a dedicated
  CSL processor.

**Neutral:**

- Reference lists contain only citations reachable from composed `main.md`.
- LaTeX keeps a compatibility fallback for marker-free manuscripts.

## Alternatives Considered

### Always append references

This fixes omission but prevents authors from placing appendices or other
backmatter after the bibliography and leaves visible heading ownership unclear.

### Infer placement from a References heading

Heading text is localized and user-defined. Treating a particular label as
semantic would be brittle and surprising.

### Use a placeholder token outside Markdown directives

A bespoke token would create another parsing convention when the existing leaf
directive vocabulary already represents non-prose manuscript structure.
