# Scholarmark Integration Readiness

## Purpose

Kirjolab would like to consume the published `scholarmark` package instead of
maintaining its own scientific Markdown renderer. This note records the gaps
found in `scholarmark@0.3.0` and the adoption outcome reached with
`scholarmark@0.8.0`.

The package is already a close architectural match. It owns the same
unified/remark pipeline, sanitization boundary, scholarly directives, portable
comments, native figures, and citation presentation that Kirjolab currently
maintains locally. Its tree rendering, table captions, publication-wide
reference targets, and citation formatter hooks would also extend the current
renderer in useful directions.

The resolved package lets Kirjolab remove approximately
1,282 lines of renderer implementation from these files:

- `src/domain/markdown.ts`
- `src/domain/markdown-comments.ts`
- `src/domain/native-figures.ts`
- `src/domain/scholarly-export.ts`

Contract-level tests should remain in Kirjolab even when implementation tests
move upstream.

## Published Package Evaluated

- Package: `scholarmark@0.8.0`
- License: MIT
- Published files: 26
- Unpacked size: approximately 119 kB
- Runtime requirement: Node.js 20.19 or newer
- Package exports: root, browser, and optional Citation.js adapter

The evaluation used the published npm tarball rather than an unpublished source
checkout.

## Resolved: Browser Bundling

Kirjolab renders Markdown in a lazy-loaded browser module. Scholarmark 0.8.0
publishes `scholarmark/browser` as ordinary tree-shakeable ESM. It bundles with
esbuild's browser platform without Node polyfills, Citation.js, fetch
dependencies, or implicit network behavior.

### Reproduction

```sh
npm install scholarmark@0.8.0
esbuild browser-consumer.ts \
  --bundle \
  --format=esm \
  --platform=browser \
  --outfile=scholarmark-browser.js
```

The supported browser entry:

- bundles under esbuild with `platform: "browser"` and no Node polyfills;
- contains no imports of Node built-ins;
- retains synchronous rendering for Kirjolab's local preview path;
- performs no implicit network requests;
- preserves the sanitizer as the final boundary for authored content; and
- exposes types through the package `exports` map; and
- uses a bounded built-in BibTeX parser while keeping Citation.js optional.

Bundled in Kirjolab's production browser shell, version 0.8.0 measures 209,385
bytes raw and 63,870 bytes with gzip. That is 4,606 bytes raw and 1,330 bytes
with gzip above the previous local runtime. Upstream browser-bundle smoke tests
protect this contract.

## Kirjolab Syntax Migration

Kirjolab's earlier manuscripts used reference forms that `scholarmark@0.3.0`
did not accept directly:

```markdown
## Methods {#methods}

::alias[legacy:methods]{slug=methods}

::anchor[Methods appendix]{slug=appendix-methods}
```

Scholarmark's existing label and reference forms are sufficient to represent
these relationships. Kirjolab can adopt them without adding compatibility
syntax upstream.

An explicit heading id becomes a label following the heading:

```markdown
## Methods

::label[methods]
```

An alias can be removed after references to its legacy target are rewritten to
the canonical label:

```markdown
## Methods

::label[methods]

See :ref[methods].
```

An anchor becomes a label attached to the preceding Markdown block. When the
old anchor title supplied the default reference text, the migrated reference
can preserve it explicitly:

```markdown
The appendix describes the complete method.

::label[appendix-methods]

See :ref[appendix-methods]{text="Methods appendix"}.
```

This conversion belongs in Kirjolab's integration work rather than in the
Scholarmark package. It must rewrite the complete composed project so aliases
and custom slugs resolve to one canonical label, remain idempotent, and avoid
examples inside frontmatter, fenced code, or portable comment blocks. Existing
historical snapshots can remain immutable; Kirjolab can migrate materialized
source when it adopts the new renderer.

## Integration API

Kirjolab currently consumes this narrow synchronous interface:

```ts
interface MarkdownRuntime {
  headingNumbersByOffset(source: string): Readonly<Record<number, string>>;
  renderWorkspaceMarkdown(
    source: string,
    bibliography: string,
    citationStyle?: "apa" | "chicago-author-date" | "ieee",
    options?: { headingNumbers?: Readonly<Record<number, string>> },
  ): {
    html: string;
    diagnostics: Array<{
      severity: "error" | "warning";
      message: string;
      from: number;
      to: number;
    }>;
  };
}
```

