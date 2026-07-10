# Feature: Scientific Markdown Preview and Validation

## Blueprint

### Context

Researchers author the Markdown syntax defined by
`survivejs/learnscientificwriting/content/book/SYNTAX.md`. Kirjolab must render
that language quickly, validate its semantic links, and avoid inventing a
second Markdown dialect.

### Architecture

- Satteri 0.9.5 parses standard Markdown with GFM, footnotes, frontmatter,
  directives, and heading attributes enabled.
- `src/domain/markdown.ts` supplies synchronous mdast and hast plugins for
  citations, references, aliases, anchors, heading numbering, and preview
  security.
- Browser WASM is pinned under `vendor/satteri-wasm32-wasi/` and copied to
  `.generated/assets/` during builds.
- Satteri executes in the browser. The Worker serves its static assets but does
  not parse canonical documents or require WASM threads.
- HTML responses opt into cross-origin isolation. Satteri assets are same-origin
  and carry a same-origin resource policy.
- Remote images remain valid Markdown but browsers may block their preview
  unless the remote server opts into compatible cross-origin loading.
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
- Quoted and unquoted single-token directive attributes are accepted, matching
  the source project's examples.

### Security Boundary

- Authored raw HTML renders as text rather than executable markup.
- Unsafe protocols such as `javascript:` and image `data:` URLs lose their
  target attributes.
- Semantic HTML escapes bibliography, directive, and heading values.
- Only the typed client inserts preview HTML into the DOM.

### Anti-Patterns

- Do not add syntax through pre-render string replacement ahead of Satteri.
- Do not treat preview HTML or a Satteri syntax tree as canonical state.
- Do not run the current threaded binding inside a Cloudflare Worker isolate.
- Do not update the vendored WASM without matching version, license, and hashes.
- Do not relax cross-origin isolation while the binding uses shared memory.
- Do not pass authored raw HTML through to `innerHTML`.

## Contract

### Definition of Done

- [x] The documented standard Markdown and GFM examples render through Satteri.
- [x] Citation modes, multiple ids, locators, prefixes, and suffixes render.
- [x] Heading, alias, anchor, and custom reference targets resolve.
- [x] Invalid ids, modes, directives, duplicates, and alias targets diagnose.
- [x] Browser preview uses the Satteri WASM binding under cross-origin isolation.
- [x] WASM and helper assets are available through local Wrangler and static
      assets.
- [x] Raw HTML and unsafe URL protocols cannot execute in the preview.
- [x] Unit tests cover syntax semantics and a browser test proves WASM startup.

### Regression Guardrails

- Keep Satteri pinned to the same reviewed version as the source book unless a
  compatibility change is intentional and documented.
- Browser startup must prove `crossOriginIsolated === true`.
- Source editing and export must remain usable independently of preview HTML.
- A parser exception must become a bounded diagnostic and escaped source
  fallback, never an application crash or source mutation.
- Standard Markdown should be delegated to Satteri rather than reimplemented.
- Satteri asset routes must remain same-origin, immutable, and content-typed.

### Scenarios

**Scenario: Researcher writes a structured chapter section**

- Given: headings, a table, a footnote, citations, and a reference
- When: the source changes
- Then: Satteri produces numbered semantic HTML and Kirjolab reports unresolved
  scholarly targets without changing Markdown

**Scenario: Reference uses a legacy LaTeX label**

- Given: an alias or anchor whose target contains a colon
- When: the researcher uses `:ref[text]{target="legacy:label"}`
- Then: the link resolves to the public slug while preserving the stable target

**Scenario: Collaborator enters unsafe HTML**

- Given: raw HTML or a `javascript:` link in shared Markdown
- When: the preview renders
- Then: raw markup is displayed as text and unsafe target attributes are absent
