# Feature: Reusable Paper-Import Core

## Blueprint

### Context

Kirjolab must expose its bounded paper-ingestion mechanics to independent
consumers without exporting Kirjolab project, browser, persistence, or cloud
authorities. The first target is a reviewed Slideotter adapter that treats
LaTeX as semantic structure and PDF as page and visual authority.

### Architecture

- `src/lib/paper-import/index.ts` exposes versioned, product-neutral contracts for
  LaTeX conversion, exact provenance, canonical preview identity, and native PDF
  page-text extraction. Reusable fixtures remain behind the separate
  `./conformance` entry rather than the main production entry.
- The neutral LaTeX result identifies the selected root and bibliography,
  document metadata and abstracts, hierarchical sections, citations and
  bibliography entries, labels and references, equations, tables, code blocks,
  footnotes, ordinary paragraph and list-item prose blocks, figures,
  diagnostics, source fingerprints, rendered format, and converter/schema
  versions.
- Kirjolab adapts that result into `ProjectTemplateSeed`, its default
  publication profile, project assets, and conversion preview. Those product
  concepts do not enter the neutral result contract.
- A `PaperSourceRange` contains an archive path, start and end offsets, and the
  unit `utf16-code-unit`. It always addresses the original decoded file, before
  body slicing, comment removal, or conversion rewrites.
- Each retained prose block has a deterministic id, `paragraph` or `list-item`
  kind, active section id when known, normalized retrieval text, exact authored
  source, and an original-file range. Inclusion traversal carries the active
  section into included files where possible. If exact provenance cannot be
  established, conversion omits the block and emits a typed diagnostic rather
  than returning transformed offsets. Includes are classified against the
  complete source file's prose-excluded environment ranges before prose
  traversal, so a child included inside an excluded environment contributes no
  paragraph or list-item prose and cannot split the parent list envelope.
  List-item retrieval text excludes nested figure, table, code, and math
  environments plus `\\bibliography`, `\\addbibresource`, and
  `\\bibliographystyle` commands while its exact source and range retain the
  whole authored item and each excluded construct remains available through its
  dedicated inventory. Nested `itemize` and `enumerate` structures retain every
  visible item in both the inventory and the rendered Scholarmark projection.
  Section commands and section-bearing includes are classified against the
  complete source's prose-excluded environments, recognized lists, and authored
  command arguments before section inventory or prose traversal. Hidden or
  contained structure cannot consume section ids, mutate hierarchy, split a
  list envelope, or fragment an enclosing command's parent prose. Section
  commands inside outer or nested lists are omitted from normalized item text
  while the complete item source/range remains exact. Includes inside lists or
  another command's required or optional argument are not traversed for neutral
  prose or sections, and their command ranges are masked before paragraph
  splitting. Each unsupported list or command containment produces an exact-
  range `prose-provenance-unavailable` warning. A later ordinary include of the
  same child remains eligible for traversal, while dedicated inventories such
  as footnotes retain their complete authored values and ranges.
- Figure provenance retains the original archive asset path, resolved consumer
  asset path, content hash, caption, label, every source reference range, and
  resolution diagnostics. Asset bytes remain separate from generated output.
- `LatexConvertedFile` explicitly identifies its content as
  `scholarmark-v1`. Rendered files are a versioned Kirjolab-oriented projection,
  not neutral Markdown that another product may interpret without an adapter;
  semantic inventories and prose blocks remain the neutral interpretation.
- `LatexPreviewIdentityV1` is exported from the neutral boundary together with
  `createLatexPreviewIdentity` and `digestLatexPreviewIdentity`. Its canonical
  SHA-256 covers the identity schema, archive SHA-256, effective root and
  bibliography, converter version, effective conversion options, deterministic
  archive-manifest SHA-256, and deterministic conversion-manifest SHA-256.
- The conversion manifest represents the complete reviewed neutral
  interpretation: conversion schema and converter versions, diagnostics,
  semantic inventories including prose, source fingerprints, figure
  provenance, hashed bibliography and rendered files, and asset byte counts,
  media types, and SHA-256 hashes. Raw binary assets never enter canonical JSON.
- Confirmation repeats archive inspection and conversion, verifies archive and
  preview identities, and returns a conflict before any persistent write when
  either differs.
- The native PDF seam accepts `Uint8Array` through a runtime-injected document
  adapter and returns a versioned SHA-256-qualified list of bounded page text,
  warnings, and diagnostics. PDF.js loading, URLs, canvases, OCR, browser
  automation, storage, and jobs stay in product adapters.
