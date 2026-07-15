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
- `AnnotationResource.fragments` retains ordered, independently identified
  highlight strokes. Each stroke stores at most 64 normalized top-left page
  rectangles plus exact quote, prefix, suffix, and creation time. The resource
  projects combined quote and rectangle summaries for existing consumers.
- `PdfResource.fingerprint` records the immutable R2 artifact ETag identity.
- `DocumentRoom` adds selector fields without rewriting PDF objects in R2.
- The PDF viewer is hosted inside the right research-context pane. Its
  annotation draft is locked to the visible PDF while authoring remains
  available beside it.
- `POST /api/workspaces/{id}/annotation-links` validates an annotation and
  current manuscript selection before atomically inserting both the annotation
  and its passage link.
- PDF selection auto-saves a new stroke. A geometric overlap on the same page
  appends to the existing annotation. Stroke deletion powers both one-step undo
  and the eraser; annotation deletion is explicit and blocked by claim usage.
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
- [x] Releasing a PDF selection immediately saves an external annotation stroke.
- [x] Painting over a highlight extends one resource; undo and eraser remove
      identified strokes without changing PDF bytes.
- [x] A highlight note can be edited and an unused highlight can be deleted.
- [x] Saving and linking a capture creates its annotation and manuscript link
      atomically or creates neither.
- [x] The PDF and evidence composer remain visible beside manuscript authoring
      without a modal covering the editor.
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
- PDF.js display and worker assets must use the package's compatibility builds
  so PDF reading does not depend on newer browser APIs such as
  `Promise.withResolvers` being native.
- The viewer must render only the active page.
- Stored highlights must never mutate the imported R2 object.
- The embedded annotation composer must always target the currently visible
  PDF; it must not expose an independent editable artifact selector.
- A stale manuscript revision or range must reject atomic annotation/link
  creation before either row is persisted.

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

**Scenario: Visible evidence connects to selected prose**

- Given: manuscript prose is selected while a PDF is visible in research
  context
- When: the researcher saves and links a captured PDF selection
- Then: Kirjolab commits the annotation and passage link together, or rejects
  both when the manuscript selection has become stale
