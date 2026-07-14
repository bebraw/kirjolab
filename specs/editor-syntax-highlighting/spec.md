# Feature: Editor Syntax Highlighting

## Blueprint

### Context

Researchers author portable scientific Markdown directly. The source editor
should make document structure and scholarly directives easier to scan while
preserving the native collaborative textarea and exact source text.

### Architecture

- **Input authority:** `#source-editor` remains the only editable manuscript
  surface and continues to bind directly to the active Yjs text.
- **Projection:** `src/client/markdown-highlighting.ts` classifies bounded
  lexical ranges without changing, omitting, or normalizing source characters.
- **Presentation:** `#source-editor-highlight` is an inert, `aria-hidden` mirror
  behind the transparent textarea glyphs. It uses safe text nodes, shows a
  line-number gutter whose rows follow wrapped logical lines, and follows the
  textarea scroll position.
- **Semantics:** Satteri preview parsing and validation remain authoritative;
  highlight classes are visual hints only.

### Highlighted Syntax

- Heading markers and heading text
- YAML frontmatter delimiters and keys
- Fenced and inline code
- Links, emphasis, heading anchors, and footnote references
- Citation and cross-reference directives
- Block directives, list markers, and quote markers

### Anti-Patterns

- Do not write highlighted markup back into Yjs or canonical Markdown.
- Do not use `innerHTML` with authored source.
- Do not make the presentation layer focusable or available to assistive
  technology as duplicate editor content.
- Do not treat lexical highlighting as syntax validation.
- Do not replace the textarea with a second editor model without superseding
  ADR-077 and explicitly migrating collaboration and selection behavior.

## Contract

### Definition of Done

- [x] Highlight projection concatenates to the exact source, including CRLF.
- [x] Headings and core scholarly syntax receive restrained token styling.
- [x] Local input, remote Yjs updates, file switches, and editor scrolling
      refresh the mirrored presentation.
- [x] Visible line numbers stay aligned with logical lines as prose wraps and
      scroll with the manuscript.
- [x] Forced-colors mode falls back to visible native textarea text.
- [x] Unit and browser tests cover classification, safe mirrored rendering,
      scroll synchronization, editing, and collaborative updates.

### Regression Guardrails

- The textarea value, selection offsets, and Yjs state remain authoritative.
- Highlight output must never execute or interpret authored HTML.
- The mirror must stay text-identical and aligned during scrolling and
  wrapping; line-number decoration must not enter its text content.
- Unsupported or incomplete syntax remains readable as ordinary source.

### Scenarios

**Scenario: Researcher scans a manuscript**

- Given: the source contains headings, citations, links, and directives
- When: the active file is rendered in the editor
- Then: those ranges receive distinct restrained styling while all source
  punctuation remains visible

**Scenario: Collaborator edits the active file**

- Given: the editor is synchronized through Yjs
- When: a remote update changes the source
- Then: the textarea and highlighting mirror converge without changing the
  current local selection bounds

**Scenario: High-contrast rendering is active**

- Given: the browser reports forced colors
- When: the editor is displayed
- Then: the mirror is hidden and native textarea text remains visible
