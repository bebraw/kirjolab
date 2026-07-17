# ADR-142: Preserve TikZ Until Isolated Rendering

**Status:** Implemented

**Date:** 2026-07-17

## Context

Some imported scholarly papers contain TikZ or PGFPlots figures whose source is
valuable and cannot be represented faithfully as ordinary Markdown. Browser
renderers exist, but their engines, fonts, and package files would materially
increase the client payload. Running arbitrary authored TeX inside the trusted
Worker is not an acceptable substitute.

## Decision

Preserve imported TikZ and PGFPlots environments as canonical fenced `tikz`
code blocks. The initial import workflow does not render them.

Each preserved block receives a source-qualified informational diagnostic so a
researcher can distinguish retained source from a rendered figure. Import
bounds blocks to 128 KiB each and 32 per project. Exceeding either limit blocks
confirmation rather than truncating source.

Rendering may be added only behind a separately approved isolated server
boundary with no shell escape, network, or access to application storage; fixed
resource and time limits; pinned packages; and inert-SVG validation before any
output is shown or stored. Generated SVG would be derived data keyed by the
renderer version and exact source digest, never an implicit replacement for the
canonical TikZ source.

## Trigger

The LaTeX import design raised the need to retain figures from older papers.
The project owner chose to keep the normal browser client light and prefer a
server-side boundary for future rendering.

## Consequences

**Positive:**

- Imported TikZ remains editable and portable without increasing client weight.
- No uploaded TeX executes in a trusted Worker or browser context.
- Renderer selection and licensing remain an explicit later decision.

**Negative:**

- TikZ and PGFPlots have no visual preview in the initial importer.
- Researchers must render elsewhere when the diagram itself is needed during
  migration review.

**Neutral:**

- Fenced TikZ is canonical authored source; any future SVG is derived output.
- A representative archive is still required before claiming a rendering
  compatibility tier.

## Implementation

The server converter recognizes bounded `tikzpicture` environments before any
comment or command adaptation, retains their exact source in fenced `tikz`
blocks, and emits an informational `tikz-preserved` diagnostic. It performs no
rendering or TeX execution.

## Alternatives Considered

### Bundle TikZJax in the browser

TikZJax can compile a useful TikZ subset to SVG, but its runtime and support
files add several megabytes and GPL-3.0 distribution obligations to an
occasional workflow.

### Run TeX directly in the Worker

This conflicts with the execution boundary, resource limits, and application
storage isolation required for untrusted authored TeX.

### Discard TikZ or require images

That keeps import simple but loses the most valuable source representation and
makes migration unnecessarily manual.
