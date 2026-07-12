# UI Review Notes

**Status:** Review complete. Architectural decisions were promoted to ADRs and
feature specs; this file remains the observation log and implementation audit.

## Implementation Audit (2026-07-12)

Implemented during the follow-up pass:

- Files and Research are separate rail modes; bounded collections collapse and
  search replaces the inventory instead of stacking another result list.
- Project files, `main.md`, `::include[path]`, file creation, history,
  milestones, diffs, unified export, PDF/LaTeX output, and word statistics are
  available through their dedicated workflows.
- The header uses project vocabulary, removes the duplicated title and glyph
  action, and adds a searchable Projects browser.
- The editor exposes scholarly insertion templates and explains the
  conditional cited-source action with user-facing save status.
- Authoring/Context is resizable by pointer or keyboard with per-context local
  widths and sharp PDF rerendering. PDF identity, page navigation, pin, and
  close controls share one context row.
- PDF selection paints an immediate draft highlight. Reference intake is
  folded; citation and highlight-to-prose linking are explicit adjacent tasks.
- The model surface is a collapsed, selection-scoped Writing assistant with
  provider settings secondary to its reviewable revision workflow.
- The citation network has a labelled entry point. Unused project PDFs can be
  removed; dependency counts block unsafe deletion without cascading.
- Browser tests use disposable Wrangler persistence and no longer pollute the
  interactive project catalog.
- The private reference library exposes researcher tags and notes on each
  reference card.
- Project settings support rename, archive/restore, current-revision
  duplication, and owner-confirmed permanent deletion without deleting shared
  private-library references.
- Saved PDF highlights now auto-persist as additive strokes with editing,
  erasing, undo, and dependency-aware deletion.
- Reference cards expose structured canonical metadata editing with manual
  provenance, distinct collections, and reading status, priority, and rating.
- Desktop view controls expose Split, Editor only, Context only, and PDF only,
  remembering the choice locally per project.

## Review Context

- Reviewed the current desktop workspace at `http://localhost:8787/` in a
  1728 × 997 viewport.
- The local state was intentionally noisy and test-heavy: 200 project/workspace
  options, 53 PDFs, 52 annotations, 2 claims, 2 references, and 105
  connections. These counts are not representative product data, but they make
  the current scaling and hierarchy problems visible.

## Observations

### The source shelf is overwhelming

- The rail presents PDFs, annotations, claims, references, and connections as
  one continuously expanded inventory.
- Every collection renders in full. There is no collapse, pagination,
  virtualization, or recent-items boundary.
- Search adds another result stack without filtering or replacing the existing
  inventory.
- Detailed metadata and repeated actions make the rail behave like an action
  console rather than the compact navigator intended by the research-context
  design.
- The first long collection can push every later category far below the fold.

### Adding and navigating documents is unclear because it is not implemented

- A workspace currently contains one manuscript source and one bibliography.
- There is no document collection, file tree, document creation action, or
  document navigation.
- Markdown headings provide sections inside the singleton manuscript, but they
  are not independent pages or files.

### Project navigation is obscure and project management is incomplete

- Project creation and switching exist under the product term `workspace`.
- The current project selector is visually quiet and its adjacent glyph-only
  `+` action does not explain itself.
- A native selector does not scale to a large project catalog or repeated
  titles.
- Sharing and member invitations exist, but rename, archive/delete, duplicate,
  settings, and a dedicated project overview are absent.
- Product vocabulary is inconsistent with the emerging user model:
  `workspace`/`manuscript`/`source` versus `project`/`document`/`file`.

### PDF evidence capture loses the active selection

- Native selection is visible only while dragging. On pointer release, the
  viewer captures the geometry and immediately clears the browser selection.
- The highlight overlay renders saved annotations only. Captured draft
  rectangles are retained for the annotation form but are not rendered back on
  the page.
- The status text reports that fragments were captured, but it does not preserve
  spatial context or make the exact active evidence obvious in the paper.
- In the reviewed state, 64 fragments were captured from page 1 while the page
  showed no persistent draft highlight.
- The annotation composer is below the PDF viewport, increasing the distance
  between selecting evidence, confirming it, adding a note, and saving it.
- This makes repeated evidence capture inefficient and creates uncertainty
  about whether the intended sentences were selected.

### Fixed pane proportions make PDFs harder to read

- The desktop grid fixes the source rail at 17rem and divides the remaining
  width between editor and context using fixed ratios.
- In the reviewed 1728px viewport, the editor occupied about 692px and the
  context pane about 764px. A two-column paper remained small inside that
  context pane.
- There is no draggable separator, keyboard resizing control, focus mode, or
  remembered local width preference.
- PDF rendering calculates its scale when rendering a page, so a future pane
  resize must also trigger a sharp rerender rather than merely stretching the
  existing canvas.

### Reference intake interrupts the writing flow

- The PDF context shows the full **Reference intake / Identify this paper** form
  before the evidence-capture controls by default.
- DOI lookup, metadata review, citation-key choice, and library association are
  categorization tasks rather than necessary steps in every reading or writing
  session.
- The always-expanded form consumes scarce vertical space and makes library
  maintenance appear more important than reading, highlighting, and writing.
- Reference identification remains valuable, but it should be invoked
  intentionally or disclosed only when required by a citation action.

### The path from a highlight to an in-text citation is hidden

- The PDF context offers **Save annotation** and **Save & link selected prose**,
  but no visible citation action.
- **Insert citation** exists only in a separate publication context after the
  PDF has been identified or explicitly connected to a publication.
- Citation insertion also depends on a remembered manuscript caret, but that
  prerequisite is not visible from the PDF selection workflow.
- A researcher must infer the sequence: identify the paper, connect it to a
  publication, move to publication context, place or preserve a manuscript
  caret, and insert the citation.
- The product distinguishes a highlight/annotation, a publication/reference,
  an in-text citation, and an evidence link, but the interface does not explain
  those distinctions at the moment they matter.

