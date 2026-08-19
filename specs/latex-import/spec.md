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
- A bounded light-DOM component owns the import form's archive, title, selected
  root, reviewed conversion, preview digest, status, busy presentation, and
  native dialog lifecycle. It also owns the authenticated preview and creation
  requests, constructs them from its current reviewed state, validates both
  responses with the shared Valibot boundary contracts, closes itself on
  cancellation, and navigates to the successful response's canonical workspace
  href. A monotonically increasing preview-request epoch prevents a response
  from an earlier archive or reopened dialog from replacing the current review.
- Archive inspection and conservative conversion run in the authenticated
  Worker. The request stream is capped before archive inspection or hashing;
  uploaded ZIP bytes are transient request data and are never stored.
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
- The production importer retains its bounded converter under ADR-184. The
  exact-pinned development-only `unified-latex` spike records structural parsing,
  custom macro-registry needs, inert dangerous primitives, and parser bundle
  cost without entering the Worker runtime.
- The Kirjolab adapter maps common sections, emphasis, lists, links, math,
  footnotes, citations, labels, cross-references, code listings, tables,
  figures, captions, and bibliography placement into supported scientific
  Markdown. Layout-only LaTeX is omitted with diagnostics.
- `\cite`, `\citep`, and `\citet` preserve citation aliases and map to
  Kirjolab citation modes. `\label` and `\autoref` map to stable heading ids,
  anchors, and `:ref` directives where the target can be resolved.
- A backslash starts a command or environment only when its immediately
  preceding backslash run has even length. Escaped command-looking text does not
  create headings, citations, includes, environments, or other semantic records.
- `lstlisting`, `minted`, and `verbatim` bodies remain literal fenced code,
  including when nested in a figure. Recognized positional or `language=`
  metadata becomes a sanitized Markdown fence language without altering the
  authored code indentation or interpreting commented-out environments.
- Supported raster images and inert SVGs become project assets below
  `figures/`. Publisher classes, style files, fonts, binaries, generated
  auxiliaries, and unrelated manuals remain ignored import inputs.
- BibTeX databases referenced by the resolved manuscript enter the existing
  reviewed library import and project-alias workflow. Unreferenced databases
  are reported and remain unselected by default.
- A narrowly recognized horizontal PGFPlots `boxplot prepared` figure becomes
  an experimental version 1 native boxplot directive under ADR-145. All other
  TikZ and PGFPlots environments become canonical fenced `tikz` blocks and are
  reported as preserved, unrendered source under ADR-142.
- Confirmation uploads the archive again with reviewed selections to a
  dedicated authenticated project-creation endpoint. The Worker repeats
  inspection and conversion before initializing normal project authorities.
  It verifies the original archive SHA-256 and a canonical preview digest that
  covers the effective root and bibliography, converter/schema versions,
  conversion options, deterministic archive manifest, and deterministic neutral
  conversion manifest. The conversion manifest covers diagnostics, semantics,
  prose blocks, source fingerprints, figure provenance, asset hashes, and
  versioned rendered-file hashes. Either mismatch returns a conflict before any
  persistent write.
- Product-neutral conversion and provenance live under the paper-import core in
  ADR-223. The same neutral core constructs Kirjolab's preview identity before a
  separate adapter creates the project seed, publication profile, Scholarmark
  files, and asset registrations.
- Ordinary paragraph and list-item prose is inventoried independently from
  headings. Each retained block has deterministic identity and ordering,
  normalized retrieval text, its active section when known, and exact original
  UTF-16 source provenance across reachable includes. Nested standard lists
  preserve every visible outer and inner item in rendered order. Nested figure,
  table, code, and math environments are omitted from list-item retrieval text
  without changing the item's exact source or range or its dedicated semantic
  inventories. Include commands are classified against complete-source
  excluded ranges before prose traversal, so a file included inside an excluded
  environment contributes no prose or hidden list markers and does not split
  the parent item's exact envelope. Normalized list-item text likewise omits
  `\\bibliography`, `\\addbibresource`, and `\\bibliographystyle` commands.
  Section commands and section-bearing includes inside excluded environments
  are filtered against the same complete-source ranges before inventory and
  prose traversal, so they cannot change hierarchy or active section context.
  A visible include inside an outer or nested list item is conservatively
  omitted at that edge: the include command is removed from normalized parent
  text, the complete parent source/range remains exact, and a source-ranged
  `prose-provenance-unavailable` warning explains why child prose and sections
  were not traversed. The same child may still be traversed at a later ordinary
  include occurrence.