- The conformance corpus uses deterministic synthetic inputs and independent
  literal expectations, including preview-identity and conversion-manifest
  digest vectors, complete resolved-figure provenance, and every retained prose
  and figure source range. It is runnable without importing Kirjolab API, UI,
  Durable Object, storage, or deployment modules.
- A private ESM `0.x` package candidate may assemble this neutral source for the
  maintained Slideotter adapter. It exposes `.` and `./conformance` separately,
  emits JavaScript and TypeScript declarations, supports the documented Node 24
  runtime, keeps `fflate` as its only mandatory parser dependency, and leaves
  PDF.js runtime-injected. The candidate is a reviewed private tarball, not
  permission for registry publication.
- Each candidate has an append-only JSON release manifest outside the tarball
  that pins package name and version, filename, byte count, exact Node.js and
  npm versions, and SHA-256. The canonical pack command resolves the Node and
  npm executables that launched its npm lifecycle, rejects any toolchain drift,
  and compares the resulting bytes to that manifest without rewriting it.
  Reviewed binaries are handed to maintained consumers through a namespaced
  immutable GitHub Release whose locked asset digest matches the checked
  manifest; this transport does not authorize npm registry publication.

### API Contracts

- `inspectLatexArchive(bytes, limits)` validates and inspects a bounded ZIP
  without compiling or executing TeX.
- `convertLatexProject(inspection, selection, options)` returns the versioned
  neutral conversion result; the Kirjolab adapter is a separate operation.
- `createLatexPreviewIdentity({ archive, files, conversion })` derives the
  normalized effective options and canonical archive and conversion manifest
  fingerprints from the exact neutral conversion.
  `digestLatexPreviewIdentity(identity)` returns the stable reviewed-preview
  SHA-256.
- `createPdfTextExtractor(runtime)` keeps PDF.js loading in the consumer adapter
  and returns `extractPdfText(bytes, limits)`. Extraction validates input size
  and the `%PDF-` signature before the runtime receives a cloned byte array.
- Text and manifest ordering is locale-independent and deterministic.
- A tooling guard fingerprints conversion- and reviewed-identity-affecting
  source and requires a new `latexConverterVersion` registration when that
  source changes; the conversion manifest independently binds the actual
  neutral output.
- Stable failures and diagnostics use typed codes; human-readable messages are
  explanatory rather than program authority.
- Package `0.x` minor releases may change incompatible contracts with migration
  notes; supported APIs are not removed without prior deprecation in the
  changelog. README, license, security-reporting, runtime, and compatibility
  documentation ship with the private candidate.
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
- Standard lists nest at most 1,024 environments so rendering and provenance
  traversal fail through a typed limit before exhausting the runtime stack.
- Table conversion accepts at most 1,000 rows and 256 columns and emits at most
  1,048,576 UTF-16 code units per table. TikZ preservation accepts at most 32
  blocks of 131,072 bytes each.
- Repeated figure records retain at most 16,777,216 aggregate UTF-16 code units
  of reference, caption, label, and enclosing-figure provenance. The conversion
  manifest hashes those repeated strings before canonical serialization so one
  enclosing figure cannot amplify identity work quadratically.
- Prose blocks retain at most 33,554,432 aggregate UTF-16 code units across
  normalized text and exact source slices. The conversion manifest hashes each
  exact source slice before canonical serialization so overlapping nested-list
  ranges cannot amplify identity work quadratically.
- PDF input is at most 25 MiB and page extraction is at most 200 pages.
- PDF text is hard-capped at 100,000 UTF-16 code units per page and 20,000,000
  per document; consumer-provided limits can only tighten those ceilings.
- Source ranges, diagnostics, semantic inventories, and conformance expectations
  contain no unbounded archive excerpts.
- Archive-path, image-resolution, provenance, rendering, and semantic-limit
  failures use the stable `archive-path`, `image-resolution-limit`,
  `provenance-limit`, `render-limit`, and `semantic-record-limit` codes.
- The byte and returned-text ceilings do not replace process isolation,
  execution-time, or memory limits in the consumer-owned PDF.js adapter. PDF.js
  may perform parser and decompression work before bounded text reaches the
  neutral seam.

### Anti-Patterns

- Do not execute TeX, shell escape, package hooks, includes outside the archive,
  or network retrieval.
- Do not return offsets into normalized, body-sliced, comment-stripped, or
  otherwise transformed source.
- Do not present `scholarmark-v1` rendered files as product-neutral Markdown or
  make them the sole cross-product semantic authority.
