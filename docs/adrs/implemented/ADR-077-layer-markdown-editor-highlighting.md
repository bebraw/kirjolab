# ADR-077: Layer Markdown Editor Highlighting

**Status:** Implemented

**Date:** 2026-07-13

## Context

The manuscript editor exposes portable Markdown directly in a native textarea.
That keeps browser input, selections, spellchecking, Yjs offsets, and
collaborative updates simple, but the uniform source presentation makes
headings and scholarly syntax harder to scan.

A textarea cannot style individual ranges. Replacing it with a rich editor or
`contenteditable` surface would introduce a second document and selection model
at the collaboration boundary. Adding a full editor framework would also add a
dependency and migration cost disproportionate to this focused visual need.

## Decision

Keep the textarea as the only editable manuscript surface and canonical browser
input. Render a derived, `aria-hidden` highlighting layer behind it. The layer
must contain exactly the textarea text, use text nodes for authored content,
match the textarea's font, padding, wrapping, and tab size, and synchronize both
scroll axes.

Highlight only bounded, recognizable Markdown presentation categories:
headings, frontmatter keys, fenced and inline code, links, emphasis, lists,
quotes, footnotes, citations, references, anchors, and block directives.
Incomplete or unrecognized syntax remains visible as ordinary source. The
highlighting layer never parses into or writes back to Yjs.

In forced-colors mode, hide the derived layer and restore normal textarea text
color so the browser and operating system retain control of contrast.

## Consequences

**Positive:**

- Headings and scholarly syntax become easier to scan without changing editing
  or collaboration behavior.
- The implementation remains dependency-free and preserves native textarea
  accessibility and selection offsets.
- Authored text enters the highlighting DOM only through text nodes.

**Negative:**

- The mirror must keep wrapping and scroll geometry aligned with the textarea.
- Highlighting is intentionally lexical and does not expose a full Markdown
  syntax tree or editor services such as folding and autocomplete.
- Transparent textarea glyphs can limit browser-native spelling decorations,
  although spellchecking and the native input surface remain enabled.

**Neutral:**

- The scientific Markdown preview pipeline remains authoritative for parsing
  and validation; editor highlighting is only a presentation hint.

## Alternatives Considered

### Replace the textarea with CodeMirror

CodeMirror provides mature syntax highlighting and editor extensions, but it
would add dependencies and require reconciling its document, transaction, and
selection model with the existing Yjs textarea binding.

### Use a contenteditable editor

Rich DOM ranges would allow direct styling but create browser-dependent input
and normalization behavior at the canonical collaboration boundary.

### Highlight only the preview

The preview already communicates rendered structure, but it does not improve
orientation while researchers are reading and editing Markdown source.