### Research-context chrome repeats identity and actions

- The context tab strip already identifies the active PDF and provides global
  **Pin** and **Close** actions.
- A second PDF header immediately below repeats the filename and **Close**
  action, then gives page navigation a full additional row.
- The stacked rows consume substantial vertical reading space without adding a
  second level of hierarchy.
- Large page-navigation buttons and duplicated labels make the context pane
  feel heavier than the rest of the editorial interface.

### The Local model lab is detached from writing

- The model surface is a full-width workbench below the three primary columns,
  so reaching it requires leaving the visible editor/context workspace.
- It combines provider endpoint and model configuration, revision instruction,
  operation status, generation, and candidate history in one section.
- Endpoint and model fields expose adapter/gateway infrastructure as though it
  were a frequent document-level authoring task.
- With no active manuscript selection, chosen evidence, or candidates, most of
  the surface is empty and its primary action is unavailable.
- The prerequisites are distributed elsewhere: manuscript selection lives in
  the editor while annotations and claims are selected in the research rail.
- The term `lab` and the raw connection controls make the feature feel like a
  developer utility rather than an integrated writing capability.

### The header duplicates the current workspace title

- The workspace selector displays the selected workspace title.
- An adjacent wide-screen text element is populated from the same snapshot
  title, so both visible labels have identical meaning and data.
- The intervening glyph-only `+` makes the duplicate title look like a separate
  document identity even though no such distinction exists in the current
  model.
- The second title consumes header space without adding orientation or an
  action.

### Export is fragmented by file extension

- The header exposes separate **Export .bib** and **Export .md** buttons even
  though both belong to one export task.
- File extensions are used as primary action labels without explaining export
  scope or intended use.
- Adding more formats as separate header buttons would consume increasing space
  and make one format appear arbitrarily primary.
- The current implementation exports canonical Markdown and BibTeX only.
  Rendered-document PDF and LaTeX exports are missing.
- The interface does not distinguish exporting the active document from
  exporting project sources, shared bibliography, or assets.

### The editor does not expose its authoring language

- The manuscript editor is a plain textarea with no insertion toolbar, custom
  context actions, slash commands, or command palette.
- Citation insertion is available only from publication context, while opening
  an existing citation is a separate editor-header action.
- Researchers are expected to know or independently discover citation,
  reference, anchor, footnote, and future include syntax.
- The editor therefore exposes canonical Markdown without providing a visible
  path for learning its scholarly extensions.

### The editor header mixes an unexplained citation action with internal status

- **Open reference** is enabled only when the editor caret is inside exactly
  one citation directive.
- In its ordinary disabled state it has no tooltip or nearby explanation, so
  the user cannot discover what would enable it or what it opens.
- `Loading source…` is not a control. It is the initial synchronization state
  for the collaborative editor.
- After synchronization, the same status becomes `Materialized to Markdown`,
  which describes an implementation boundary rather than a useful user
  outcome.
- Placing the conditional action and low-level status together makes them look
  related even though one navigates citation context and the other reports
  persistence.

### Paper relationships are not available as a graph

- Kirjolab derives a typed project knowledge graph, but the interface renders
  it only as a long flat **Connections** list at the bottom of the research
  rail.
- There is no visible graph entry point, node-focused exploration mode, filter,
  overview, or spatial representation.
- Current `cites` edges connect the active manuscript to publications it cites.
  They do not connect one publication to another publication.
- The bibliography projection stores publication metadata but not each paper's
  reference list, so a paper-to-paper citation network cannot currently be
  derived from available project state.
- The term **Connections** does not clarify whether it means document
  citations, PDF associations, evidence links, claims, or relationships between
  papers.

### Imported evidence documents cannot be removed

- There is no PDF deletion API or user-facing removal action.
- **Disconnect** removes only a publication/PDF association and deliberately
  preserves the PDF, publication, and annotations.
- Closing a PDF context tab affects only local navigation state and does not
  remove the imported artifact.
- This makes accidental imports, duplicates, obsolete editions, and sensitive
  documents impossible to clean up through the product.
- Deletion is not a simple list operation once a PDF has annotations, evidence
  links, claim relationships, publication associations, or model provenance.
  The interface must expose those consequences rather than silently cascading.

### Automated test fixtures leak into the interactive workspace

- The repeated workspace titles and evidence documents match browser-test
  fixtures such as `Evidence to prose loop`, `Stale model boundary`, and
  `evidence.pdf`.
- The normal developer server and E2E server use different ports but the same
  repository-local Wrangler home and persistence ownership.
- Browser tests create new isolated workspaces but do not remove their catalog
  entries afterward, so repeated runs accumulate in the interactive owner
  catalog.
- The reviewed catalog reached its 200-entry response limit, which can crowd
  out meaningful projects in addition to creating visual noise.
- Test pollution is compounded by the current lack of project deletion,
  archival, search, and filtering.
- This is primarily an environment-isolation defect. Product filters should not
  be responsible for recognizing or hiding automated fixtures.

### Reference metadata and organization cannot be edited through the UI

- Reference cards expose **Open in context** and optional Crossref **Enrich**
  actions, but no manual metadata editor.
- Publication context renders title, authors, year, venue, DOI, abstract, and
  linked PDFs as read-only content.
- The only current manual editing path is the collapsed raw BibTeX textarea in
  the manuscript column.
- There is no domain model or interface for user-defined tags, collections,
  researcher notes, reading status, priority, or rating.
- The BibTeX parser can preserve arbitrary fields, but the publication
  projection ignores fields such as `keywords` and the UI does not expose them.
- Author-supplied keywords and researcher-created organizational tags are
  different concepts and should not be silently collapsed into one field.

## Decision Log

### Project composition and entry point

**Decision:** Use one root `main.md` entry point per project.

- A project is a foldered file tree plus its composition, evidence-linking, and
  collaboration boundary. It draws references from the user's shared library.
