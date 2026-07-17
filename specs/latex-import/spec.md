# Feature: LaTeX Project Import

## Blueprint

### Context

Researchers should be able to migrate existing Overleaf projects into
Kirjolab's canonical Markdown model without flattening multi-file manuscripts,
executing uploaded TeX on the server, or silently discarding constructs that do
not translate cleanly.

### Architecture

- The New project surface offers **Import LaTeX archive** beside template and
  GitHub import workflows.
- Archive inspection and conservative conversion run in the authenticated
  Worker. Uploaded ZIP bytes are transient request data and are never stored.
- The importer accepts one bounded ZIP, rejects encrypted entries, traversal,
  absolute and backslash paths, symlinks, duplicate normalized paths, invalid
  UTF-8 manuscript files, excessive expansion ratios, and archive resource
  limit violations before conversion.
- Root detection prefers an unambiguous file containing `\documentclass` and
  `\begin{document}`. Multiple candidates require an explicit researcher
  choice; no candidate produces a recoverable diagnostic.
- Archive-local `\input` and `\include` edges become project-relative
  `::include[path]` directives. Cycles, missing inputs, and paths outside the
  archive fail closed and remain navigable in the preview.
- The converter recognizes a documented scholarly LaTeX subset without running
  TeX, loading packages, expanding arbitrary macros, or accessing the network.
- The Kirjolab adapter maps common sections, emphasis, lists, links, math,
  footnotes, citations, labels, cross-references, code listings, tables,
  figures, captions, and bibliography placement into supported scientific
  Markdown. Layout-only LaTeX is omitted with diagnostics.
- `\cite`, `\citep`, and `\citet` preserve citation aliases and map to
  Kirjolab citation modes. `\label` and `\autoref` map to stable heading ids,
  anchors, and `:ref` directives where the target can be resolved.
- Supported raster images and inert SVGs become project assets below
  `figures/`. Publisher classes, style files, fonts, binaries, generated
  auxiliaries, and unrelated manuals remain ignored import inputs.
- BibTeX databases referenced by the resolved manuscript enter the existing
  reviewed library import and project-alias workflow. Unreferenced databases
  are reported and remain unselected by default.
- TikZ and PGFPlots environments become canonical fenced `tikz` blocks and are
  reported as preserved, unrendered source under ADR-142.
- Confirmation uploads the archive again with reviewed selections to a
  dedicated authenticated project-creation endpoint. The Worker repeats
  inspection and conversion before initializing normal project authorities.
- Import is explicit and one-way. Reimport creates another project; it does not
  synchronize with Overleaf or maintain a LaTeX shadow tree.

### API Contracts

- `POST /api/latex-import-previews` accepts one bounded ZIP plus optional root
  and bibliography selections and returns a non-mutating versioned preview.
- `POST /api/latex-imports` accepts the same archive, a title, and reviewed
  selections plus the preview digest, repeats conversion, and returns the
  created workspace summary. A digest mismatch fails as stale review.
- Conversion reports contain stable diagnostic codes, severity, source path,
  bounded source ranges, and a human-readable message. They never contain
  executable HTML or unbounded archive excerpts.
- Routine validation failures return typed results and create no project,
  library record, asset object, or catalog entry.

### Bounds

- Compressed archive size: at most 20 MiB.
- Expanded archive content: at most 64 MiB and 1,024 entries.
- Markdown project result: existing 512-file and 2 MiB composition limits.
- Individual TeX or BibTeX text input: at most 2 MiB.
- Images: existing project media types and 20 MiB per-asset limit.
- TikZ source: at most 128 KiB per block and 32 blocks per project.

### Anti-Patterns

- Do not execute an imported document, package, script, filter, or shell command
  in the Worker.
- Do not store the uploaded archive or treat it as project authority.
- Do not execute TeX, package hooks, filters, or generated code during import.
- Do not preserve publisher layout by embedding raw LaTeX or trusted HTML into
  canonical Markdown.
- Do not silently choose among multiple roots, bibliography databases, or
  conflicting normalized paths.
- Do not claim a TikZ preview exists when only its source was preserved.

## Contract

### Definition of Done

- [x] A researcher can select an Overleaf ZIP and review its detected root,
      derived Markdown tree, entry file, figures, bibliography, ignored files,
      and diagnostics without a server mutation.
- [x] Confirming a valid preview creates a normal independent Kirjolab project
      whose Markdown composition, citations, figures, and history work through
      existing authorities.
- [x] The supplied HTML First archive imports its six manuscript sections,
      abstract, title metadata, citations, footnotes, code listings, tables,
      bibliography, and biography with explicit diagnostics for lost layout.
- [x] TikZ and PGFPlots source is preserved losslessly with explicit unrendered
      diagnostics and bounded block counts and sizes.
- [x] Malicious and over-limit archives fail closed without project, library,
      R2, or catalog writes.
- [ ] Domain, Workers-runtime, and browser tests cover conversion, validation,
      review, confirmation, and preserved TikZ handling.

### Regression Guardrails

- Canonical project state contains Markdown, stable library relationships, and
  explicitly accepted assets; it never depends on transient TeX or generated
  preview state.
- Import preview is non-mutating and confirmation is a separate deliberate
  action.
- Every accepted path is normalized and archive-relative; no include, image,
  bibliography, or virtual-filesystem access can escape the selected archive.
- Import performs no network retrieval or authored-code execution.
- Projects without LaTeX import receive no optional conversion runtime.

### Verification

- **Unit tests:** ZIP path validation, root and include detection, bounds,
  diagnostic stability, LaTeX-to-Kirjolab adaptation, citation and reference
  mapping, ignored-file classification, and import-seed validation.
- **Workers tests:** owner identity, request-size bounds, seed revalidation,
  all-or-nothing project initialization, asset validation, and absence of writes
  after rejected input.
- **Browser tests:** archive selection, ambiguous-root choice, preview rendering,
  explicit confirmation, progress, and error states.

### Scenarios

**Scenario: Import a multi-file Overleaf paper**

- Given: an archive contains one root document, archive-local section inputs, a
  referenced BibTeX database, and supported figures
- When: the researcher reviews and confirms the conversion
- Then: Kirjolab creates one project with a stable Markdown entry, supporting
  files joined by `::include`, reviewed reference aliases, and inert assets

**Scenario: Review an ambiguous conversion**

- Given: an archive has two root documents or more than one plausible
  bibliography
- When: the researcher opens the import preview
- Then: no project is created and the preview requires an explicit root or
  bibliography selection before confirmation

**Scenario: Reject an escaping include**

- Given: imported TeX requests `\input{../../private}`
- When: the Worker inspects the archive
- Then: the edge is rejected, no external file is read, and confirmation stays
  blocked with a source-qualified diagnostic

**Scenario: Preserve a TikZ figure**

- Given: a selected manuscript contains a bounded TikZ or PGFPlots environment
- When: the Worker converts the archive
- Then: the canonical source block remains visible and a diagnostic explains
  that no renderer was run

## Current Milestone

- Server-side archive inspection, reviewed conversion, digest-bound project
  creation, bibliography seeding, referenced figure storage, and lossless TikZ
  preservation are implemented under ADR-141 and ADR-142.
- The supplied HTML First archive converts into ten Markdown files with its
  selected bibliography and referenced biography figure; layout-only commands
  remain explicit review warnings.
- A real TikZ/PGFPlots archive and browser-level end-to-end coverage remain
  follow-up verification before claiming a rendering compatibility tier.