- Converted files declare `renderedFormat: "scholarmark-v1"`; consumers must not
  mistake Kirjolab directives for neutral Markdown.
- Import is explicit and one-way. Reimport creates another project; it does not
  synchronize with Overleaf or maintain a LaTeX shadow tree.

### API Contracts

- `POST /api/latex-import-previews` accepts one bounded ZIP plus optional root
  and bibliography selections and returns a non-mutating versioned preview with
  `archiveSha256` and, when conversion is possible, `previewDigest`.
- `POST /api/latex-imports` accepts the same archive, a title, and reviewed
  selections plus both identities, repeats conversion, and returns the created
  workspace summary. An archive mismatch reports `archive-changed`; any other
  reviewed-interpretation mismatch reports `preview-changed`.
- Conversion reports contain stable diagnostic codes, severity, source path,
  trustworthy original-file source ranges when reconstructible, and a
  human-readable message. Ranges use UTF-16 code units and must round-trip
  through the original decoded file. Reports omit a range rather than expose an
  offset into transformed text. They never contain executable HTML or unbounded
  archive excerpts.
- The neutral core exports canonical preview-identity construction and digest
  operations. Conversion-manifest JSON represents binaries only by byte count,
  media type, and SHA-256, never raw asset bytes.
- Routine validation failures return typed results and create no project,
  library record, asset object, or catalog entry.

### Bounds

- Compressed archive size: at most 20 MiB.
- Expanded archive content: at most 64 MiB and 1,024 entries.
- Markdown project result: existing 512-file and 2 MiB composition limits.
- Individual TeX or BibTeX text input: at most 2 MiB.
- Archive paths: at most 1,024 UTF-16 code units and 64 segments.
- Images: existing project media types and 20 MiB per-asset limit.
- Figure resolution: at most 1,024 UTF-16 code units per authored path, 256
  retained search folders, 65,536 aggregate search-folder code units, and
  100,000 candidate probes.
- TikZ source: at most 128 KiB per block and 32 blocks per project.
- Archive structural references and diagnostics: at most 10,000 retained
  records.
- Neutral semantic and rendering inventory: at most 50,000 records; callers may
  tighten but never loosen this ceiling.
- Citation keys: at most 1,000 per command and counted against the aggregate
  semantic inventory.
- Standard-list nesting: at most 1,024 `itemize` or `enumerate` environments.
- Retained figure provenance: at most 16 Mi UTF-16 code units across image
  references, captions, labels, and enclosing figure sources; repeated figure
  strings are hashed in the canonical conversion manifest.
- Retained prose provenance: at most 32 Mi UTF-16 code units across normalized
  text and exact source slices; exact source is hashed in the canonical
  conversion manifest so overlapping nested-list ranges remain bounded.
- Rendered conversion: at most 4 Mi UTF-16 code units per file and 16 Mi per
  project, with at most 10,000 derived folders and 1 Mi aggregate derived-folder
  path code units.
- Converted tables: at most 1,000 rows, 256 columns, and 1 Mi UTF-16 output code
  units per table.

### Anti-Patterns

- Do not execute an imported document, package, script, filter, or shell command
  in the Worker.
- Do not store the uploaded archive or treat it as project authority.
- Do not execute TeX, package hooks, filters, or generated code during import.
- Do not preserve publisher layout by embedding raw LaTeX or trusted HTML into
  canonical Markdown.
- Do not silently choose among multiple roots, bibliography databases, or
  conflicting normalized paths.
- Do not claim general TikZ compatibility when only one native boxplot subset
  was translated or source was preserved.
- Do not add a general LaTeX parser to production unless a corpus-backed adapter
  retires the equivalent lexical mechanics and preserves every import trust
  boundary and diagnostic contract.

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
- [x] Recognized prepared boxplots become native figures; every unsupported TikZ
      or PGFPlots block is preserved losslessly with explicit diagnostics and
      bounded block counts and sizes.
- [x] Malicious and over-limit archives fail closed without project, library,
      R2, or catalog writes.
- [x] Domain, Workers-runtime, and browser tests cover conversion, validation,
      review, confirmation, and preserved TikZ handling.