- Do not put `ProjectTemplateSeed`, publication profiles, browser globals,
  Durable Objects, R2, queues, OCR, or LLM policy in the neutral core.
- Do not treat LaTeX and PDF as unrelated papers or let PDF extraction replace
  LaTeX semantic authority.
- Do not publish the private package candidate to a registry without the
  separate ADR, credentials, provenance, and release gates required by ADR-186.

## Contract

### Definition of Done

- [x] Archive and exact-preview SHA-256 identities are exposed separately; the
      preview identity includes both archive and conversion manifests and is
      verified before confirmation writes.
- [x] The neutral LaTeX result is versioned and preserves the required paper
      semantics, prose blocks, fingerprints, diagnostics, and figure provenance.
- [x] Every retained range round-trips through the original decoded file with
      UTF-16 code-unit semantics, including Unicode and CRLF cases.
- [x] Rendered files declare `scholarmark-v1`, while neutral semantic and prose
      inventories remain independently consumable.
- [x] Kirjolab project adaptation is separate from neutral conversion.
- [x] A neutral byte-oriented PDF seam enforces signature, size, page, and text
      bounds and reports malformed, encrypted, truncated, sparse, and no-text
      outcomes through stable codes.
- [x] A versioned conformance corpus covers representative conversion,
      provenance, preview identity, manifest hashing, archive security, and
      deterministic PDF extraction behavior.
- [x] An isolated Node 24 consumer can install the deterministic private `0.x`
      tarball and exercise archive inspection, neutral conversion, preview
      identity, prose round trips, and injected PDF extraction.
- [x] The superseded `0.1.1` record now states its actual provenance: the
      51,907-byte artifact with SHA-256
      `c5bc97627d511b5db8380d2412013cc0b25c02de80c1ddfd14950c0d26aa1f07`
      was packed with Node.js 26.7.0 and npm 11.19.0, not its previously claimed
      Node.js 24.15.0 and npm 11.12.1 toolchain.
