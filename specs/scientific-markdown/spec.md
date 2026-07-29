# Feature: Scientific Markdown Preview and Validation

## Blueprint

### Context

Researchers author the Markdown syntax defined by
`survivejs/learnscientificwriting/content/book/SYNTAX.md`. Kirjolab must render
that language quickly, validate its semantic links, and avoid inventing a
second Markdown dialect.

### Architecture

- Pinned `scholarmark` parses standard Markdown with GFM, footnotes,
  frontmatter, directives, labels, and bounded native figures through its
  browser-safe synchronous entry.
- Scholarmark owns citations, references, labels, heading numbering, table
  captions and alignment, authored-HTML escaping, source-position metadata,
  bounded BibTeX parsing, and final allowlist sanitization.
- Kirjolab retains only a narrow runtime adapter plus project composition,
  authorized image resolution, preview lifecycle, and cross-file source maps.
- The pure-JavaScript renderer executes in the browser under a
  content-fingerprinted `/markdown-module-{sha256}.js` URL. The Worker serves
  that immutable asset but does not parse canonical documents or proxy
  request-per-edit preview work.
- The runtime loads in parallel with workspace data. Preview renders discard
  stale asynchronous results and fall back to authored source when the runtime
  cannot load.
- A bounded light-DOM workspace Preview component owns that runtime lifecycle,
  stale-render guard, sanitized HTML or escaped-source presentation, renderer
  diagnostics with one-based mapped source lines, isolated-file heading-number
  projection, and authorized local project-image resolution. Project
  composition, canonical Yjs source,
  cross-panel projections, citation navigation, and routing remain outside the
  component.
- Markdown preview no longer requires WebAssembly, a helper Web Worker, shared
  memory, or cross-origin isolation. Remote HTTP(S) images remain subject to the
  browser and source server's ordinary security policy.
- Markdown and BibTeX remain canonical; preview HTML is disposable.

### Supported Syntax

- Standard headings, paragraphs, emphasis, strong text, links, images, lists,
  block quotes, thematic breaks, and fenced code.
- Preview headings preserve a descending visual size hierarchy from manuscript
  title through lower-level sections.
- GFM tables, strikethrough, task lists, autolinks, and footnotes.
- YAML and TOML frontmatter is parsed but not rendered in the preview.
- Standalone `::: comment` … `:::` blocks remain canonical source but do not
  render or contribute headings, citations, references, or validation inside
  the block. Markers in frontmatter and fenced code remain literal. An unclosed
  block diagnoses and keeps the remaining source out of the preview.
- Level-two and level-three headings receive generated section numbers.
- Level-four headings render as unnumbered paragraph labels.
- `::label[id]` immediately following a heading, table caption, figure, or
  paragraph creates its stable reference target.
- `:ref` accepts a bracket target and optional custom `text`.
- `:cite` accepts multiple ids, `parenthetical`, `textual`, and `full` modes,
  plus `locator`, `prefix`, and `suffix`. The familiar `:citet` and `:citep`
  aliases default to textual and parenthetical modes respectively; an explicit
  `mode` attribute remains authoritative.
- Inline author labels show one family name for a single author, both family
  names joined by “and” for two authors, and the first family name followed by
  “et al.” for three or more authors. Bibliography entries retain the complete
  authored list.
- `::bibliography[]` places the cited-reference list at that exact manuscript
  location. Researchers author any surrounding heading as ordinary Markdown.
- Each rendered citation id is an accessible sanitized button keyed by its
  citation alias and carrying the group's inert locator, so grouped citations
  can open one publication at a time and page navigation can remain derived.
- The authoring toolbar exposes labelled insertion templates for citations,
  cross-references, labels, footnotes, links, and `::include[path]`. Insertion
  teaches and writes canonical Markdown syntax; it does not introduce an
  editor-only document model.
- A bounded light-DOM Insert menu owns those template choices, relative
  include-file presentation, empty state, passage-aware link wrapping, template
  selection ranges, and typed insertion bindings. The workspace coordinator
  supplies the resolved collaborative caret and passage and applies the
  canonical source edit through Yjs.