- `main.md` lives at the project root and is the sole composition and rendered
  export entry point.
- `main.md` assembles the project through transclusion. Included Markdown files
  may recursively include other files.
- Supporting files and folders have user-defined names. Kirjolab does not
  enforce chapter, section, table, or figure naming conventions.
- The file tree uses predictable lexical ordering so researchers can control
  order with `_`, numeric prefixes, or any naming convention they prefer.
- Supporting Markdown files may be edited and previewed independently, but they
  do not become separate top-level project documents or export targets.

### Include directive syntax

**Decision:** Use `::include[path]` as the canonical include syntax.

- The directive is a block-level, one-line construct consistent with the
  existing Kirjolab/Satteri directive family.
- Its path resolves relative to the including file and remains readable in
  canonical Markdown.
- Semantics follow the useful parts of MyST include behavior: recursive
  composition, bounded resolution, cycle diagnostics, and source provenance.
- Kirjolab does not adopt MyST's more verbose fenced spelling as canonical.

### Shared reference library

**Decision:** Maintain one user-level reference library that can be reused
across projects.

- Publication records are not owned by an individual project or a
  project-local BibTeX file.
- Stable publication identities, bibliographic metadata, researcher tags, and
  reusable notes live in the shared library and remain available in every
  project the researcher works on.
- Attached PDFs and their highlights are also reusable library resources. A
  researcher should not have to import or annotate the same paper again for
  each project.
- Library notes, researcher tags, highlights, and reading state are private by
  default. Researchers explicitly share selected research material into a
  collaborative project.
- Citing a publication makes the bibliographic record required to understand
  and render that citation available to project collaborators. It does not
  implicitly expose the owner's private PDF, annotations, organizational
  metadata, or research history.
- Projects cite and link to shared publications without copying their records.
  Project-specific citations, claims, and links from library highlights into
  manuscript prose remain project state.
- Editing a shared publication updates the researcher's canonical record rather
  than creating divergent per-project copies.
- BibTeX remains an interchange and export format. A project export
  materializes a portable `.bib` snapshot from the shared library instead of
  treating a manually maintained project file as authoritative.
- Sharing revocation, deletion, and reproducibility require explicit follow-up
  decisions.

### Source intake and web references

**Decision:** Identify sources as they enter the shared library and support web
references alongside publication PDFs.

- Adding a PDF starts an identification step before the source becomes an
  ordinary library item. Do not allow an unidentified PDF to accumulate in the
  working library.
- Extract identifiers and metadata from the file, query appropriate metadata
  services, detect likely duplicates, and prefill as much as possible. Ask the
  researcher to confirm the match or supply only unresolved required fields.
- Preserve provenance per metadata field so automatically extracted, externally
  fetched, and manually corrected values remain distinguishable.
- Permit manual identification when automatic lookup fails or the source has no
  DOI or other standard identifier.
- Use BibTeX entry types and their type-specific required and optional fields as
  the baseline metadata contract instead of imposing one universal minimum.
  Validate the appropriate alternatives for articles, books, chapters,
  proceedings, reports, theses, and other supported source kinds.
- Treat identifier availability separately from bibliographic completeness. A
  DOI is valuable but is not required when the selected BibTeX document type
  can be identified and cited with its recommended fields.
- Show incomplete or suspicious records as actionable validation warnings tied
  to the selected entry type. Do not fabricate missing authors, dates, venues,
  or publishers merely to satisfy a field.
- A web source is a first-class library reference with its canonical URL,
  title, author or publisher when available, publication or update date when
  available, and the exact date and time it was accessed.
- Preserve a private content snapshot of a web source when it is captured or
  cited so evidence remains inspectable if the live page changes or disappears.
  Keep both the fetched representation and an extracted readable form when
  available, with capture diagnostics when a complete snapshot is impossible.
- Re-accessing a web source does not erase earlier provenance. Citations and
  milestone snapshots retain the access time relevant to that use.
- A later capture creates a new timestamped snapshot rather than mutating the
  earlier one. Researchers can compare snapshots, and a project milestone pins
  the version used by its citations and evidence links.
- Web sources participate in the same private-by-default notes, tags, evidence,
  project citation aliases, and project-linking workflows as publications.
- Keep citation-style rendering separate from source metadata. Styles may
  format fields differently or require extra detail, but changing a project's
  citation style must not rewrite the canonical library record.
- Let each project select a default citation style used by preview and normal
  rendered outputs. Store that choice in project revision and milestone state.
- An attached publication template may override citation formatting for its
  export target. Make the override visible before export, and keep it from
  rewriting manuscript citation syntax, project aliases, or shared library
  metadata.

### Citation aliases

**Decision:** Use project-local citation keys backed by stable library
publication identities.

- A publication keeps the same internal identity wherever it is reused.
- Each project can assign readable citation keys that fit its conventions and
  avoid collisions with other work.
- Renaming a project citation key updates project source references without
  duplicating or renaming the shared publication record.
- Generated BibTeX uses the project's aliases so exported Markdown, LaTeX, and
  bibliography files agree.

### Paper revisions and milestones

**Decision:** Keep automatic project revision history and allow researchers to
name immutable milestone snapshots, analogous to Git tags.

- A paper revision is a coherent project-wide snapshot rather than a revision
  of `main.md` alone. It covers the file tree and contents, project citation
  aliases, project claims, evidence links, and the shared-reference metadata
  needed to reproduce the paper at that point.
- Ordinary editing creates recoverable history without requiring the researcher
  to name every revision.
- A researcher can attach a stable name and optional description to any
  revision for milestones such as a submission, reviewer response, accepted
  manuscript, or published version.
- Milestone names point to immutable snapshots. Later edits create new
  revisions and milestones rather than altering the historical snapshot.
- Researchers can diff any two revisions or milestones. The interface should
  support both file-tree and per-file changes and a composed-paper diff that
  follows `main.md` transclusion.
