# ADR-045: Use Satteri for Scientific Markdown

**Status:** Implemented

**Date:** 2026-07-10

## Context

Kirjolab must preview the same Markdown and directive language used by
`survivejs/learnscientificwriting`. That project implements its book transform
with Satteri plugins and enables GFM, frontmatter, directives, and heading
attributes. Maintaining a separate regex-oriented Markdown implementation in
Kirjolab would create a second compatibility target and drift from the source
project's tests.

Satteri 0.9.5 ships native Node bindings and a threaded WASI browser binding.
Cloudflare Workers do not provide Web Workers or WebAssembly threading inside a
Worker isolate. The published browser binding also declares `cpu: wasm32`, so
npm omits it during ordinary macOS and Linux installation even though browser
bundlers need it.

## Decision

Pin Satteri 0.9.5 and implement Kirjolab's scientific-writing semantics as
Satteri mdast and hast plugins. Treat the upstream book transform and syntax
tests as the compatibility oracle.

Run Satteri in the browser preview rather than inside the Cloudflare Worker.
Serve its WASM module and helper script through the Worker's static-assets
binding. Add cross-origin opener and embedder policies to HTML responses so the
browser may construct shared WebAssembly memory.

Vendor the exact published `@bruits/satteri-wasm32-wasi@0.9.5` browser files
under `vendor/`, with hashes and its MIT license. Remove the package's npm CPU
installation gate, use a root-relative helper-worker URL compatible with
Cloudflare static assets, and disable the unused N-API asynchronous work pool.
The generated deployment copies remain under the existing ignored
`.generated/assets/` build target.

Escape authored raw HTML before hast conversion and remove unsafe link and image
protocols in a final Satteri security plugin. Semantic citation and reference
HTML is generated only from escaped domain values.

This decision does not prohibit moving Satteri into the Worker if a future
non-threaded binding or compatible runtime path becomes available.

## Trigger

The fifth roadmap slice completes the scientific-writing syntax and replaces
Kirjolab's provisional Markdown renderer with the implementation family used by
the source book.

## Consequences

**Positive:**

- Standard Markdown, GFM tables and footnotes, directives, frontmatter, and
  heading attributes share Satteri parsing behavior.
- Kirjolab plugins stay directly comparable to the book's transform and tests.
- WASM failure cannot corrupt canonical Markdown or Durable Object state.
- Pinned vendor hashes make local CI and deployments deterministic.

**Negative:**

- The browser downloads a roughly 2.3 MB WASM module before starting the app.
- Cross-origin isolation affects how future third-party browser resources must
  be loaded.
- Remote preview images need compatible CORS or cross-origin resource policy
  headers under the required embedder policy.
- Updating Satteri requires refreshing and reviewing the vendored binding.
- A small vendor patch must be retired or rebased when upstream packaging
  changes.

**Neutral:**

- Markdown remains canonical; Satteri HTML and syntax trees are derived state.
- Node tests use Satteri's native binding while browser tests exercise WASM.

## Alternatives Considered

### Maintain a pure TypeScript Markdown subset

This avoids WASM packaging but duplicates CommonMark/GFM and scientific
directive behavior already implemented and tested in the source project.

### Run Satteri inside the Cloudflare Worker

This centralizes rendering but the current binding expects threading and Web
Worker APIs that Workers explicitly do not provide.

### Force-install every optional binding

Setting npm's global force option would bypass the WASM package gate but also
install irrelevant native packages and weaken deterministic platform checks.

### Load Satteri from a public CDN

This avoids vendoring but makes local previews and CI depend on mutable external
assets and complicates cross-origin isolation.