### Regression Guardrails

- Canonical project state contains Markdown, stable library relationships, and
  explicitly accepted assets; it never depends on transient TeX or generated
  preview state.
- Import preview is non-mutating and confirmation is a separate deliberate
  action.
- Archive, selection, archive-manifest, conversion-manifest,
  conversion-option, converter-version, identity-schema, and neutral-output
  changes invalidate confirmation before persistence.
- Every retained prose block and figure source range round-trips through the
  original decoded file; prose ids, ordering, and section relationships are
  deterministic and locale-independent.
- Nested non-prose environments, excluded bibliography commands, and prose or
  item markers from files included inside those environments never leak into
  normalized list-item retrieval text or create phantom prose blocks.
- Section events inside excluded environments never enter the neutral section
  inventory or alter following prose context. Active orphan `\\item` commands
  and includes inside lists never become ordinary paragraph retrieval text.
- Figure provenance retains archive and resolved asset paths, content hash,
  caption, label, source-reference ranges, and resolution diagnostics.
- Every accepted path is normalized and archive-relative; no include, image,
  bibliography, or virtual-filesystem access can escape the selected archive.
- Import performs no network retrieval or authored-code execution.
- Projects without LaTeX import receive no optional conversion runtime.
- Development parser evaluations remain outside production imports and prove
  that execution-capable primitives are handled only as inert syntax.

### Verification

- **Unit tests:** ZIP path validation, escaped-command handling, root and include
  detection, bounds, diagnostic stability, prose and figure range round trips,
  canonical manifest and preview digest vectors, LaTeX-to-Kirjolab adaptation,
  citation and reference mapping, ignored-file classification, and import-seed
  validation.
- **Workers tests:** owner identity, request-size bounds, seed revalidation,
  all-or-nothing project initialization, asset validation, archive, selection,
  version, option, and neutral-output drift, and absence of writes after rejected
  input.
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

**Scenario: Ignore an escaped citation**

- Given: manuscript prose contains `\\cite{not-a-citation}`
- When: the Worker performs structural and semantic conversion
- Then: no citation record or rendered citation directive is created for the
  escaped command

**Scenario: Translate a prepared boxplot**

- Given: a selected manuscript contains a bounded horizontal PGFPlots prepared
  boxplot with complete summaries, matching labels, and a plain caption
- When: the Worker converts the archive
- Then: canonical Markdown contains a version 1 native boxplot and a diagnostic
  identifies the experimental translation

**Scenario: Preserve an unsupported TikZ figure**

- Given: a selected manuscript contains a bounded TikZ or PGFPlots environment
- When: the Worker converts the archive
- Then: the canonical source block remains visible and a diagnostic explains
  that no renderer was run

**Scenario: Reject a stale reviewed selection**

- Given: a researcher previews one valid root and bibliography from an archive
- When: confirmation submits another valid root or bibliography with the prior
  preview digest
- Then: the Worker returns a conflict and leaves project, catalog, access,
  document-room, and asset state untouched

**Scenario: Reject converter deployment drift**

- Given: a preview was produced with one canonical neutral conversion manifest
- When: confirmation under another deployment produces different diagnostics,
  prose, figures, assets, or rendered output without changing archive bytes
- Then: the Worker returns `preview-changed` before accessing any persistence
  binding

## Current Milestone

- Server-side archive inspection, reviewed conversion, archive-and-conversion-
  manifest-bound project creation, bibliography seeding, referenced figure
  storage, prose and figure source provenance, prepared-boxplot translation, and
  lossless unsupported-TikZ preservation are implemented under ADR-141,
  ADR-142, ADR-145, and ADR-223.
- The supplied HTML First archive converts into ten Markdown files with its
  selected bibliography and referenced biography figure; layout-only commands
  remain explicit review warnings.
- The Edge-Powered Islands archive confirms project-root input lookup and the
  PGFPlots prepared-boxplot source pattern. Its chart inputs are commented out
  in the selected manuscript, so they remain correctly ignored; minimized active
  fixtures verify native translation and lossless fallback.
- Browser-level end-to-end coverage verifies bounded archive selection,
  conversion preview, explicit confirmation, created project state, and unsafe
  archive rejection. An isolated renderer remains follow-up work before claiming
  a visual rendering compatibility tier.