- Historical views are read-only. Restoring one creates a new head revision
  from that snapshot, preserving the intervening timeline rather than moving or
  rewriting history.
- A researcher can copy a revision or milestone into a new project when it is
  the starting point for substantially divergent work.
- Preserve every user-visible logical revision and named milestone indefinitely
  unless the project owner explicitly removes eligible history. Named
  milestones are never removed by an automatic retention policy.
- Internal CRDT updates, operation logs, and storage deltas may be compacted,
  but compaction must preserve the exact content and identity of every retained
  revision, its provenance, restoration behavior, and the ability to diff it
  against any other retained revision.
- Provide semantic text diffs for Markdown and other text-based project files,
  including rename-aware file identity and the composed-paper view.
- For images, PDFs, and other binary assets, initially show the two versions
  side by side with filename, media type, dimensions or page count when
  available, byte size, checksum, and metadata changes. Defer pixel-level or
  content-extraction diffs until a source kind has a reliable comparison model.

### Document word statistics

**Decision:** Calculate and expose live word statistics for the composed paper.

- The primary word count represents the resolved `main.md` composition rather
  than only the active source file.
- Count readable manuscript prose after resolving includes. Do not inflate the
  publication count with frontmatter, directive syntax, comments, bibliography
  records, or raw markup tokens.
- Show the composed total as a quiet persistent statistic and provide a
  detailed statistics view with per-file and heading-level breakdowns.
- When text is selected, the statistics view may also show the selection count
  without replacing the document total.
- Revision comparisons should show the change in composed word count alongside
  the textual diff.
- Exact treatment of captions, footnotes, tables, equations, code blocks, and
  appendices must be documented as deterministic counting rules so publication
  limits can be checked consistently.

### Project and file lifecycle

**Decision:** Use archive-first project management and dependency-aware file
deletion.

- A project owner can archive, restore, or permanently delete a project.
  Archiving is the ordinary removal path; permanent deletion clearly includes
  project files, collaboration state, and revision history.
- Deleting a project never deletes sources, PDFs, web snapshots, highlights, or
  notes owned by a researcher's shared library. Project-specific links to them
  are removed with the project.
- Block deletion of a file while another project file includes or otherwise
  depends on it. Show every inbound dependency and let the researcher remove or
  redirect those links first.
- The root `main.md` entry point cannot be deleted outright. A researcher can
  clear it or explicitly replace its contents, while its stable entry-point
  identity remains.
- File deletion creates an ordinary project revision. The deleted file remains
  recoverable through retained revision history unless the entire eligible
  project history is explicitly and permanently removed.

### Initial project management scope

**Decision:** Keep the first project catalog focused on common lifecycle and
orientation tasks.

- Support searching and switching projects, creating and renaming them, and
  viewing recent and archived projects.
- Support archive, restore, owner-only permanent deletion, and duplication from
  either the current revision or a named milestone.
- Include collaborator management and project settings for the root entry
  point, default citation style, and export template.
- Defer project folders, catalog labels, bulk actions, and advanced sorting
  until ordinary navigation works clearly at realistic catalog sizes.

### Onboarding and responsive scope

**Decision:** Support full authoring on desktop and iPad-class tablets, with a
focused narrow-screen experience.

- Create a new project with an empty root `main.md`, a prominent **Add file**
  action, and short dismissible examples for include and citation syntax.
- On narrow screens, replace the simultaneous columns with a single active pane
  and clear navigation among **Files**, **Editor**, **Preview**, and
  **Research**. Preserve caret, selection, PDF page, zoom, and scroll position
  while switching.
- Treat iPad as a full authoring and research target, including PDF reading,
  touch- and Apple Pencil-based highlighting, file editing, citation, and
  project navigation.
- Initially scope phones to reading, comments, reference lookup, and light text
  edits rather than compressing the complete multi-pane authoring workflow into
  an unusable layout.
- Empty states should offer the next domain action directly and avoid exposing
  implementation-oriented status panels or large blank inventories.

## Emerging Product Model

The working hierarchy is:

```text
User reference library
├── Publications and web sources
├── Metadata, tags, and reusable notes
└── Attached content and reusable highlights

Project
├── main.md            sole composition and rendered export entry point
├── Files and folders  Markdown, images, data, and other assets
└── Project links      Citations, claims, and evidence relationships
```

- The **reference library** is a user-level research-memory boundary above
  projects.
- A **project** is the sharing, collaboration, file, composition, and
  project-specific evidence boundary.
- A **file** has a stable internal identity, a mutable project-relative path,
  a kind, and canonical content or a blob.
- Folders organize files but do not assign semantic types.
- Kirjolab directly edits portable UTF-8 text assets, including Markdown,
  custom LaTeX templates, CSV/TSV data, SVG source, and lightweight structured
  configuration formats.
- Images, PDFs, office documents, and other binary assets are stored, linked,
  versioned, and previewed where supported, but Kirjolab does not present itself
  as their native content editor. PDF highlights remain non-destructive
  annotation overlays.
- `main.md` is the only root composition. Other Markdown files are included
  fragments that may also be previewed in isolation while editing.
- Files may be reused at several transclusion points within the project.
- Chapter and section boundaries remain authored Markdown rather than enforced
  file types.

This follows the useful parts of a modular LaTeX project: entry and assembly
files compose chapter or section files, while tables, figures, and generated
material can remain separate.

## Transclusion Direction

Transclusion is the underlying composition concept. `include` is the
author-facing directive name because it describes inserting file content at a
specific location more accurately than a programming-language import.

The canonical form is:

```md
# Discussion

::include[sections/90-discussion.md]

# Results

::include[tables/results.md]
```

Working semantic rules:

- Resolve project-local paths relative to the including file.
- Recursively compose Markdown as parsed blocks, not through regex or blind
  string substitution.
- Preserve file and source-range provenance through preview and export.
- Treat edits as live: changing an included file updates every composed parent.
- Diagnose missing files, include cycles, project-root escapes, unsupported
  types, excessive depth/size, and duplicate composed anchors.
