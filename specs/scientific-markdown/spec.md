# Feature: Scientific Markdown Preview and Validation

## Blueprint

### Context

Researchers author the Markdown syntax defined by
`survivejs/learnscientificwriting/content/book/SYNTAX.md`. Kirjolab must render
that language quickly, validate its semantic links, and avoid inventing a
second Markdown dialect.

### Architecture

- A pinned unified/remark pipeline parses standard Markdown with GFM,
  footnotes, frontmatter, directives, and heading attributes enabled.
- `src/domain/markdown.ts` supplies synchronous mdast and hast transforms for
  citations, references, aliases, anchors, heading numbering, table alignment,
  authored-HTML escaping, and final allowlist sanitization.
- The pure-JavaScript renderer executes in the browser as the versioned
  `/markdown-module-1.js` runtime. The Worker serves that immutable asset but
  does not parse canonical documents or proxy request-per-edit preview work.
- The runtime loads in parallel with workspace data. Preview renders discard
  stale asynchronous results and fall back to authored source when the runtime
  cannot load.
- Markdown preview no longer requires WebAssembly, a helper Web Worker, shared
  memory, or cross-origin isolation. Remote HTTP(S) images remain subject to the
  browser and source server's ordinary security policy.
- Markdown and BibTeX remain canonical; preview HTML is disposable.

### Supported Syntax

- Standard headings, paragraphs, emphasis, strong text, links, images, lists,
  block quotes, thematic breaks, and fenced code.
- GFM tables, strikethrough, task lists, autolinks, and footnotes.
- YAML and TOML frontmatter is parsed but not rendered in the preview.
- Level-two and level-three headings receive generated section numbers.
- Level-four headings render as unnumbered paragraph labels.
- Explicit heading ids, `::alias`, and `::anchor` create reference targets.
- `:ref` accepts bracket targets, custom `text`, and legacy `target` attributes.
- `:cite` accepts multiple ids, `parenthetical`, `textual`, and `full` modes,
  plus `locator`, `prefix`, and `suffix`.
- Each rendered citation id is an accessible sanitized button keyed by its
  citation alias, so grouped citations can open one publication at a time.
- The authoring toolbar exposes labelled insertion templates for citations,
  cross-references, anchors, footnotes, links, and `::include[path]`. Insertion
  teaches and writes canonical Markdown syntax; it does not introduce an
  editor-only document model.
- Quoted and unquoted single-token directive attributes are accepted, matching
  the source project's examples.

### Security Boundary

- Authored raw HTML renders as text rather than executable markup.
- Unsafe protocols such as `javascript:` and image `data:` URLs lose their
  target attributes.
- Rendered elements retain only reviewed properties. Authored heading
  attributes may provide ids and classes; event handlers, inline styles, and
  other arbitrary attributes are removed.
- Semantic HTML escapes bibliography, directive, and heading values.
- Only the typed client inserts preview HTML into the DOM.
- HTML responses apply a restrictive Content Security Policy. Same-origin
  scripts and workers remain available for the typed client and renderer,
  without allowing WebAssembly evaluation; browser connections are limited to
  the workspace origin and loopback local-model endpoints.

### Anti-Patterns

- Do not add syntax through pre-render string replacement ahead of the parser.
- Do not treat preview HTML or a unified syntax tree as canonical state.
- Do not move live preview to request-per-edit edge rendering without measuring
  revision coordination, network cost, and Worker CPU on bounded manuscripts.
- Do not pass authored raw HTML through to `innerHTML`.

## Contract

### Definition of Done

- [x] The documented standard Markdown and GFM examples render through the
      pinned JavaScript pipeline.
- [x] Citation modes, multiple ids, locators, prefixes, and suffixes render.
- [x] Rendered citation buttons open stable publication context without
      mutating canonical Markdown or the bibliography.
- [x] Heading, alias, anchor, and custom reference targets resolve.
- [x] Invalid ids, modes, directives, duplicates, and alias targets diagnose.
- [x] Browser preview uses one versioned JavaScript runtime without WASM or a
      helper worker.
- [x] Raw HTML and unsafe URL protocols cannot execute in the preview.
- [x] Authored heading attributes cannot introduce executable or unreviewed
      HTML properties.
- [x] HTML responses enforce the preview's browser security boundary with CSP.
- [x] Unit tests cover syntax semantics and a browser test proves runtime
      startup.

### Regression Guardrails

- Keep every parser and transform dependency pinned; upgrades require the full
  syntax and security parity suite.
- Browser startup must not require cross-origin isolation for Markdown preview.
- Source editing and export must remain usable independently of preview HTML.
- A parser exception must become a bounded diagnostic and escaped source
  fallback, never an application crash or source mutation.
- Standard Markdown should be delegated to unified/remark rather than
  reimplemented.
- The Markdown runtime route must remain same-origin, immutable, versioned, and
  content-typed.
- Citation activation may navigate local research context but must never cite,
  import, enrich, or link a resource as an implicit side effect.

### Scenarios

**Scenario: Researcher writes a structured chapter section**

- Given: headings, a table, a footnote, citations, and a reference
- When: the source changes
- Then: the JavaScript pipeline produces numbered semantic HTML and Kirjolab
  reports unresolved scholarly targets without changing Markdown

**Scenario: Reference uses a legacy LaTeX label**

- Given: an alias or anchor whose target contains a colon
- When: the researcher uses `:ref[text]{target="legacy:label"}`
- Then: the link resolves to the public slug while preserving the stable target

**Scenario: Collaborator enters unsafe HTML**

- Given: raw HTML, a `javascript:` link, or executable heading attributes in
  shared Markdown
- When: the preview renders
- Then: raw markup is displayed as text and unsafe target or element attributes
  are absent
