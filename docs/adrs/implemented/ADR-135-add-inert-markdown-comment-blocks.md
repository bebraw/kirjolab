# ADR-135: Add Inert Markdown Comment Blocks

**Status:** Implemented

**Date:** 2026-07-16

**Amends:** [ADR-035](./ADR-035-keep-markdown-canonical.md), [ADR-057](./ADR-057-compose-projects-from-main.md),
[ADR-077](./ADR-077-layer-markdown-editor-highlighting.md), [ADR-102](./ADR-102-use-javascript-for-live-markdown-preview.md)

## Context

Authors need to retain draft passages, editorial notes, and temporarily omitted
material beside the prose they concern without publishing that material. Durable
collaborative comments remain the correct model for attributed discussion, but
they do not replace portable author-owned notes embedded in a Markdown file.

Using HTML comments would conflict with Kirjolab's rule that authored HTML is
rendered as inert text. Treating comments as ordinary directive content would
also allow citations, includes, and headings inside a comment to affect derived
publication state.

## Decision

Add a standalone block comment syntax:

```markdown
::: comment
Commented things go here.
:::
```

The opening and closing markers occupy their own lines. The first standalone
`:::` closes the block; comments do not nest. Markers inside frontmatter or
fenced code remain literal. An unclosed comment extends to the end of the file
and produces an error diagnostic.

Comment text remains byte-for-byte canonical in Yjs, project history, GitHub
sync, backups, and archival source exports. It is inert everywhere derived
manuscript semantics are calculated: preview HTML, include expansion, citation
discovery, reference targets, path rewrites, word counts, composed Markdown,
LaTeX, and PDF publication output. One offset-preserving projection supplies
that shared boundary, while the Markdown parser still receives the original
source and removes recognized comment ranges through an mdast transform.

The source editor gives the full block restrained comment highlighting without
interpreting Markdown syntax inside it.

## Consequences

**Positive:**

- Draft material can travel with portable Markdown without entering a
  publication.
- Commented citations and includes cannot silently alter bibliography or
  composition dependencies.
- Offset preservation keeps source maps and diagnostics attached to canonical
  authored positions.

**Negative:**

- The syntax is a Kirjolab extension rather than CommonMark.
- Comments are block-only and intentionally do not support nesting.

**Neutral:**

- Attributed collaborative manuscript comments remain separate durable
  resources and are unaffected by this syntax.
- Source archives retain comment blocks because they preserve canonical author
  input rather than publication projections.

## Alternatives Considered

### Use HTML comments

Kirjolab deliberately renders authored HTML as text. Special-casing one HTML
construct would weaken that boundary and make raw-HTML handling less coherent.

### Store every note as a collaborative comment

Collaborative comments carry identity, anchoring, and lifecycle state. Portable
author notes need none of those properties and should survive outside Kirjolab.

### Delete comment text during composition

Deleting before composition would disturb offsets and source maps. A same-length
inert projection preserves provenance while keeping derived outputs clean.
