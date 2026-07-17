# ADR-142: Render TikZ in a Browser Sandbox

**Status:** Accepted

**Date:** 2026-07-17

## Context

Some imported scholarly papers contain TikZ or PGFPlots figures whose source is
valuable and cannot be represented faithfully as ordinary Markdown. Requiring
every researcher to pre-render those figures weakens migration, while running
TeX in the hosted Worker violates Kirjolab's rule against executing arbitrary
authored TeX in its trusted publication path.

TikZJax compiles TeX to WebAssembly in the browser and converts DVI output to
SVG. A maintained browser distribution can be pinned and self-hosted together
with the exact TeX support files it exposes, including a bounded PGFPlots
package set. Its output is still untrusted generated markup and its TeX runtime
is still programmable, so browser locality alone is not a sufficient security
boundary.

## Decision

Preserve supported imported TikZ as canonical fenced `tikz` code blocks and
render it only as disposable browser-local preview state.

The TikZ runtime will be a pinned, self-hosted, lazily loaded optional asset. It
will execute inside a disposable Web Worker with a closed virtual filesystem,
no network capability, no shell escape, a bounded source length, a compilation
deadline, a bounded output size, and worker termination after completion or
failure. The normal application bundle and projects without TikZ will not load
the runtime.

Every generated SVG must pass the same inert SVG validation principles used for
project images before it enters the preview DOM. Rendering failure leaves the
canonical TikZ source untouched and shows a source-qualified diagnostic. A
rendered SVG is derived cache data keyed by the renderer version and exact
source digest; it is never accepted as authored project source implicitly.

The first compatibility tier covers core TikZ and the explicitly bundled
PGFPlots packages and libraries. Imports that require unavailable packages,
external data files, command execution, or network resources remain readable
as source and produce a review warning. A later archive fixture may expand the
pinned compatibility tier only through an explicit dependency and security
review.

Publication export must not depend on an ephemeral browser cache. It may either
render the same source through a separately approved reproducible boundary or
include an explicitly materialized, sanitized SVG artifact whose renderer and
source identities are recorded.

## Trigger

The LaTeX import design raised the need to preserve figures from older papers,
and TikZJax provides a browser-local route to SVG without introducing a hosted
native TeX service.

## Consequences

**Positive:**

- Imported TikZ remains editable, portable source instead of a lossy screenshot.
- Ordinary project and editor startup avoid the renderer cost.
- Compilation cannot read server files or execute inside a trusted Worker.
- Sanitization and CSP remain independent defenses against generated SVG.

**Negative:**

- The optional TikZ runtime, fonts, and package files add several megabytes of
  pinned static assets and GPL-3.0 distribution obligations.
- Browser CPU and memory vary, so complex diagrams require strict limits and
  may fail where native TeX succeeds.
- Package compatibility is intentionally narrower than a complete TeX Live
  installation.

**Neutral:**

- TikZ source is canonical only inside explicit code blocks; generated SVG is
  derived in the same sense as rendered Markdown HTML.
- PGFPlots support begins as a tested compatibility tier rather than a promise
  to support every library and externalization workflow.

## Alternatives Considered

### Use a full browser LaTeX engine

SwiftLaTeX offers broader PdfTeX and XeTeX compatibility, but embeds a much
larger document compiler than the figure-only workflow requires and produces
PDF rather than Kirjolab's preferred sanitized preview SVG.

### Convert TikZ to another drawing language

CeTZ and browser-native chart libraries are useful for newly authored figures,
but automated translation would lose package-specific behavior and would make
the import dependent on an immature second conversion.

### Require pre-rendered SVG or PDF

This is the safe fallback for unsupported diagrams, but selecting it as the
only workflow would discard editable source and make Overleaf migration more
manual than necessary.
