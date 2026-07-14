# Feature: Source-Mapped Publication Export

## Context

Kirjolab papers are authored as a folder of canonical Markdown files composed
from `main.md`. PDF, LaTeX, Markdown, BibTeX, and archival outputs must not
resolve that tree or its citations independently. Researchers also need a
stable publication word count and diagnostics that lead back to authored
files.

## Architecture

- `src/domain/export-pipeline.ts` is the pure publication boundary. It composes
  the project, computes reachable citation aliases, builds the intermediate,
  and materializes LaTeX.
- `src/api/export-artifacts.ts` is the Worker adapter that encodes deterministic
  ZIP and PDF bytes from the already materialized bundle. It never recomposes
  source or recalculates citation scope.
- `src/domain/publication-statistics.ts` defines the shared
  `kirjolab-prose-v1` counting rule. The client may use this pure projection for
  live statistics without bundling artifact encoders.
- Every intermediate carries the exact composed Markdown, citation-scoped
  BibTeX, composition spans, mapped diagnostics, statistics, and pinned schema
  identity.
- Generated LaTeX spans identify `main.tex` line ranges and their authored
  file ID, path, source range, line, and include chain.
- LaTeX and direct PDF share one scholarly-syntax projection. Reference
  declarations are non-printing, cross-references resolve to their visible
  heading or anchor labels, and citation attributes are consumed completely.
  Directive-looking content inside fenced code remains literal.
- After composition, both publication targets share one bounded structured-block
  projection for GFM pipe tables and named footnotes. A table requires a header
  and delimiter row, supports escaped pipes and delimiter alignment, and does
  not infer spans or multiline cells. Footnote definitions support immediate
  indented continuations and receive stable numbers in first-reference order.
  Fenced examples, malformed structures, and unsupported block forms remain
  literal prose.
- LaTeX emits `booktabs` tables and native footnotes. Direct PDF draws aligned,
  wrapping table rows and numbered page notes without executing authored TeX.
  Repeated footnote references reuse their first number, while unreferenced
  definitions do not print.
- Direct PDF citations resolve cited bibliography metadata through the selected
  APA, Chicago author-date, or IEEE profile instead of exposing project aliases.
  LaTeX uses the corresponding citation commands and bibliography style.
- Authored Markdown headings are the only visible document titles in direct PDF
  and compiled LaTeX output. The project-settings title remains artifact
  metadata and a non-printing LaTeX declaration; export never prepends it as a
  heading or calls `\maketitle`.
- The maintained `kirjolab-article-v3` LaTeX template is the reproducible
  default. The ZIP records template and engine versions in
  `export-manifest.json` and includes `source-map.json` plus the complete
  intermediate.
- The bounded Worker PDF renderer is
  `kirjolab-pdf-lib-v2@1.17.1`. It reads the same materialized intermediate as the
  LaTeX target, uses only embedded standard fonts, fixes metadata timestamps,
  performs no network access, and executes no authored TeX. The LaTeX ZIP is
  the exact publisher-facing project for full TeX compilation; arbitrary
  custom TeX execution remains outside the hosted Worker until a separately
  isolated, resource-bounded engine is introduced.
- ZIP encoding is pinned to `fflate@0.8.3`, sorts paths, fixes timestamps and
  permissions, and rejects traversal semantics when adding archive paths.
- Normal outputs contain only bibliography entries cited from the composed
  `main.md`. The source bundle additionally retains the authored folder tree
  and project-shared metadata; it does not silently embed private library
  artifacts or imported research PDFs.
- Composed Markdown and canonical files intentionally retain portable Kirjolab
  extensions. Publication-facing LaTeX and PDF must never print supported
  `::include`, `::alias`, `::anchor`, `:ref`, or `:cite` syntax or its attribute
  block as prose.

## User Interface

- The workspace header exposes one **Export** control rather than one button
  per extension.
- The export dialog offers PDF, LaTeX project ZIP, composed Markdown, cited
  BibTeX, and archival source ZIP.
- A live word-count badge opens the same dialog. Statistics show the composed
  total plus per-file and per-heading counts.
