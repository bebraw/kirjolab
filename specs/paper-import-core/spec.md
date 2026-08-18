# Feature: Reusable Paper-Import Core

## Blueprint

### Context

Kirjolab must expose its bounded paper-ingestion mechanics to independent
consumers without exporting Kirjolab project, browser, persistence, or cloud
authorities. The first target is a reviewed Slideotter adapter that treats
LaTeX as semantic structure and PDF as page and visual authority.

### Architecture

- `src/lib/paper-import/index.ts` exposes versioned, source-local contracts for LaTeX
  conversion, exact provenance, native PDF page-text extraction, and reusable
  conformance cases.
- The neutral LaTeX result identifies the selected root and bibliography,
  document metadata and abstracts, hierarchical sections, citations and
  bibliography entries, labels and references, equations, tables, code blocks,
  footnotes, figures, diagnostics, source fingerprints, and converter/schema
  versions.
- Kirjolab adapts that result into `ProjectTemplateSeed`, its default
  publication profile, project assets, and conversion preview. Those product
  concepts do not enter the neutral result contract.
- A `PaperSourceRange` contains an archive path, start and end offsets, and the
  unit `utf16-code-unit`. It always addresses the original decoded file, before
  body slicing, comment removal, or conversion rewrites.
- Figure provenance retains the original archive asset path, resolved consumer
  asset path, content hash, caption, label, every source reference range, and
  resolution diagnostics. Asset bytes remain separate from generated output.
- Preview identity is a canonical SHA-256 digest over schema version, archive
  SHA-256, effective root, effective bibliography, converter version, explicit
  conversion options, and a deterministic extracted-file manifest SHA-256.
- Confirmation repeats archive inspection and conversion, verifies archive and
  preview identities, and returns a conflict before any persistent write when
  either differs.
- The native PDF seam accepts `Uint8Array` through a runtime-injected document
  adapter and returns a versioned SHA-256-qualified list of bounded page text,
  warnings, and diagnostics. PDF.js loading, URLs, canvases, OCR, browser
  automation, storage, and jobs stay in product adapters.
- The conformance corpus uses deterministic synthetic inputs and independent
  literal expectations. It is runnable without importing Kirjolab API, UI,
  Durable Object, storage, or deployment modules.
- The core remains source-local under ADR-223. Package publication requires a
  maintained external adapter and every ADR-186 release gate.

### API Contracts

- `inspectLatexArchive(bytes, limits)` validates and inspects a bounded ZIP
  without compiling or executing TeX.
- `convertLatexProject(inspection, selection, options)` returns the versioned
  neutral conversion result; the Kirjolab adapter is a separate operation.
- `createPdfTextExtractor(runtime)` keeps PDF.js loading in the consumer adapter
  and returns `extractPdfText(bytes, limits)`. Extraction validates input size
  and the `%PDF-` signature before the runtime receives a cloned byte array.
- Text and manifest ordering is locale-independent and deterministic.
- Stable failures and diagnostics use typed codes; human-readable messages are
  explanatory rather than program authority.
- PDF adapter lifecycle failures use `pdf-runtime`; only PDF.js password and
  known input-format failures are classified as encrypted or malformed input.

### Bounds

- LaTeX archive and conversion ceilings cannot exceed the Kirjolab trust-boundary
  maxima documented in the LaTeX import spec.
- Archive inspection retains at most 10,000 include, bibliography, and
  diagnostic structural records. Neutral conversion retains at most 50,000
  semantic and rendering records; consumer options may only tighten that
  ceiling, and malformed option values fail with a typed code.
- Archive paths are limited to 1,024 UTF-16 code units and 64 segments. Figure
  resolution accepts at most 1,024 code units per authored path, retains at
  most 256 search folders and 65,536 aggregate search-folder code units, and
  performs at most 100,000 candidate probes per conversion.
- A citation command contains at most 1,000 keys, which also count against the
  aggregate semantic-record budget. Rendered output is capped at 4,194,304
  UTF-16 code units per file and 16,777,216 per project. Derived output folders
  are capped at 10,000 entries and 1,048,576 aggregate path code units.
- Table conversion accepts at most 1,000 rows and 256 columns and emits at most
  1,048,576 UTF-16 code units per table. TikZ preservation accepts at most 32
  blocks of 131,072 bytes each.
