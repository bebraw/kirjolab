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
- Archive inspection and Pandoc conversion run locally in the browser. The
  original ZIP is never uploaded as part of normal import.
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
- A pinned, self-hosted Pandoc WebAssembly runtime is loaded only after a valid
  archive reaches conversion. It receives an explicit virtual filesystem with
  no network or system-command capability.
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
- TikZ and PGFPlots environments become canonical fenced `tikz` blocks.
  Preview rendering uses the separately pinned browser sandbox from ADR-142;
  failed rendering never changes the source block.
- Confirmation sends a normalized `LatexImportSeed`, not TeX, to a dedicated
  authenticated project-creation endpoint. The Worker independently validates
  all text, folders, entry selection, publication settings, bibliography
  aliases, and image bytes before initializing the normal project authorities.
- Import is explicit and one-way. Reimport creates another project; it does not
  synchronize with Overleaf or maintain a LaTeX shadow tree.

### API Contracts

- `POST /api/latex-imports` accepts one bounded, browser-derived import seed and
  returns a created workspace summary after server validation and normal
  project initialization.
- The seed contains a title, normalized Markdown files, optional entry path,
  folders, publication settings, selected bibliography source, supported image
  resources, and a versioned conversion report.
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
- TikZ source: at most 128 KiB per block, 32 blocks per project, one active
  compilation, a 10-second deadline, and at most 2 MiB of generated SVG.

### Anti-Patterns

- Do not execute an imported document, package, script, filter, or shell command
  in the Worker.
- Do not upload the original archive merely to perform conversion.
- Do not treat Pandoc Markdown output as trusted canonical input without the
  Kirjolab adaptation and server validation passes.
- Do not preserve publisher layout by embedding raw LaTeX or trusted HTML into
  canonical Markdown.
- Do not silently choose among multiple roots, bibliography databases, or
  conflicting normalized paths.
- Do not inject generated TikZ SVG directly into the DOM or persist it as an
  authored asset without inert-SVG validation and explicit materialization.

## Contract

### Definition of Done

- [ ] A researcher can select an Overleaf ZIP and review its detected root,
      derived Markdown tree, entry file, figures, bibliography, ignored files,
      and diagnostics without a server mutation.
- [ ] Confirming a valid preview creates a normal independent Kirjolab project
      whose Markdown composition, citations, figures, and history work through
      existing authorities.
- [ ] The supplied HTML First archive imports its six manuscript sections,
      abstract, title metadata, citations, footnotes, code listings, tables,
      bibliography, and biography with explicit diagnostics for lost layout.
- [ ] Core TikZ renders locally to sanitized SVG; PGFPlots behavior is covered
      by a representative archive fixture before it is declared supported.
- [ ] Malicious and over-limit archives fail closed without project, library,
      R2, or catalog writes.
- [ ] Domain, Workers-runtime, and browser tests cover conversion, validation,
      review, confirmation, renderer failure, and sanitization.

### Regression Guardrails

- Canonical project state contains Markdown, stable library relationships, and
  explicitly accepted assets; it never depends on transient TeX, Pandoc AST,
  TikZ worker state, or generated preview SVG.
- Import preview is non-mutating and confirmation is a separate deliberate
  action.
- Every accepted path is normalized and archive-relative; no include, image,
  bibliography, or virtual-filesystem access can escape the selected archive.
- The browser runtime performs no network retrieval during conversion or TikZ
  compilation.
- Generated SVG receives independent validation even when compilation succeeds.
- Projects without LaTeX import or TikZ do not download either optional runtime.

### Verification

- **Unit tests:** ZIP path validation, root and include detection, bounds,
  diagnostic stability, LaTeX-to-Kirjolab adaptation, citation and reference
  mapping, ignored-file classification, and import-seed validation.
- **Workers tests:** owner identity, request-size bounds, seed revalidation,
  all-or-nothing project initialization, asset validation, and absence of writes
  after rejected input.
- **Browser tests:** archive selection, ambiguous-root choice, preview rendering,
  explicit confirmation, progress and error states, lazy runtime loading, and
  disposable TikZ worker termination.

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
- When: the browser inspects the archive
- Then: the edge is rejected, no external file is read, and confirmation stays
  blocked with a source-qualified diagnostic

**Scenario: Preserve a failed TikZ figure**

- Given: a TikZ block requires an unavailable package or exceeds its deadline
- When: Preview attempts local rendering
- Then: the worker is terminated, the canonical source block remains visible,
  and a diagnostic explains why no SVG is shown

## Current Milestone

- Accepted architecture in ADR-141 and ADR-142.
- Implementation pending: archive conversion, reviewed project creation, and
  sandboxed TikZ preview.
