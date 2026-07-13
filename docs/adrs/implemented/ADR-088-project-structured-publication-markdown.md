# ADR-088: Project Structured Markdown for Publication Export

**Status:** Implemented

**Date:** 2026-07-13

## Context

Kirjolab keeps portable Markdown canonical and uses Satteri as the browser
preview parser. Publication export instead runs inside a bounded Worker and
currently converts the composed manuscript one line at a time. That path
correctly consumes Kirjolab citations, references, and transclusion directives,
but prints supported Markdown tables and footnote definitions as source syntax.

Export needs deterministic table and footnote semantics without introducing a
second canonical document model, executing authored TeX, or requiring Satteri's
threaded browser runtime in the Worker.

## Decision

The export pipeline will project a deliberately bounded set of structured
Markdown blocks after source-mapped composition. The first vocabulary consists
of GitHub-Flavored Markdown pipe tables and named footnotes. Fenced code remains
literal, unsupported or malformed structures remain ordinary prose, and the
canonical Markdown and authored files are never rewritten.

LaTeX and direct PDF materializers will consume the same projection. LaTeX will
use `booktabs` tables and native footnotes. The bounded PDF renderer will draw
readable table rows and numbered page notes without evaluating TeX. Both targets
will apply their existing inline citation, reference, code, math, and emphasis
projection inside supported cells and notes.

Table recognition requires a header row followed by a valid delimiter row.
Cells may use escaped pipes and left, center, or right delimiter alignment;
multiline cells, spans, captions, and embedded block content are outside this
slice. Footnote definitions use `[^id]:` with immediate indented continuation
lines, references share one stable number in first-reference order, and
unreferenced definitions do not print.

The source-mapped intermediate schema remains unchanged because the canonical
composed Markdown is still its input. The maintained article template advances
to `kirjolab-article-v2` so manifests distinguish the new rendering contract.

## Trigger

Rendered export inspection found custom and standard Markdown syntax leaking
into publication artifacts after the scholarly-directive projection was added.
Tables and footnotes are the next common structures whose meaning cannot be
preserved by independent line substitutions.

## Consequences

**Positive:**

- LaTeX and PDF agree on which tables and footnotes exist and how they are
  numbered.
- Canonical Markdown stays portable and preview parsing remains owned by
  Satteri.
- The Worker renderer remains deterministic, network-free, and unable to run
  authored TeX.

**Negative:**

- The export projector intentionally supports less Markdown than the browser
  preview and must document each added structure.
- Complex tables and block-rich footnotes remain publisher-facing LaTeX work or
  future reviewed slices.

**Neutral:**

- Existing source spans continue to map authored lines; generated multi-line
  table output maps to the table's consumed source range.

## Alternatives Considered

### Run the browser preview parser in the Worker

Satteri remains the preview oracle, but its current threaded WASM runtime is not
available in the Worker export path. Replatforming it would couple this focused
fidelity fix to a larger runtime decision.

### Maintain independent LaTeX and PDF recognizers

Separate parsers are locally simple but allow recognition, numbering, and
malformed-input behavior to drift between publication targets.

### Preserve the syntax as literal text

This is deterministic but produces incorrect publication artifacts and forces
users to repair output that Kirjolab already has enough structure to render.
