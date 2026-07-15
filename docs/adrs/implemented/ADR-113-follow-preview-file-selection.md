# ADR-113: Follow Preview File Selection

**Status:** Implemented

**Date:** 2026-07-15

## Context

Kirjolab has one authoritative publication rooted at `main.md`, but Preview
always shows that complete composition even while the editor shows a selected
supporting file. This split makes focused editing difficult: the visible source
and rendered result can describe different scopes, and a short section may be
hard to find inside a long paper.

Changing Preview must not make supporting files publication roots. Export,
statistics, revision comparison, project search, and validation need one stable
project composition. Preview image paths and diagnostics also need to retain
the selected file's identity when the paper composition is not being shown.

## Decision

Preview will follow the active Markdown file. When `main.md` is active, Preview
will render the bounded, source-mapped project composition exactly as before.
When a supporting file is active, Preview will render only that file's authored
Markdown without expanding `::include` directives. A compact label will show
the active path and distinguish **composed paper** from **isolated file**.

The isolated representation will retain a source span for the selected file so
relative images and navigable Markdown diagnostics resolve against that file.
All publication-facing and project-wide derived behavior—including exports,
word statistics, history, search, and the project map—will continue to consume
the authoritative composition rooted at `main.md`.

## Trigger

Tablet and authoring review found that Preview should match file selection so a
researcher can examine a supporting section without locating it in the complete
paper.

## Consequences

**Positive:**

- Editor and Preview scopes stay aligned while working in supporting files.
- Small sections can be reviewed without unrelated paper content.
- The visible label makes the difference between file preview and publication
  composition explicit.

**Negative:**

- A supporting file's isolated Preview can differ from its appearance after
  transclusion, especially around surrounding headings and bibliography state.
- Includes authored inside a supporting file are not expanded until `main.md`
  or another composed publication path is reviewed.

**Neutral:**

- `main.md` selection retains the existing composed Preview.
- Supporting files remain project parts, not documents or export targets.

## Alternatives Considered

### Always preview the composed paper

Rejected because the editor and Preview show different scopes while a
supporting file is selected, making focused review unnecessarily difficult.

### Compose from every selected file

Rejected because it gives supporting files implicit entry-point semantics and
makes nested includes look like independent publications. Isolated Preview is a
deliberately narrower editing aid.

### Add a persistent preview-scope toggle

Rejected for now because file selection already communicates the desired scope
and a second persistent control would add state and ambiguity to a compact
context header.
