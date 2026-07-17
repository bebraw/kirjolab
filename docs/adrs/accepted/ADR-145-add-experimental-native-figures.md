# ADR-145: Add Experimental Native Figures

**Status:** Accepted

**Date:** 2026-07-17

## Context

Kirjolab manuscripts sometimes need small data graphics whose source should stay
portable and editable beside the prose. Imported papers may express these figures
with TikZ or PGFPlots, but full TeX compatibility would require a large runtime or
an isolated compilation service. That cost is disproportionate for an occasional
migration convenience.

The existing Markdown parser already supports directives and the preview already
derives sanitized HTML locally. A deliberately small native vocabulary can cover
common figures without introducing another execution engine.

## Decision

Add a versioned, experimental native-figure directive to canonical Markdown. The
first supported kind is a horizontal boxplot:

```md
:::figure{#fcp-summary kind="boxplot" version=1 x-label="Time (ms)" y-label="Variant"}
::box[SSR — FCP]{min=1613 q1=1627 median=1628 q3=1632 max=1641}
::box[Islands — FCP]{min=838 q1=838 median=838 q3=846 max=858}
::caption[First Contentful Paint across five benchmark runs.]
:::
```

Parse the directive into a bounded typed domain model, report source-positioned
diagnostics for invalid input, and render valid figures as deterministic inline
SVG through the existing sanitized preview pipeline. Authored values may affect
text and geometry only; they cannot supply elements, attributes, styles, URLs, or
scripts.

The LaTeX importer may translate a narrowly recognized PGFPlots prepared-boxplot
subset to this syntax. It must preserve unsupported TikZ verbatim under ADR-142
rather than approximating it.

Do not claim TikZ compatibility. New figure kinds or syntax changes require an
explicit versioned extension to the feature contract.

## Trigger

The Edge-Powered Islands sample confirmed that older manuscripts contain reusable
PGFPlots boxplot data. The project owner preferred a lightweight experimental
native syntax over a full TikZ renderer.

## Consequences

**Positive:**

- Figure source remains readable, portable, diffable Markdown.
- Preview rendering adds no client or server dependency and executes no authored
  code.
- The feature can expand one useful figure kind at a time.

**Negative:**

- Native figures cover only an intentionally small vocabulary.
- Imported TikZ outside the recognized subset still has no visual preview.
- Authors must adapt unsupported figures manually or retain their TikZ source.

**Neutral:**

- SVG is derived preview output, not a stored project asset or second authority.
- The syntax is experimental, but versioning prevents silent reinterpretation.

## Alternatives Considered

### Implement broad TikZ compatibility

This would recreate a large language and package ecosystem while still producing
partial compatibility. It is unnecessary for the convenience goal.

### Compile TikZ in an isolated server renderer

This remains valid for future exact rendering, but introduces deployment,
licensing, resource-control, and inert-SVG validation work that the first native
figure does not need.

### Add a browser renderer

This would increase the normal client payload for a one-off migration and move
TeX processing onto every authoring device.
