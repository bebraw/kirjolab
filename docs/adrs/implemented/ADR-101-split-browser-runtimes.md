# ADR-101: Split Optional Browser Runtimes

**Status:** Partially superseded by [ADR-102](./ADR-102-use-javascript-for-live-markdown-preview.md)

**Date:** 2026-07-14

**Amends:** [ADR-045](./ADR-045-use-satteri-for-scientific-markdown.md)

## Context

Kirjolab's `/app.js` bundled all browser code into one unminified module. A
production build measured 2,158,645 bytes uncompressed and 394,963 bytes with
gzip. In a minified analysis, PDF.js accounted for 427,944 bytes, or 44% of the
module, even though it is needed only after a researcher opens or inspects a
PDF.

Satteri also contributed its JavaScript N-API/WASI compatibility runtime to the
main module and loads a separate 2,397,591-byte Wasm binary. A constrained
Chrome trace showed that eager module evaluation serialized startup behind the
Wasm download: workspace requests did not start until the binary finished.
Moving this work to the edge would require the published binding to run in
Cloudflare Workers. The
pinned Satteri 0.9.5 binding targets `wasm32-wasip1-threads`, creates shared
memory with 4,000 initial pages (250 MiB), and supplies a browser `Worker` from
`onCreateWorker`.

[Cloudflare Workers support imported Wasm modules](https://developers.cloudflare.com/workers/runtime-apis/webassembly/),
but each isolate is single-threaded, the Web Worker API is unavailable, WASI
support is partial, and the
[runtime memory limit is 128 MiB](https://developers.cloudflare.com/workers/platform/limits/#memory).
The published Satteri binding therefore cannot run safely in the current Worker
runtime without a separately compiled non-threaded target and a materially
smaller memory configuration.

## Decision

Minify the browser application and Satteri helper bundles. Publish the Satteri
Markdown JavaScript runtime as the versioned, immutable
`/markdown-module-0.9.5.js` asset. Start loading it concurrently with workspace
data, cache the successful module, discard superseded preview renders, and show
authored source if the runtime cannot load. This keeps the application shell and
workspace data from waiting behind Wasm initialization.

Remove PDF.js from the initial application module and publish it as the
versioned, immutable `/pdfjs-module-6.1.200-compat-1.js` runtime asset. A shared loader
imports that asset only when a PDF viewer or metadata scan first needs it,
caches the successful module, and allows a failed load to be retried.

Keep Satteri rendering in the browser under ADR-045. Do not proxy live preview
rendering through a request-per-edit edge API, and do not maintain a private
Satteri Wasm fork solely to force the threaded WASI artifact into Workers.
Reconsider edge rendering when upstream publishes a non-threaded,
Worker-compatible binding whose memory and startup costs can be measured
against the browser path.

The optimized initial module measures 282,103 bytes uncompressed and 78,840
bytes with gzip in the same local build, an 80% compressed reduction. The
Markdown JavaScript runtime is 64,698 bytes with gzip and loads concurrently
with workspace data; PDF.js is downloaded separately only when used and retains
the existing dedicated PDF worker.

In a cache-bypassed Chrome trace using Slow 4G and 4× CPU throttling, this moved
workspace data availability from 7.84 seconds to 2.85 seconds and reduced LCP
from 8.56 seconds to 7.40 seconds. The remaining cold-load critical path is the
725,877-byte compressed Satteri Wasm binary. An unthrottled local trace measured
138 ms FCP, 196 ms LCP, and 0.03 CLS.

## Trigger

Production inspection found an approximately 420 kB transferred application
module and questioned whether browser-side Satteri rendering should move to the
edge.

## Consequences

**Positive:**

- The initial compressed JavaScript transfer falls by roughly 316 kB.
- Workspace data and editor initialization no longer wait for Satteri Wasm.
- Researchers who do not open a PDF do not download or parse PDF.js.
- PDF viewing and metadata extraction share one cached lazy runtime.
- The live Markdown preview remains local and does not add network requests per
  edit.

**Negative:**

- Opening the first PDF incurs one additional module request before PDF.js can
  start its worker.
- Satteri's large Wasm download and browser compatibility runtime remain.
- The versioned Markdown and PDF module assets must remain compatible with the
  main module and their dedicated worker or Wasm assets.
- The first formatted preview completes asynchronously; authored source remains
  available if the Markdown runtime fails to load.

**Neutral:**

- Canonical Markdown, generated HTML, PDF bytes, and collaboration contracts do
  not change.
- Cloudflare's ability to run Wasm does not by itself make threaded WASI
  binaries Worker-compatible.

## Alternatives Considered

### Render every preview on the edge

This removes Satteri from the browser but makes live editing depend on a network
round trip, increases edge CPU work, and is blocked by the published binding's
thread and memory requirements.

### Build and maintain a private non-threaded Satteri target

This might make edge execution possible, but creates an upstream fork and a new
binary compatibility surface before there is evidence that server rendering is
faster or more economical.

### Keep one bundle and only enable minification

Minification helps, but every session would still download and parse PDF.js.

### Split Satteri without parallelizing workspace startup

This changes the reported main-module size without letting workspace requests
overtake Wasm initialization, so it does not address the observed serialization.