- Revision comparison reports composed line changes and the before, after, and
  delta values under the same word-counting rule.
- The existing HTML preview remains visible if an export request fails. Export
  diagnostics are a separate representation and never clear or replace it.

## API Contract

All routes require normal workspace read authorization and return
`Cache-Control: no-store`.

| Route                                               | Representation                                              |
| --------------------------------------------------- | ----------------------------------------------------------- |
| `GET /api/workspaces/{id}/export/document.md`       | Flattened composed Markdown                                 |
| `GET /api/workspaces/{id}/export/bibliography.bib`  | Cited BibTeX only                                           |
| `GET /api/workspaces/{id}/export/latex.zip`         | LaTeX, manifest, intermediate, bibliography, and source map |
| `GET /api/workspaces/{id}/export/document.pdf`      | Bounded deterministic PDF                                   |
| `GET /api/workspaces/{id}/export/source.zip`        | Canonical project tree and project-shared archival metadata |
| `GET /api/workspaces/{id}/export/statistics.json`   | Publication statistics                                      |
| `GET /api/workspaces/{id}/export/diagnostics.json`  | Source-mapped export diagnostics                            |
| `GET /api/workspaces/{id}/export/intermediate.json` | Versioned intermediate download                             |

Composition errors block normal Markdown, BibTeX, LaTeX, and PDF outputs with
HTTP `422` and mapped diagnostics. Statistics, diagnostics, intermediate, and
source-archive representations remain available so a broken project can be
examined and recovered.

## Word-Counting Rule

`kirjolab-prose-v1` counts Unicode letter/number words in the composed
document. It includes heading and visible link-label text. It excludes YAML
front matter, fenced and inline code, equations, citation keys, link
destinations, HTML tags, and explicit heading identifiers. Repeated
transclusion is counted each time it appears in the composed paper.

Per-file counts attribute each composed source span to its stable file ID.
Per-heading counts include the heading and following content up to the next
heading. These are transparent publication statistics, not claims that every
journal uses the same counting policy.

## Security and Bounds

- Export composition inherits the path, include-depth, file-count, and output
  byte limits from project composition.
- The hosted renderer does not fetch remote images, execute TeX, evaluate
  scripts, or include owner-private library data.
- Download responses are private and non-cacheable.
- Archive names are normalized to relative, traversal-free paths.

## Acceptance Scenarios

### Cited-only outputs

- Given a project with cited and uncited linked references
- When any normal export is requested
- Then only aliases reachable from composed `main.md` appear in BibTeX and
  publication artifacts.

### Source mapping through front matter

- Given an included file whose front matter is stripped during composition
- When LaTeX and its source map are generated
- Then the generated span points to the original authored line after the front
  matter, not line one of the stripped fragment.

### Broken include

- Given a missing, cyclic, unsafe, or over-limit include
- When a normal artifact is requested
- Then export returns mapped diagnostics and no incomplete publication
  artifact, while the source archive and existing HTML preview remain
  available.

### Reproducible archives and PDF

- Given the same logical project state and pinned versions
- When LaTeX ZIP or bounded PDF generation runs twice
- Then both byte sequences are identical.

### Authored title ownership

- Given the project-settings title differs from the manuscript's Markdown H1
- When direct PDF or LaTeX output is generated
- Then the H1 is the visible title and the settings title appears only as
  metadata, never as an additional heading or title page.

### Structured publication fidelity

- Given a composed manuscript containing transclusion, citations, references,
  aligned pipe tables, named footnotes, lists, fenced code, and math
- When LaTeX and bounded PDF artifacts are generated
- Then table delimiters and footnote definitions do not print as source syntax,
  tables remain readable, notes share first-reference numbering, fenced syntax
  remains literal, and all previously supported scholarly projections remain
  intact.

## Verification

- Pure and adapter tests inspect citation scope and formatting, scholarly
  directive projection, statistics, source maps, diagnostics, deterministic ZIP
  entries, extracted PDF text, PDF metadata, and archive traversal handling.
- Browser tests exercise the unified dialog and all primary artifact routes
  through local `workerd`.
- Project-history tests cover revision word deltas.