Scholarmark's `renderSync()` and `headingNumbersByOffset()` are close enough
that Kirjolab can own a small adapter. The extra `headings` and `references`
metadata is additive and useful.

The following helpers are also consumed outside the live renderer and need
stable public replacements if their local implementations are removed:

- portable Markdown comment projection;
- native figure parsing and rendering;
- citation directive recognition and mode selection;
- publication reference-label extraction;
- publication citation entry parsing and text formatting; and
- bibliography directive recognition.

These helpers may remain root exports or move to documented subpaths, but they
should not require consumers to import private `dist` files.

## Output and Security Parity

An integration pilot must preserve these behaviors:

- standard Markdown, GFM, frontmatter, directives, footnotes, and task lists;
- source offsets through `data-source-from` and `data-source-to`;
- citation identity and inert locators on sanitized interactive elements;
- deterministic heading numbering, including host-provided numbering;
- portable comment masking and unclosed-comment diagnostics;
- deterministic, sanitized native figure SVG;
- raw authored HTML rendered as text;
- rejection of executable elements, properties, and unsafe URL protocols;
- bounded source-positioned diagnostics;
- escaped-source fallback after a renderer exception; and
- no source mutation or implicit external fetch during rendering.

Kirjolab currently ships a roughly 200 kB unminified lazy Markdown runtime.
The upstream browser smoke test should report raw and gzip bundle sizes so an
integration can detect substantial regressions before adoption.

## Suggested Upstream Acceptance Checks

- [x] A documented browser import bundles with esbuild without Node polyfills.
- [x] The browser bundle contains no Node built-in imports.
- [x] Browser rendering remains synchronous and performs no implicit fetches.
- [x] Comment, native-figure, scholarly-export, and renderer helpers needed by
      hosts are public and typed.
- [x] Sanitized HTML retains source positions, citation identity, and locators.
- [x] Raw HTML and unsafe protocols remain inert.
- [x] Package CI exercises browser bundling and representative rendering.
- [x] Package CI reports browser bundle raw and gzip sizes.
- [x] The package documents which entry is safe for browser use.
- [x] Package exports resolve in CommonJS-aware tools such as Playwright.

### Resolved 0.8.0 packaging gap

Playwright transforms Kirjolab's TypeScript E2E graph through CommonJS. The
0.6.0 provided only `types` and `import` conditions, so Node reported
`ERR_PACKAGE_PATH_NOT_EXPORTED` for `require("scholarmark")`. Version 0.8.0
adds a `default` condition to each public entry while retaining the existing
ESM files:

```json
{
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js",
    "default": "./dist/index.js"
  },
  "./browser": {
    "types": "./dist/browser.d.ts",
    "import": "./dist/browser.js",
    "default": "./dist/browser.js"
  },
  "./citation-js": {
    "types": "./dist/citation-js.d.ts",
    "import": "./dist/citation-js.js",
    "default": "./dist/citation-js.js"
  }
}
```

Both `require("scholarmark")` and `await import("scholarmark")` now succeed on
Kirjolab's pinned Node runtime, and all 74 Playwright tests pass.

## Kirjolab Pilot Outcome

Kirjolab completed the bounded implementation in this sequence:

1. Add the pinned Scholarmark release and retain the existing runtime adapter.
2. Migrate legacy heading ids, aliases, anchors, and references to canonical
   Scholarmark labels and reference targets.
3. Switch only the lazy browser Markdown runtime to Scholarmark.
4. Run the existing renderer, sanitizer, source-position, native-figure, and
   browser-startup suites unchanged.
5. Compare generated HTML and diagnostics for the migrated fixture corpus.
6. Measure the built runtime and dependency-cost delta.
7. Move shared helper consumers to public Scholarmark exports.
8. Remove local implementations only after behavioral parity is established.

The migration removes 1,658 net lines while preserving the browser-runtime
size, sanitizer boundary, and local synchronous rendering contract. Kirjolab
retains focused host-level contract tests; the package owns the duplicated
implementation and its detailed unit coverage. Version 0.8.0 passes the full
local gate from a clean package installation.