- [x] The corrected `@kirjolab/paper-import@0.1.2` candidate is governed by a
      checked release manifest, reproduced as the 53,599-byte
      `kirjolab-paper-import-0.1.2.tgz` with Node.js 24.15.0 and npm 11.12.1,
      SHA-256
      `c1f6ce3a57214f770f0342c9d76ce73efffcacaa24a60690f931011819c77864`,
      and attached to the immutable [`paper-import-v0.1.2` GitHub Release](https://github.com/bebraw/kirjolab/releases/tag/paper-import-v0.1.2)
      without npm registry publication.
- [x] The structural-containment correction is distributed as
      `@kirjolab/paper-import@0.1.3` through a checked release manifest,
      reproduced as the 56,290-byte `kirjolab-paper-import-0.1.3.tgz` with
      Node.js 24.15.0 and npm 11.12.1, SHA-256
      `87ade7ecc1411bb1019c54b7f728f4b0c5382fd4dc5510eb411a2a503e56566a`,
      and attached to the immutable [`paper-import-v0.1.3` GitHub Release](https://github.com/bebraw/kirjolab/releases/tag/paper-import-v0.1.3)
      without npm registry publication.
- [x] Focused unit, coverage, Workers-runtime, and browser tests cover the public
      contracts and reviewed Kirjolab workflow.
- [x] The full native quality gate completes without a repository dependency-
      audit blocker.

### Regression Guardrails

- A changed archive, root, bibliography, option, converter version, identity
  schema, archive manifest, or neutral conversion manifest invalidates
  confirmation and leaves persistent state untouched.
- `originalFileText.slice(range.start, range.end)` equals the retained source
  for every range-bearing neutral record.
- Prose ids and ordering are locale-independent and deterministic; prose before
  the first section has a null section id, and reachable included files retain
  the active section relationship where it can be established exactly.
- Nested prose-excluded environments, excluded bibliography commands, and prose
  or item markers from files included inside excluded environments never enter
  normalized list-item text or create phantom prose blocks, while the list
  item's exact original source and UTF-16 range remain unchanged.
- Hidden section commands and includes cannot enter the section inventory,
  consume visible section ids, mutate the active hierarchy, or split prose.
  Includes inside outer or nested list items cannot expose raw `\\item` syntax
  as paragraph text: the child edge is omitted with an exact provenance warning
  and the parent item's normalized text, complete source, and range remain
  deterministic. Filtering occurs before visited-path bookkeeping so a later
  ordinary include can still contribute source-local prose and sections.
- Section commands inside outer or nested lists, including every supported
  level and starred form, cannot split list traversal or enter the global
  hierarchy. Command-contained includes cannot fragment parent prose, expose
  child prose or structure as top-level events, or consume a later ordinary
  include of the same child. Unsupported structural containment is omitted from
  normalized text with an exact command-range warning; original block, section,
  footnote, and other dedicated-inventory ranges remain source-local.
- A backslash introduces a command or environment only when its immediately
  preceding backslash run has even length. Escaped commands remain inert in
  ordinary text, comments, and literal-code environments without shifting
  Unicode or CRLF source offsets.
- Comment masking preserves source length; CRLF and Unicode before a construct
  do not shift its range, including astral characters inside masked comment,
  literal-code, or TikZ environments.
- Comment and literal-code environments use outermost source-order precedence:
  comment-looking text inside a literal remains authored code, while
  literal-looking text inside an outer comment remains inert.
- Figure bytes and generated presentation or Markdown output never share an
  identity or overwrite one another.
- Canonical identity JSON contains hashes and byte counts for binary assets,
  never the raw bytes.
- PDF extraction never invokes OCR, creates a canvas, fetches a URL, persists
  bytes, or sends content to a model.
- Conformance expectations never depend on locale ordering, current time,
  randomness, or Kirjolab application state.
- The package-ready `index.ts` remains a Fallow entry point so intentional
  public contracts are not confused with dead internal exports; internal
  modules do not retain unused compatibility re-exports.
- The canonical pack command never invokes a nested bare `node` or `npm` from
  ambient `PATH`; it fails unless the lifecycle executables match the release
  manifest and unless npm's filename, size, and emitted bytes reproduce every
  checked artifact field.

### Scenarios

**Scenario: Confirm the exact reviewed LaTeX interpretation**

- Given: a researcher previews one root and bibliography from a bounded archive
- When: confirmation repeats with identical bytes, selection, versions, options,
  archive manifest, and neutral conversion manifest
- Then: both identities match and Kirjolab may adapt and persist the conversion

**Scenario: Reject a changed selection without mutation**

- Given: an archive has two valid roots or bibliographies
- When: confirmation submits a different valid selection with the prior preview
  digest
- Then: the Worker returns a conflict before any project, asset, access, room,
  or catalog write

**Scenario: Ignore an escaped semantic command**

- Given: source contains `\\cite{x}` beside active `\cite{x}` and
  `\\\cite{x}` forms, comments, literal environments, Unicode, and CRLF
- When: neutral conversion scans commands and environments
- Then: the escaped command creates no semantic record while each active command
  retains its exact original-file range

**Scenario: Verify source provenance after Unicode**

- Given: a decoded source contains CRLF text and non-BMP characters before a
  citation or figure
- When: neutral conversion retains its source range
- Then: slicing the original JavaScript string with that range recovers the
  exact authored construct

**Scenario: Recover ordinary prose under its active section**

- Given: a multi-file manuscript has prose before its first section, paragraphs
  and list items under a section, nested non-prose environments, Unicode, CRLF,
  citations, and equations
- When: neutral conversion emits its prose-block inventory
- Then: every retained block round-trips to exact authored source and carries
  its deterministic kind, order, and active section relationship; list-item
  retrieval text keeps only surrounding prose while dedicated inventories keep
  the excluded figures, tables, code blocks, and equations; includes inside
  those excluded environments and bibliography commands contribute no prose

**Scenario: Contain structural commands within their authored parent**

- Given: list items contain section commands and a footnote or other command
  argument contains an archive-local include before a later ordinary include
- When: neutral conversion classifies structural occurrences
- Then: list items and parent prose remain coherent source-local blocks, each
  unsupported contained command has an exact warning, child prose and sections
  appear only at the ordinary include, and dedicated command inventories retain
  their complete authored source

**Scenario: Install the private package candidate**

- Given: the maintained Slideotter adapter needs the neutral core without any
  Kirjolab application or Cloudflare authority
- When: its isolated Node 24 build installs the reviewed private `0.x` tarball
- Then: production imports use `.`, fixtures use `./conformance`, PDF.js remains
  injected, and no registry publication occurs

**Scenario: Extract native PDF text locally**

- Given: a bounded deterministic PDF contains native text on numbered pages
- When: a consumer runs the injected byte-oriented extractor
- Then: the result contains the PDF SHA-256, page count, normalized bounded text,
  stable warnings, and no browser, OCR, storage, or network side effect