- Reject remote includes initially.
- Apply frontmatter only from the root `main.md` entry file.
- Keep headings unchanged; authors control whether a heading belongs in the
  parent file or the included file.
- Use ordinary Markdown links for binary images. A Markdown figure or table
  wrapper may itself be transcluded.

MyST provides useful precedent for file-relative, recursive include semantics,
although Kirjolab uses its existing concise directive family for the canonical
spelling.

## Interface Direction

Keep the existing three-column desktop composition instead of adding another
permanent panel:

```text
┌ Project ▾                                           Share  Export ▾ ┐
├──────────────────┬────────────────────────┬─────────────────────────┤
│ Files | Research │ Active file editor     │ Composed main.md         │
│                  │                        │ preview/context          │
└──────────────────┴────────────────────────┴─────────────────────────┘
```

### Header

- Replace the quiet workspace selector with an explicit, searchable project
  menu.
- Use that project control as the single visible project title; remove the
  adjacent duplicate workspace-title text.
- Provide labelled **New project** and **Manage projects** actions.
- Do not add a document switcher in the initial file model. The active file path
  belongs in the editor header while the project header identifies the project.
- Move project creation into the project menu or expose it as a labelled action
  instead of placing an unexplained `+` between identity labels.
- Keep connection status, sharing, and export secondary to project and active
  file orientation.

### Left rail

- Provide two modes within the existing rail: **Files** and **Research**.
- Files mode shows a compact folder tree, file search, and labelled new
  file/folder actions.
- Research mode shows compact categories and counts for sources, annotations,
  claims, and references.
- Research search filters or temporarily replaces the category inventory.
- Move full metadata, repeated actions, and connection details into the
  existing research-context pane.

### Editor and preview

- Selecting a file changes the editor without changing the `main.md`
  composition root.
- The right pane continues to preview the composed `main.md` output and focuses
  the selected file's transcluded position.
- Clicking composed preview content opens its originating file and range.
- A reused file indicates which include sites reference it.
- **Create and include** creates a new fragment and inserts an include directive
  at the current caret.
- A file action can insert an existing file into the current file.

### PDF evidence capture

- Optimize evidence capture for recovering the relevant place and core idea,
  not for producing a word-perfect quotation. The selected text and page
  geometry are a source locator; an editable note captures the researcher's
  paraphrase or takeaway.
- Treat highlighting as painting. Render and persist each stroke immediately
  after pointer or Pencil release without a separate save form.
- Painting over or directly adjacent to an existing highlight extends that
  highlight instead of creating overlapping annotation records. An explicitly
  focused highlight determines which record receives an ambiguous stroke.
- Provide immediate **Undo**, whole-highlight **Delete**, and an **Eraser** tool
  that removes part of a highlight. Erasing all of its geometry deletes the
  empty highlight after an undoable confirmation period.
- Keep the active highlight visually distinct and expose a lightweight details
  surface for its selected passage and editable **Core idea** note. Writing the
  note must not be required to preserve the highlight.
- Make brush, eraser, selection, and undo controls touch-friendly and usable
  with Apple Pencil. Editing should tolerate imprecise strokes, support zoom,
  and make boundary adjustments easy rather than requiring exact initial
  selection.
- Keep a local operation history so accidental additions, erasures, merges, or
  deletions can be undone without relying on project-wide revision restore.
- Several distinct highlights can later support the same claim or manuscript
  passage; evidence grouping belongs to the linking workflow, not the painting
  gesture.
- Preserve the current rule that highlights are annotation overlays and never
  modify imported PDF bytes.

### Separate evidence capture, citation, and reference intake

- Make reading and evidence capture the default PDF workflow.
- Because PDF identification happens during intake, show the linked citation
  identity compactly without exposing enrichment controls by default.
- Keep highlighting automatic and independent of citation or manuscript
  linking. Painting must not silently add a publication, insert a citation, or
  link manuscript prose.
- Drive citation and evidence-linking actions from the current manuscript caret
  or selection. The researcher first selects prose, then chooses a publication
  or one or more existing highlights to cite or link.
- Keep **Cite publication** and **Link supporting highlight** visibly separate:
  one inserts the paper's citation; the other records the evidence relationship
  to selected prose. A combined convenience action may perform both only when
  its result is explicit in the UI.
- If no safe manuscript caret or selection exists, keep manuscript-linking
  unavailable and explain the prerequisite next to the control.
- A highlight can still offer **Use in manuscript**, which returns focus to the
  editor and asks the researcher to choose the insertion point or prose range.
- Use action language to teach the model: cite the paper, save the highlight,
  and link the evidence. Avoid relying on the user to understand the internal
  nouns first.
- Keep detailed metadata evaluation and enrichment in **Research →
  References**, where it can be handled as a deliberate library task.

### Resizable authoring and context panes

- Add a draggable separator between the file editor and research-context pane
  on desktop.
- Enforce useful minimum widths for both panes rather than allowing either one
  to collapse into unusability.
- Give the separator keyboard semantics and visible focus; arrow keys should
  resize in predictable increments.
- Double-clicking the separator should restore the balanced default.
- Remember separate split widths for composed-manuscript preview and source
  reading. A wide PDF layout must not unexpectedly narrow the normal writing
  preview. Keep both preferences as local browser state, not shared project or
  collaboration state.
- Add a discoverable **Layout** control following Overleaf's proven modes:
  **Split view**, **Editor only**, and **Context only**. Label the last mode
  **PDF only** when a PDF is active so its immediate result is unambiguous.
- Provide adjacent divider affordances to collapse or restore a pane without
  requiring the menu. Returning to split view restores the last width for that
  context.
- Consider **Open context in separate tab** later for multi-screen reading, but
  keep it outside the initial layout slice.
- Rerender the active PDF at the new available width after resizing settles so
  text remains sharp and selection geometry stays aligned.
