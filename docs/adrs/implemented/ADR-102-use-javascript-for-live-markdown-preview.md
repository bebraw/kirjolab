# ADR-102: Use JavaScript for Live Markdown Preview

**Status:** Implemented

**Date:** 2026-07-14

**Supersedes:** [ADR-045](./ADR-045-use-satteri-for-scientific-markdown.md)

**Amends:** [ADR-048](./ADR-048-secure-browser-collaboration-boundary.md),
[ADR-101](./ADR-101-split-browser-runtimes.md)

## Context

ADR-045 selected Satteri to stay aligned with the source scientific-writing
syntax. ADR-101 moved Satteri out of the main application module, but the live
preview still required a 2,397,591-byte threaded WASM binary, a browser Worker,
WASI compatibility JavaScript, 250 MiB of initial shared memory, and
cross-origin isolation. The remaining cold-load critical path was substantially
larger than the application module itself.

The preview does not need native throughput. Markdown and BibTeX remain the
canonical state, preview HTML is disposable, and the existing syntax/security
suite already defines the compatibility boundary. A pure-JavaScript parser can
therefore replace the runtime without changing collaboration, persistence, or
export contracts.

Rendering on the edge would also remove parser code from the browser, but a
request-per-edit design would add network dependency, repeated full-document
responses, revision coordination, and Worker CPU cost to an interaction that is
currently local and resilient to disconnection.

## Decision

Render live preview in the browser through a pinned unified/remark pipeline.
Use remark for CommonMark, GFM, frontmatter, directives, and mdast-to-hast
conversion. Keep Kirjolab's citations, references, aliases, anchors, heading
attributes, section numbering, and table alignment as typed tree transforms in
`src/domain/markdown.ts`.

Escape authored HTML into text before hast conversion. Sanitize the final hast
tree with an explicit `rehype-sanitize` element, property, protocol, and task
input allowlist before serialization. Preserve the Content Security Policy as
defense in depth and remove the no-longer-needed `wasm-unsafe-eval` permission.

Publish the renderer as the versioned immutable `/markdown-module-1.js` asset,
load it concurrently with workspace data, cache the successful module, and
discard superseded preview renders. Keep preview rendering local rather than
adding a request-per-edit Worker API.

Remove Satteri, its N-API/WASI dependencies, vendored browser binding, helper
Worker, generated asset build, and cross-origin embedder policy. Retain the
separate lazy PDF.js runtime from ADR-101.

The production build measures the new Markdown runtime at 194,746 bytes
uncompressed and 59,043 bytes with gzip level 9. The application module remains
282,448 bytes uncompressed and 78,537 bytes with gzip level 9. This replaces the
prior Markdown JavaScript plus the 2,397,591-byte WASM binary and helper runtime
with one JavaScript resource.

## Trigger

The remaining Satteri download was identified as the largest avoidable browser
payload after the application and PDF.js runtime split.

## Consequences

**Positive:**

- Browser preview no longer downloads or initializes WASM, WASI, or a helper
  Worker.
- Live editing keeps local preview updates and does not add edge requests.
- Cross-origin isolation and `wasm-unsafe-eval` are no longer required.
- The mdast/hast pipeline retains explicit extension and sanitizer boundaries.
- The vendored binary and platform-specific Satteri dependency graph disappear.

**Negative:**

- Kirjolab no longer runs the same parser implementation as the source book.
- Parser compatibility depends on the parity suite and deliberate dependency
  upgrades rather than a shared Satteri version.
- The pure-JavaScript runtime has more npm packages than a minimal Markdown
  parser, although its shipped bundle is substantially smaller than the WASM
  path.

**Neutral:**

- Markdown, BibTeX, collaboration state, diagnostics, and exports remain
  canonical or derived at the same boundaries as before.
- PDF.js remains a separate on-demand browser runtime.

## Alternatives Considered

### Render preview on the edge

This minimizes browser parser code, but makes live preview depend on network
round trips and introduces revision, bandwidth, request-volume, and Worker CPU
concerns. It remains viable for a future server-authoritative render workflow,
not as the default per-edit path.

### Use a minimal string-to-HTML parser

Marked or markdown-it have smaller parser cores, but exact directives,
footnotes, heading attributes, accessible footnote output, and final tree
sanitization would require more custom compatibility code. The unified pipeline
offers a smaller migration risk while still eliminating the dominant payload.

### Retain Satteri after splitting it

This preserves exact parser identity but retains the large binary, shared-memory
requirements, cross-origin isolation, and vendored runtime maintenance that
motivated this decision.
