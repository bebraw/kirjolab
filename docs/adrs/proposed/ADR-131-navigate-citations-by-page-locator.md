# ADR-131: Navigate Citations by Page Locator

**Status:** Proposed

**Date:** 2026-07-16

## Context

Kirjolab stores exact PDF highlight geometry and can link an annotation to a
durable manuscript passage, but an ordinary citation identifies only a
publication and an optional human-readable locator. A citation therefore opens
publication context even when exactly one local PDF represents the cited work.

Binding each citation occurrence to a highlight UUID would distinguish
same-page and cross-page highlights exactly, but it would also add project-only
identity to portable Markdown and exceed ordinary research practice. Researchers
normally verify a quotation by opening the cited work at its page or page range.

## Decision

Keep citation provenance at publication-and-locator granularity. A citation
created while reading a project PDF will write ordinary canonical Markdown with
the current PDF page as a `locator`, such as `p. 270`. Cross-page locators remain
ordinary `pp. 270–271` authoring syntax and do not require highlight identities.

Rendered citation controls will retain the locator as inert typed data. When a
cited publication has exactly one explicitly linked project PDF and the locator
begins with a supported numeric page or page range, activating the citation
opens that PDF at the first page. With zero or several linked PDFs, or a locator
that cannot identify a PDF page, activation opens publication context and lets
the researcher inspect or choose an artifact explicitly.

Page navigation initially uses the PDF viewer's one-based page number. Printed
page-label mapping may later distinguish a human citation label from its PDF
page index without changing citation syntax.

Highlights remain separate annotation resources. Their UUIDs, quotations,
notes, and normalized geometry continue to support evidence, claims, and exact
annotation navigation, but ordinary citations do not depend on them.

## Consequences

**Positive:**

- Citations remain portable and conventional.
- Citation creation from a PDF records useful location provenance without a
  new schema, migration, or project-only Markdown attribute.
- Citation activation reaches the relevant source page in the unambiguous
  local-artifact case.
- Several highlights on one page and highlights spanning pages do not require
  new citation identities.

**Negative:**

- A citation does not identify which of several same-page highlights motivated
  it.
- PDF page numbers may differ from printed page labels until explicit label
  mapping exists.
- A researcher must choose among several linked artifacts rather than Kirjolab
  guessing which version is canonical.

**Neutral:**

- Exact annotation-to-passage and annotation-to-claim links remain available
  when stronger evidence provenance is required.
- Citation activation remains navigation only and creates no implicit scholarly
  relationships.

## Alternatives Considered

### Store a highlight UUID in citation Markdown

This gives an exact round trip but exposes internal project identity in portable
source, complicates grouped citations and copied Markdown, and exceeds the
page-level provenance researchers normally expect from a citation.

### Persist citation-occurrence sidecar resources

A durable occurrence-to-highlight graph preserves portable Markdown, but adds
schema, synchronization, stale-anchor, export, and privacy behavior that is not
needed for page-level source verification.

### Infer the relevant highlight when opening a citation

Choosing a same-page highlight by proximity, quotation similarity, or recency
would present a heuristic as provenance and could silently open the wrong
evidence.