- A later focused-reading command may collapse the editor or context pane, but
  it should complement rather than replace direct resizing.

### Single-row research-context toolbar

- Condense the context tab strip and active-resource header into one row of
  approximately 48px.
- Keep the tab list as a horizontally scrollable region on the left so Preview
  and open resources retain standard tab semantics.
- Give the tab list the flexible width and keep the active tab scrolled into
  view as other tabs overflow.
- Remove the repeated PDF title; the active tab already supplies resource
  identity and should truncate long filenames with the full name available on
  focus or hover.
- Keep active-resource controls fixed on the right so they remain reachable
  when the tab list scrolls.
- For a PDF, show a quiet inline status followed by a compact grouped page
  control: **Previous · 1 / 4 · Next**.
- Keep PDF page navigation visible whenever a PDF is active. On narrow widths,
  compress status to an icon or short label with accessible detail and move
  secondary actions such as **Pin** and **Close** into an overflow menu.
- At wider widths, retain one **Pin** and one **Close** action for the active
  resource. Remove the second panel-level Close button.
- For Preview, use the same row to show the diagnostic summary in place of PDF
  navigation.
- Keep controls labelled on spacious layouts. On narrow layouts, compact icon
  treatments still need clear accessible names and tooltips rather than
  unexplained glyphs.
- Move longer capture feedback out of the toolbar and into the nearby sticky
  evidence-draft summary so status text does not destabilize the tab layout.

A representative desktop arrangement is:

```text
[ Preview ][ vogel-354…pdf ]  Select text to capture   [ ←  1 / 4  → ] [ Pin ] [ Close ]
```

### Selection-scoped writing assistant

Separate model connection configuration from model-assisted writing:

- Move endpoint and model configuration to a local **Model connection** or
  **Assistant settings** surface.
- Keep connection endpoints, credentials, and locally installed model discovery
  in browser- or device-local settings. Never persist those secrets or private
  environment details in shared project state.
- A project may store a non-secret preferred model or task-profile name for
  reproducibility and convenience. Each collaborator resolves that preference
  through their own connection and can choose a compatible local substitute.
- Keep only a compact connection state in the authoring UI, such as **Local
  model connected** or **Configure model**.
- Replace the full-width workbench with a collapsible assistant attached to the
  editor, preferably a bottom drawer that does not permanently reduce document
  width.
- Keep the drawer quiet and collapsed until invoked. An editor selection may
  reveal a small contextual **Ask assistant** or **Revise selection** action.
- Never invoke the model merely because text was selected. Sending any
  manuscript text or evidence requires an explicit click, keyboard command, or
  submitted instruction from the researcher.
- When expanded, represent the exact selected passage and chosen evidence as
  explicit context chips rather than silently collecting surrounding content.
- Provide a bounded instruction composer plus optional quick actions such as
  **Clarify**, **Shorten**, or **Strengthen with evidence**.
- Use **Propose revision** as the primary operation. The result should continue
  opening as a reviewable candidate in Context with original, replacement, and
  provenance before any apply action.
- Keep pending and previous candidates in research context or a compact drawer
  history rather than rendering an empty candidate inventory below the whole
  workspace.
- Retain revision candidates as structured project provenance: selected source
  range, explicit evidence, instruction, non-secret model/profile identity,
  proposed replacement, author, timestamp, and accepted, rejected, or pending
  outcome.
- Applying a candidate creates an ordinary document revision linked back to
  that candidate. Candidate history supports inspection and audit but is not a
  conversational transcript.
- Preserve the current safety boundary: send only the exact selected passage,
  explicit instruction, and explicitly selected evidence; never write model
  output directly into the document.

The recommended starter is assistant-shaped rather than a general chat agent:

```text
┌ Assistant ─ Selected: 2 sentences ─ Evidence: 3 ─ Local model connected ┐
│ Improve clarity while preserving the claim and citations…               │
│                                              [ Propose revision ]        │
└───────────────────────────────────────────────────────────────────────────┘
```

A conversational transcript, open-ended document questions, automatic
retrieval, and multi-turn tool use would be a separate opt-in feature with its
own retention, sharing, and privacy controls. The current typed
`revise-selection` operation can use a familiar foldable composer without
implicitly promising those capabilities.

### Editor command bar and contextual actions

Prefer a compact, visible command bar over replacing the browser's native
right-click menu:

- Reuse the existing editor header instead of adding a tall formatting ribbon.
- Keep permanent controls limited to the active file path, **Insert**, revision
  history, document statistics, and save/sync state.
- Provide a labelled **Insert ▾** menu for scholarly constructs such as:
  - Citation
  - Cross-reference
  - Anchor or label
  - Footnote
  - Link
  - Included file
- Show the corresponding source form beside each command, for example
  **Citation · `:cite[key]`**, so using the UI teaches portable syntax rather
  than hiding it.
- Keep insertion commands in **Insert** when there is no relevant selection
  rather than promoting a growing collection of permanent buttons.
- Make commands context-aware. A caret can receive a citation or included file;
  selected text can be linked to evidence, wrapped, turned into a claim, or sent
  to the writing assistant.
- Show a small selection toolbar for transient selection-specific actions such
  as **Cite**, **Link evidence**, and **Ask assistant**.
- Preserve the editor selection when a toolbar or menu receives focus, using
  the same durable relative-selection approach required by citation insertion.
- Provide keyboard shortcuts and a searchable command palette for experienced
  users, but do not make either the only discovery path.
- Include the searchable command palette in the first editor slice. Defer a
  `/` command menu until the Markdown directives and insertion syntax are
  stable enough that it will not teach a moving command vocabulary.
- Keep button labels and tooltips explicit; avoid an unexplained row of
  word-processor icons.
- Replace the permanently disabled **Open reference** button with a contextual
  **View cited source** action that appears only when the caret is inside a
  citation. If it remains visible while unavailable, explain the prerequisite
  directly in its tooltip.
