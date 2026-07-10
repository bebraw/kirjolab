# Feature: PDF Evidence Capture

## Blueprint

### Context

Researchers must be able to turn a quotation in an immutable paper into a
durable scholarly resource without manually transcribing its page and context.
The annotation must reopen against the artifact and connect in both directions
with an authored passage.

### Architecture

- `src/client/pdf-viewer.ts` owns single-page PDF.js canvas and text-layer
  rendering, page navigation, stored highlights, and browser selection capture.
- `src/client/pdf-selection.ts` normalizes selection geometry and derives quote
  context independently of the viewer runtime.
- `AnnotationResource.rects` stores at most 64 normalized top-left page
  rectangles. Exact quote, prefix, suffix, and page remain required selectors.
- `PdfResource.fingerprint` records the immutable R2 artifact ETag identity.
- `DocumentRoom` adds selector fields without rewriting PDF objects in R2.
- The generated PDF.js worker is served from `/pdf.worker.js` and stays version
  matched with the display-layer dependency.

### Anti-Patterns

- Do not write highlights into imported PDF bytes.
- Do not store canvas or CSS pixels as durable geometry.
- Do not render every page of a long document concurrently.
- Do not silently relocate a selector when text recovery is ambiguous.
- Do not treat OCR, edition reconciliation, or PDF editing as implemented.

## Contract

### Definition of Done

- [x] An imported valid PDF renders inside Kirjolab with selectable text.
- [x] Page navigation renders one page at a time.
- [x] A selection captures page, quote, prefix, suffix, and normalized geometry.
- [x] Saving the capture creates an external annotation resource.
- [x] Reopening an annotation restores its page and visible highlight.
- [x] An annotation can select its linked manuscript passage.
- [x] Existing manual annotations without geometry remain readable.
- [x] Browser tests exercise selection, persistence, highlight restoration, and
      bidirectional navigation with a deterministic valid PDF.

### Regression Guardrails

- Geometry values must be finite, positive in size, and remain within page
  bounds after normalization.
- A selection may contain at most 64 geometry fragments.
- PDF.js display and worker assets must come from the same pinned package.
- The viewer must render only the active page.
- Stored highlights must never mutate the imported R2 object.

### Scenarios

**Scenario: PDF evidence becomes an annotation**

- Given: a researcher opens an imported paper
- When: they select text on a rendered page and save a note
- Then: Kirjolab stores the page, exact quotation, context, normalized geometry,
  artifact identity, and commentary as a separate resource

**Scenario: Researcher follows evidence in both directions**

- Given: an annotation is linked to a manuscript passage
- When: the researcher opens the evidence or the linked passage
- Then: Kirjolab restores the PDF page and highlight or selects the exact
  current manuscript range respectively
