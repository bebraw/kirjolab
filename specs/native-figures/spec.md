# Native Figures Specification

## Purpose

Let authors keep a small set of editable scientific graphics in canonical
Markdown and preview them without executing authored code or loading a figure
runtime.

## Scope

The first experimental vocabulary supports version 1 horizontal boxplots only.
It does not promise TikZ, PGFPlots, plotting-library, or general SVG
compatibility.

## Authoring Contract

- A figure is a `figure` container directive with `kind="boxplot"` and
  `version=1`.
- `x-label` and `y-label` are optional plain-text axis labels.
- A boxplot contains between 1 and 32 `box` leaf directives and exactly one
  `caption` leaf directive.
- Each box has a non-empty plain-text label and finite numeric `min`, `q1`,
  `median`, `q3`, and `max` attributes.
- Values satisfy `min <= q1 <= median <= q3 <= max`.
- Optional figure ids follow the existing Markdown identifier vocabulary.
- Figure ids, labels, captions, numeric magnitudes, and total source size are
  bounded. Invalid or unsupported figures remain visible as source-like text and
  produce source-positioned diagnostics; the renderer never guesses.
- Directives other than `box` and `caption`, nested containers, and authored SVG
  are not part of version 1.

## Rendering Contract

- Parsing produces a typed versioned figure model before rendering.
- Valid boxplots render to deterministic inline SVG using one shared scale across
  their five-number summaries.
- The SVG exposes a title and visible caption and remains understandable without
  color.
- Authored data can become escaped text or finite geometry only. It cannot set
  element names, arbitrary attributes, class names, styles, links, or URLs.
- Preview sanitization runs after figure rendering and admits only the fixed SVG
  vocabulary required by the native renderer.
- Rendered SVG is derived preview state. It is not written to project files,
  object storage, exports, or caches.

## Import Contract

- The LaTeX importer may translate only a bounded PGFPlots
  `boxplot prepared` environment when all required summaries and labels are
  recognized unambiguously.
- A successful translation emits native version 1 syntax and an informational
  diagnostic.
- Any ambiguity or unsupported TikZ feature follows ADR-142: preserve the exact
  TikZ source in a fenced block and report that it was retained.
- Import never executes TeX and never approximates unsupported visual semantics.

## Regression Guardrails

- Projects without native figures receive no additional runtime or network work.
- The renderer is pure and deterministic for a given typed figure.
- Invalid numeric input cannot produce non-finite SVG attributes.
- A malformed figure cannot weaken the existing HTML sanitizer.
- Existing citations, references, comments, includes, and fenced TikZ behavior
  remain unchanged.

## Verification

- Unit tests cover model validation, bounds, ordering, equal domains, deterministic
  geometry, escaping, and diagnostic ranges.
- Markdown tests cover directive parsing, sanitized accessible SVG, fallback, and
  interaction with existing semantic directives.
- Import tests cover recognized PGFPlots translation and lossless fallback for an
  unsupported TikZ block.
