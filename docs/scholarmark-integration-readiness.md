# Scholarmark Integration Readiness

## Purpose

Kirjolab would like to consume the published `scholarmark` package instead of
maintaining its own scientific Markdown renderer. This note records the gaps
found while evaluating `scholarmark@0.3.0` and defines a practical acceptance
target for an integration pilot.

The package is already a close architectural match. It owns the same
unified/remark pipeline, sanitization boundary, scholarly directives, portable
comments, native figures, and citation presentation that Kirjolab currently
maintains locally. Its tree rendering, table captions, publication-wide
reference targets, and citation formatter hooks would also extend the current
renderer in useful directions.

If the gaps below are resolved, Kirjolab should be able to remove approximately
1,282 lines of renderer implementation from these files:

- `src/domain/markdown.ts`
- `src/domain/markdown-comments.ts`
- `src/domain/native-figures.ts`
- `src/domain/scholarly-export.ts`

Contract-level tests should remain in Kirjolab even when implementation tests
move upstream.

## Published Package Evaluated

- Package: `scholarmark@0.3.0`
- License: MIT
- Published files: 22
- Unpacked size: approximately 106 kB
- Runtime requirement: Node.js 20.19 or newer
- Package exports: root export only

The evaluation used the published npm tarball rather than an unpublished source
checkout.

## Blocking Gap 1: Browser Bundling

Kirjolab renders Markdown in a lazy-loaded browser module. The published
Scholarmark root entry cannot currently be bundled with esbuild for a browser
target.

### Reproduction

```sh
npm install scholarmark@0.3.0
esbuild node_modules/scholarmark/dist/index.js \
  --bundle \
  --format=esm \
  --platform=browser \
  --outfile=scholarmark-browser.js
```

esbuild reports unresolved Node built-ins reached through Citation.js and
`node-fetch`, including:

```text
node:http
node:https
node:zlib
node:stream
node:buffer
node:url
```

The root export also imports `@citation-js/plugin-bibtex` for its side effect.
Because the renderer reaches bibliography parsing through
`scholarly-export.js`, importing only rendering functionality does not isolate
the browser bundle from that dependency graph. The package currently exposes no
public subpath that would let a consumer select a browser-safe entry.

### Desired Outcome

Provide a supported browser entry point that:

- bundles under esbuild with `platform: "browser"` and no Node polyfills;
- contains no imports of Node built-ins;
- retains synchronous rendering for Kirjolab's local preview path;
- performs no implicit network requests;
- preserves the sanitizer as the final boundary for authored content; and
- exposes types through the package `exports` map.

Possible designs include a browser-specific conditional export, a public
renderer subpath, or injection of bibliography parsing and citation formatting.
The package should choose the design that keeps one authoritative renderer
without forcing browser consumers to install a Node compatibility layer.

An upstream browser-bundle smoke test should protect this contract.

## Kirjolab Syntax Migration

Kirjolab's current manuscripts use reference forms that `scholarmark@0.3.0`
does not accept directly:

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

- [ ] A documented browser import bundles with esbuild without Node polyfills.
- [ ] The browser bundle contains no Node built-in imports.
- [ ] Browser rendering remains synchronous and performs no implicit fetches.
- [ ] Comment, native-figure, scholarly-export, and renderer helpers needed by
      hosts are public and typed.
- [ ] Sanitized HTML retains source positions, citation identity, and locators.
- [ ] Raw HTML and unsafe protocols remain inert.
- [ ] Package CI exercises browser bundling and representative rendering.
- [ ] Package CI reports browser bundle raw and gzip sizes.
- [ ] The package documents which entry is safe for browser use.

## Kirjolab Pilot After Upstream Release

Once a release satisfies the checks above, Kirjolab can run a bounded pilot:

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

This sequence lets the package prove that it reduces maintenance without
coupling the rest of Kirjolab to an unverified renderer migration.