- Place document persistence at the opposite end of the command bar using
  familiar states such as **Opening…**, **Saving…**, **Saved**, **Offline**, or
  **Sync error**.
- Avoid exposing `Materialized to Markdown` as ordinary interface copy. Clean
  Markdown materialization remains an architectural guarantee, not a task the
  researcher needs to monitor.
- Keep connection/presence status distinct from save status so **Live · 1
  writer** and **Saved** communicate separate facts.

Do not make a custom right-click menu the primary solution. Replacing the
browser context menu would hide native spelling, copy/paste, lookup, and
accessibility behavior, while right-click itself is not discoverable on touch
or keyboard-only workflows. A later richer editor could optionally mirror
commands in a context menu without making them exclusive to it.

A compact editor header could become:

```text
main.md  r578   [ Insert ▾ ] [ Cite ] [ Link evidence ] [ Ask assistant ]   Saved
```

### Research graph exploration

Add an explicit **Research → Graph** destination rather than placing a graph
inside the compact source/file rail:

- Prioritize the **Citation network** in the first graph slice because it
  directly supports literature analysis. Build the broader **Project graph** as
  a subsequent view on the same typed relationship and visualization
  infrastructure.
- Offer **Explore graph** from the research navigation and from each publication
  card or publication context.
- Distinguish two honest views:
  - **Project graph** shows project files, the composed paper, linked library
    sources, highlights, claims, and their current typed relationships.
  - **Citation network** is a shared-library view of source-to-source `cites`
    edges when those relationships are actually available, with an optional
    **Current project** filter.
- Default to a focused paper view rather than rendering the complete workspace
  as an unreadable hairball.
- Selecting a publication should show its immediate incoming and outgoing
  relationships, with explicit expansion to another level.
- Begin with relationships already known in the shared library. Fetch and show
  external references or citing works only when the researcher explicitly
  expands a selected source; do not silently grow an unbounded network.
- Provide filters for resource and relation kinds, such as papers only,
  document citations, evidence links, claims, and PDF artifacts.
- Open the selected node's details in research context without losing graph
  position.
- Allow the graph to use the resizable context pane or a focused research mode;
  do not add another permanent column.
- Keep a synchronized keyboard-operable list or table alongside the visual
  graph. A spatial visualization must not become the only way to inspect or
  follow relationships.
- Label every paper-to-paper edge with its provenance and direction. Do not
  present title similarity or model inference as a known citation.
- Accept citation assertions from reviewed external metadata, parsed reference
  lists in preserved source content, and manual researcher links. Retain the
  asserting source, capture or retrieval time, extraction method, and any
  researcher review on each assertion.
- Distinguish **Confirmed**, **Extracted**, **Inferred**, and **Conflicting**
  states. Inferred relationships remain review candidates rather than silently
  becoming established citation edges.
- Preserve conflicting assertions side by side and expose their provenance;
  never choose a winner merely because one provider was queried later.

Supporting a real citation network requires an explicit publication-reference
relationship model. Reference lists may come from reviewed external metadata,
parsed source material, or manual connections, but uncertain extraction must
remain distinguishable from confirmed citations.

### Shared-source lifecycle and removal

- Add a labelled **Remove from project** action to each linked source's overflow
  menu and context. This removes the active project's source, highlight, claim,
  and evidence links but does not delete the source or its private annotations
  from the owner's shared library.
- Keep **Close tab**, **Remove from project**, **Archive in library**, and
  **Delete permanently** as separate actions with distinct language and scope.
- Before unlinking, archiving, or deletion, summarize affected resources, for
  example:

```text
Remove vogel-354….pdf?
12 highlights · 3 manuscript links · 1 reference association
```

- Allow immediate project unlinking when the source has no project dependents,
  with a short undo window. When dependents exist, state exactly which
  project-level links will be detached while the library material is retained.
- Preserve authored manuscript text and bibliographic publications unless the
  user separately chooses to edit them. Unlinking or deleting evidence must
  never silently remove citations from prose.
- Include **Archive in library** in the first lifecycle slice. Archiving hides
  the source from ordinary navigation while retaining the artifact, highlights,
  notes, and provenance required by existing links and historical milestones.
- Restrict **Delete permanently** to the library owner and keep it in the
  library details surface rather than project navigation. Before deletion,
  summarize dependencies across every current project, shared context, and
  milestone and require explicit resolution.
- Permanent deletion removes the private artifact and annotations while
  retaining tombstoned bibliographic and locator provenance wherever project or
  revision history must still explain an existing citation or evidence link.
- Revoking an explicit share stops future access to and updates from the
  owner's private library resource. It does not retroactively remove the pinned
  content and provenance already copied into project revisions while sharing
  was authorized.
- If the owner later permanently deletes the underlying private material,
  retained project snapshots degrade to tombstoned provenance according to the
  deletion contract rather than continuing to expose the deleted artifact.
- Close any open context tab for a removed artifact and update search and graph
  projections immediately.
- Make irreversible storage consequences explicit and never present a
  project-level unlink as though it deleted the library source.

### Separate test data and add legitimate collection filters

- Run E2E tests against a dedicated ephemeral persistence root or namespace
  created uniquely for each run and unable to appear in the interactive
  developer catalog.
- Reset or discard that test store as part of the test-server lifecycle rather
  than requiring every test to delete complex dependent resources.
- Allow persistent fixtures only through an explicit debugging mode with a
  clearly named, separately configured namespace and reset lifecycle. Never
  make that mode the ordinary E2E default.
- Keep a developer-facing reset command for test state, but do not expose test
  cleanup as ordinary end-user project management.
- Add search, recent items, sorting, and archive filters to the project menu for
  legitimate large catalogs.
- Add useful research-library filters such as resource type, linked/unlinked,
  annotated/unannotated, and archived.
- Make search replace or filter the active collection instead of adding another
  result stack above the unfiltered content.