- The source citation control derives the citation at the resolved authoring
  caret for contextual navigation and projects requested citation aliases and
  optional locators into canonical `:cite[…]` syntax. It owns missing-caret,
  invalid-key, and completion wording. Through the editor's existing authoring
  binding, editor status connects it to Context navigation, applies a successful
  insertion through Yjs, restores authoring focus and caret state, activates
  Write, and presents completion or local error feedback.
- Quoted and unquoted single-token directive attributes are accepted, matching
  the source project's examples.
- Experimental version 1 `:::figure{kind="boxplot" version=1}` containers
  accept bounded five-number `::box` summaries and one `::caption`. Valid
  figures render as accessible horizontal boxplots; invalid figures stay
  visible and receive source-positioned diagnostics. The complete contract is
  defined in `specs/native-figures/spec.md`.

### Security Boundary

- Authored raw HTML renders as text rather than executable markup.
- Unsafe protocols such as `javascript:` and image `data:` URLs lose their
  target attributes.
- Rendered elements retain only reviewed properties. Labels provide authored
  ids; event handlers, inline styles, and other arbitrary attributes are
  removed.
- Semantic HTML escapes bibliography, directive, and heading values.
- Native figures select no authored elements or attributes: their bounded text
  and finite values become escaped labels and fixed geometry only. The final
  sanitizer admits only the SVG vocabulary used by that renderer.
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
- [x] Inline citations compact author lists after two authors without
      truncating bibliography entries.
- [x] `:citet` and `:citep` aliases retain citation identity across preview,
      navigation, validation, history rewrites, and every publication output.
- [x] Rendered citation buttons open stable publication context without
      mutating canonical Markdown or the bibliography.
- [x] Rendered citation buttons retain sanitized locator data for local PDF-page
      navigation without exposing project-only evidence identities.
- [x] Labels attached to headings and other blocks plus custom reference text
      resolve.
- [x] An explicit bibliography marker renders cited references in preview and
      publication outputs without printing directive syntax.
- [x] Portable block comments remain visible in source and absent from preview
      and publication semantics.
- [x] Invalid labels, modes, directives, duplicates, and reference targets
      diagnose.
- [x] Browser preview uses one versioned JavaScript runtime without WASM or a
      helper worker.
- [x] Raw HTML and unsafe URL protocols cannot execute in the preview.
- [x] Authored heading attributes cannot introduce executable or unreviewed
      HTML properties.
- [x] Native version 1 boxplots render deterministic sanitized SVG, while
      malformed directives remain visible with bounded diagnostics.
- [x] HTML responses enforce the preview's browser security boundary with CSP.
- [x] Unit tests cover syntax semantics and a browser test proves runtime
      startup.

### Regression Guardrails

- Keep Scholarmark pinned; upgrades require the full syntax and security parity
  suite.
- Keep Citation.js outside the production dependency and browser bundle. The
  bounded Scholarmark parser owns the supported BibTeX preview profile.
- Browser startup must not require cross-origin isolation for Markdown preview.
- Source editing and export must remain usable independently of preview HTML.
- A parser exception must become a bounded diagnostic and escaped source
  fallback, never an application crash or source mutation.
- Standard and scientific Markdown should be delegated to Scholarmark rather
  than reimplemented locally.
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

**Scenario: Imported LaTeX label becomes canonical Markdown**

- Given: a LaTeX block declares a label whose id contains a colon
- When: Kirjolab converts the source to Markdown
- Then: `::label[id]` follows the converted block and `:ref[id]` resolves it

**Scenario: Researcher places the bibliography**

- Given: the manuscript cites project references
- When: the researcher writes a heading followed by `::bibliography[]`
- Then: preview, direct PDF, and LaTeX place the cited-reference list there
  without inventing a heading or printing the marker

**Scenario: Collaborator enters unsafe HTML**

- Given: raw HTML, a `javascript:` link, or executable heading attributes in
  shared Markdown
- When: the preview renders
- Then: raw markup is displayed as text and unsafe target or element attributes
  are absent

**Scenario: Researcher authors a native boxplot**

- Given: a version 1 figure contains labelled ordered five-number summaries and
  one caption
- When: the preview renders
- Then: it shows a deterministic accessible horizontal boxplot without loading
  a plotting runtime or storing generated SVG
