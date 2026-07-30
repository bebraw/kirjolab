# Feature: PDF Evidence Capture

## Blueprint

### Context

Researchers must be able to turn a quotation in an immutable paper into a
durable scholarly resource without manually transcribing its page and context.
The annotation must reopen against the artifact and connect in both directions
with an authored passage.

### Architecture

- `src/client/pdf/pdf-viewer.ts` owns single-page PDF.js canvas and text-layer
  rendering, page navigation, stored highlights, browser selection capture,
  and resolution of its bounded shell elements. The workspace coordinator
  supplies typed selection, highlight, and page-change hooks.
- A viewer-local XState actor coordinates closed, runtime-loading,
  document-loading, page-rendering, ready, and failed phases. Its document and
  render request generations invalidate late work when another PDF, page, zoom,
  or resize supersedes it. PDF.js documents/tasks, rendered DOM, gestures,
  annotations, and selection state remain outside the actor.
- `src/client/pdf/pdf-selection.ts` normalizes selection geometry and derives quote
  context independently of the viewer runtime. Fragmented browser client
  rectangles are clipped and coalesced into continuous visual-line rectangles
  before the project bound is applied.
- `AnnotationResource.fragments` retains ordered, independently identified
  highlight strokes. Each stroke stores at most 64 normalized top-left page
  rectangles plus exact quote, prefix, suffix, and creation time. The resource
  projects combined quote and rectangle summaries for existing consumers.
- `PdfResource.fingerprint` records the immutable R2 artifact ETag identity.
- `DocumentRoom` adds selector fields without rewriting PDF objects in R2.
- The PDF viewer is hosted inside the right research-context pane. Its
  annotation draft is locked to the visible PDF while authoring remains
  available beside it.
- Narrow Context mode hides both authoring and the project rail. Tablet
  landscape Split keeps authoring and Context side by side without the project
  rail; the three-pane shell is reserved for viewports wide enough to preserve
  useful editor and PDF widths. PDF search and document navigation overlay the
  reader without adding grid rows or shrinking the rendered page.
- A bounded project annotation form owns the complete composer shell,
  publication-intake composition, visibility, visible-PDF choices, captured
  page and quotation context, the optional note, selection status, citation
  availability, highlight-tool and undo presentation, and typed tool, undo,
  citation, save, and link intents through one workflow binding. It projects its
  nested publication-intake owner and owns refresh-pending acceptance. Its
  context-resource presenter supplies intake API configuration, canonical
  publication lookup, navigation, and notification routes while the workspace
  coordinator supplies only resource refresh. It derives paint-
  versus-erase tool guidance and selection feedback from its local tool and the
  canonical capture, classifies saved strokes that geometrically overlap that
  capture on the active PDF page, routes their ordered removal through its typed
  workflow binding, owns paint-versus-erase capture persistence and no-match
  and completed-erasure status, and returns capture and note-save completion
  effects through one contract. Its context-resource presenter applies tool and
  draft-clearing effects through the bounded viewer, routes citation and
  evidence-panel intents across composed Lit owners, and delegates only refresh,
  notification, and optional manuscript-link effects to the workspace
  coordinator. The form derives
  citation availability from the active PDF and canonical publication-PDF
  links. It commits toolbar tool state locally, resolves viewer-highlight
  activation to edit/reveal or erase behavior, and clears its own undo state
  after a completed delegated mutation. The workspace coordinator
  retains annotation identity, deletion-driven composer cleanup, manuscript
  selection, refreshes, and user notifications.
- `POST /api/workspaces/{id}/annotation-links` validates an annotation and
  current manuscript selection before atomically inserting both the annotation
  and its passage link.
- PDF selection auto-saves a new stroke. A geometric overlap on the same page
  appends to the existing annotation. Stroke deletion powers both one-step undo
  and the eraser; annotation deletion is explicit and blocked by claim usage.
- The generated PDF.js worker is served from `/pdf.worker.js` and stays version
  matched with the display-layer dependency.
- The lazy PDF.js display runtime uses a content-fingerprinted immutable URL
  compiled into the matching application build.

### Anti-Patterns

- Do not write highlights into imported PDF bytes.
- Do not store canvas or CSS pixels as durable geometry.
- Do not render every page of a long document concurrently.
- Do not silently relocate a selector when text recovery is ambiguous.
- Do not treat OCR, edition reconciliation, or PDF editing as implemented.

## Contract

### Definition of Done

- [x] An imported valid PDF renders inside Kirjolab with selectable text.
- [x] Page navigation renders one page at a time. While the PDF is visible,
      unmodified Left and Right Arrow keys move to the previous and next page;
      editable and interactive controls retain their arrow-key behavior.
- [x] A selection captures page, quote, prefix, suffix, and normalized geometry.
- [x] Releasing a PDF selection immediately saves an external annotation stroke.
- [x] Painting over a highlight extends one resource; undo and eraser remove
      identified strokes without changing PDF bytes.
- [x] A highlight note can be edited and an unused highlight can be deleted.
- [x] Saving and linking a capture creates its annotation and manuscript link
      atomically or creates neither.
- [x] The PDF and evidence composer remain visible beside manuscript authoring
      without a modal covering the editor.
- [x] Tablet layouts preserve a useful PDF reading width and opening PDF search
      or navigation does not resize the page.
- [x] Reopening an annotation restores its page and visible highlight.
- [x] An annotation can select its linked manuscript passage.
- [x] Existing manual annotations without geometry remain readable.
- [x] Browser tests exercise selection, persistence, highlight restoration, and
      bidirectional navigation with a deterministic valid PDF.

### Regression Guardrails

- Geometry values must be finite, positive in size, and remain within page
  bounds after normalization.
- Adjacent or duplicate browser rectangles on one visual line must coalesce;
  separated columns and distinct lines must remain separate.
- A selection may contain at most 64 geometry fragments.
- PDF.js display and worker assets must come from the same pinned package.
- PDF.js display and worker assets must use the package's compatibility builds
  so PDF reading does not depend on newer browser APIs such as
  `Promise.withResolvers` being native.
- Text extraction must consume PDF.js streams through `getReader()` instead of
  requiring `ReadableStream` async iteration, which Safari does not provide.
- The viewer must render only the active page.
- Missing required canvas, layer, status, or page-control elements must fail
  viewer construction instead of leaving a partially bound reader.
- A superseded document or render request must never replace the active canvas,
  text layer, page indicators, or viewer status.
- Selecting Context on a narrow viewport must not leave the project rail above
  the PDF, and PDF auxiliary panels must not participate in reader grid sizing.
- Stored highlights must never mutate the imported R2 object.
- The embedded annotation composer must always target the currently visible
  PDF; it must not expose an independent editable artifact selector.
- The embedded annotation composer must retain its active annotation identity,
  selected paint or erase tool, and last undoable stroke and emit complete save
  or undo intents to the application coordinator.
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

**Scenario: Researcher reads a PDF on iPad**

- Given: a workspace PDF is active at tablet portrait or landscape width
- When: the researcher switches to Context or opens document navigation
- Then: the PDF keeps the full height and a useful reading width while the
  project rail or navigation panel yields through the responsive hierarchy