- Do not add a production **Hide test data** heuristic based on names or fixture
  patterns. Correct the storage boundary so those records never enter the user
  collection.

### Reference details and organization

Make publication context the primary place to inspect and organize a reference:

- Add explicit **Edit details**, **Add tag**, and **Add note** actions.
- Provide a structured bibliographic form for citation key, type, title,
  authors, year, venue, DOI, URL, abstract, and author keywords.
- Apply bibliographic edits to the canonical shared publication record. Generate
  BibTeX from that record for interchange and project export.
- Keep metadata provenance visible so researchers can distinguish imported,
  Crossref-enriched, and manually edited values.
- Track provenance independently for every externally sourced or editable
  bibliographic field, including titles, contributors, dates, venue, publisher,
  identifiers, URLs, abstracts, and author keywords. Each accepted value keeps
  its source, retrieval or edit time, and responsible researcher when relevant.
- Researcher-created tags, notes, and reading state keep authorship and
  timestamps but do not masquerade as bibliographic-source metadata.
- Model researcher tags separately from bibliographic author keywords. Tags
  organize the reusable research library; keywords describe the publication.
- Keep researcher tags out of BibTeX `keywords` by default. Include them in an
  optional Kirjolab manifest for portable library or project archives.
- Offer an explicit export-time mapping from selected researcher tags to
  BibTeX `keywords` when requested, without mutating the canonical library
  record or conflating the two concepts afterward.
- Render tags as quiet, searchable labels and allow creating or selecting them
  directly from publication context.
- Add tag, reading-status, linked/unlinked, and metadata-completeness filters to
  the research library.
- Treat reading status such as **Unread**, **Reading**, and **Read** as a
  dedicated facet rather than forcing every workflow state into tags.
- Keep detailed organization in publication context while showing a few compact
  tags or status indicators in library rows.

A reference context could expose:

```text
The Normative Structure of Science
Merton · 1942 · The Sociology of Science

[ Edit details ] [ + Tag ] [ Add note ]
Tags: sociology  scientific-practice
Status: Reading
```

The shared library is the canonical home for reusable tags and research notes.
They remain private by default and are shared explicitly. Storing organizational
tags in BibTeX `keywords` would be portable but would conflate researcher
workflow with publication metadata.

### Export

- Replace extension-specific header buttons with one **Export ▾** menu.
- Organize menu items by scope rather than presenting a flat format list:

```text
Export
Rendered output
  PDF document
  LaTeX project (.zip)
  Composed Markdown (.md)

Project sources
  Source bundle (.zip)
  Bibliography (.bib)
```

- **PDF document** means the rendered `main.md` composition, not one of the
  imported research PDFs.
- **LaTeX project** should normally be a bundle containing generated `.tex`,
  bibliography, images, and other required assets rather than an isolated file
  with broken dependencies.
- Provide a maintained Kirjolab LaTeX template as the dependable default and
  allow a project to attach a custom publication template for journal,
  conference, or institutional requirements.
- **Composed Markdown** produces a flattened portable representation of
  `main.md` after resolving transclusions.
- Rendered outputs and the standalone `.bib` export include only publications
  cited by the composed `main.md`. Unused records from the user's shared library
  do not leak into a paper export.
- **Source bundle** preserves the folder tree, canonical source files,
  directives, assets, and a generated snapshot of the broader project-linked
  references and evidence needed for archival portability.
- Deliver the initial LaTeX project and source-bundle exports as downloadable
  ZIP archives. Direct synchronization with a local directory is a separate
  future integration with its own permissions, conflict, and lifecycle model.
- Generate PDF and LaTeX exports through the same deterministic pipeline:
  resolve the `main.md` composition, build a source-mapped intermediate
  document, materialize the selected LaTeX template and assets, and run a pinned
  typesetting toolchain.
- Map composition and typesetting diagnostics back to the originating project
  file and line where possible. A failed render opens actionable diagnostics
  while retaining the last successful preview and clearly marking it as stale.
- Keep Markdown canonical. LaTeX and PDF are derived publication targets and
  must not replace or mutate authored source.
- The initial unified menu can contain only formats that actually work; new
  targets can be added without changing the header structure.

## Architectural Implications

- The present workspace snapshot, Yjs state, SQLite row, search graph, anchors,
  revision checks, and export API all assume one source string.
- Passage anchors, model targets, diagnostics, and revisions must become
  file-qualified.
- A composed preview needs a source map from rendered ranges back to stable file
  IDs, canonical ranges, and include chains.
- Selecting across multiple transcluded files should be rejected until a
  deliberate multi-range contract exists.
- Paths should remain readable canonical Markdown references, while internal
  links and anchors use stable file identities.
- Rename and move operations must preserve identity and update inbound include
  paths atomically or retain an explicit alias strategy.
- The smallest coherent first implementation likely keeps related files in one
  project-scoped collaboration room. Per-file distributed rooms would introduce
  cross-room composition, revision-vector, and transaction complexity.
- The current workspace-scoped publication projection and canonical-BibTeX
  model must be superseded by a stable user-level publication library.
- Project citation syntax or aliases must resolve to stable shared publication
  identities while remaining portable in exported source.
- Because shared metadata can evolve after a manuscript is written, exports
  need an explicit snapshot or version policy for reproducible output.
- Revision storage must capture atomic project snapshots across files and
  project relationships. Milestones add immutable names to those revisions;
  they are not mutable copies of the project.
- Diffing must understand stable file identities so renames and moves are not
  presented as unrelated deletion and creation, and it must preserve source
  provenance in composed-paper comparisons.
- This direction changes lasting architectural constraints and therefore needs
  proposed ADRs plus multi-file composition and shared-reference-library specs
  before implementation.

## Open Questions

The UI review decision pass resolved the currently identified product
questions. Implementation discovery may surface narrower technical decisions;
record any lasting constraints in the relevant ADR and feature spec rather than
reopening this review note implicitly.