- PDF input is at most 25 MiB and page extraction is at most 200 pages.
- PDF text is hard-capped at 100,000 UTF-16 code units per page and 20,000,000
  per document; consumer-provided limits can only tighten those ceilings.
- Source ranges, diagnostics, semantic inventories, and conformance expectations
  contain no unbounded archive excerpts.
- Archive-path, image-resolution, rendering, and semantic-limit failures use
  the stable `archive-path`, `image-resolution-limit`, `render-limit`, and
  `semantic-record-limit` codes.
- The byte and returned-text ceilings do not replace process isolation,
  execution-time, or memory limits in the consumer-owned PDF.js adapter. PDF.js
  may perform parser and decompression work before bounded text reaches the
  neutral seam.

### Anti-Patterns

- Do not execute TeX, shell escape, package hooks, includes outside the archive,
  or network retrieval.
- Do not return offsets into normalized, body-sliced, comment-stripped, or
  otherwise transformed source.
- Do not put `ProjectTemplateSeed`, publication profiles, browser globals,
  Durable Objects, R2, queues, OCR, or LLM policy in the neutral core.
- Do not treat LaTeX and PDF as unrelated papers or let PDF extraction replace
  LaTeX semantic authority.
- Do not publish a package merely because a prospective consumer exists.

## Contract

### Definition of Done

- [x] Archive and exact-preview SHA-256 identities are exposed separately and
      verified before confirmation writes.
- [x] The neutral LaTeX result is versioned and preserves the required paper
      semantics, fingerprints, diagnostics, and figure provenance.
- [x] Every retained range round-trips through the original decoded file with
      UTF-16 code-unit semantics, including Unicode and CRLF cases.
- [x] Kirjolab project adaptation is separate from neutral conversion.
- [x] A neutral byte-oriented PDF seam enforces signature, size, page, and text
      bounds and reports malformed, encrypted, truncated, sparse, and no-text
      outcomes through stable codes.
- [x] A versioned conformance corpus covers representative conversion,
      provenance, archive-security, and deterministic PDF extraction behavior.
- [x] Focused unit, coverage, Workers-runtime, and browser tests cover the public
      contracts and reviewed Kirjolab workflow.
- [x] The full native quality gate completes without a repository dependency-
      audit blocker.

### Regression Guardrails

- A changed archive, root, bibliography, option, converter version, identity
  schema, or extracted manifest invalidates confirmation and leaves persistent
  state untouched.
- `originalFileText.slice(range.start, range.end)` equals the retained source
  for every range-bearing neutral record.
- Comment masking preserves source length; CRLF and Unicode before a construct
  do not shift its range, including astral characters inside masked comment,
  literal-code, or TikZ environments.
- Comment and literal-code environments use outermost source-order precedence:
  comment-looking text inside a literal remains authored code, while
  literal-looking text inside an outer comment remains inert.
- Figure bytes and generated presentation or Markdown output never share an
  identity or overwrite one another.
- PDF extraction never invokes OCR, creates a canvas, fetches a URL, persists
  bytes, or sends content to a model.
- Conformance expectations never depend on locale ordering, current time,
  randomness, or Kirjolab application state.
- The package-ready `index.ts` remains a Fallow entry point so intentional
  public contracts are not confused with dead internal exports; internal
  modules do not retain unused compatibility re-exports.

### Scenarios

**Scenario: Confirm the exact reviewed LaTeX interpretation**

- Given: a researcher previews one root and bibliography from a bounded archive
- When: confirmation repeats with identical bytes, selection, versions, options,
  and manifest
- Then: both identities match and Kirjolab may adapt and persist the conversion

**Scenario: Reject a changed selection without mutation**

- Given: an archive has two valid roots or bibliographies
- When: confirmation submits a different valid selection with the prior preview
  digest
- Then: the Worker returns a conflict before any project, asset, access, room,
  or catalog write

**Scenario: Verify source provenance after Unicode**

- Given: a decoded source contains CRLF text and non-BMP characters before a
  citation or figure
- When: neutral conversion retains its source range
- Then: slicing the original JavaScript string with that range recovers the
  exact authored construct

**Scenario: Extract native PDF text locally**

- Given: a bounded deterministic PDF contains native text on numbered pages
- When: a consumer runs the injected byte-oriented extractor
- Then: the result contains the PDF SHA-256, page count, normalized bounded text,
  stable warnings, and no browser, OCR, storage, or network side effect
