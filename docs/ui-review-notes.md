# UI Review Notes

**Status:** Provisional review notes. These observations are not an approved
feature spec or architecture decision. Revisit and refine them after the UI
review pass is complete.

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

## Emerging Product Model

The working hierarchy is:

```text
Project
├── Documents          named compositions and export targets
├── Files              Markdown, BibTeX, images, data, and other assets
└── Research library   PDFs, annotations, claims, and references
```

- A **project** is the sharing, collaboration, file, and research-library
  boundary.
- A **document** is an independently named composition with an entry file.
- A **file** has a stable internal identity, a mutable project-relative path,
  a kind, and canonical content or a blob.
- Folders organize files but do not assign semantic types.
- A Markdown file can be a complete standalone document, an included fragment,
  or both.
- Files may be reused by multiple documents in the same project.
- Chapter and section boundaries remain authored Markdown rather than enforced
  file types.

This follows the useful parts of a modular LaTeX project: entry and assembly
files compose chapter or section files, while tables, figures, and generated
material can remain separate.

## Transclusion Direction

Transclusion is the underlying composition concept. `include` is the proposed
author-facing directive name because it describes inserting file content at a
specific location more accurately than a programming-language import.

A concise candidate consistent with the existing Kirjolab directive family is:

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
- Apply frontmatter only from the document entry file.
- Keep headings unchanged; authors control whether a heading belongs in the
  parent file or the included file.
- Use ordinary Markdown links for binary images. A Markdown figure or table
  wrapper may itself be transcluded.

MyST provides useful precedent for file-relative, recursive include semantics,
although its fenced directive syntax is more verbose. Exact syntax remains an
open decision.

## Interface Direction

Keep the existing three-column desktop composition instead of adding another
permanent panel:

```text
┌ Project ▾   Document ▾                              Share  Export ▾ ┐
├──────────────────┬────────────────────────┬─────────────────────────┤
│ Files | Research │ Active file editor     │ Composed document       │
│                  │                        │ preview/context          │
└──────────────────┴────────────────────────┴─────────────────────────┘
```

### Header

- Replace the quiet workspace selector with an explicit, searchable project
  menu.
- Use that project control as the single visible project title; remove the
  adjacent duplicate workspace-title text.
- Provide labelled **New project** and **Manage projects** actions.
- Add a document switcher scoped to the active project, including **New
  document**.
- When multi-document support exists, distinguish project and document through
  a labelled breadcrumb or two clearly separate controls, for example **Project:
  Thesis ▾ / Document: Paper ▾**. Do not reuse the same title in both positions.
- Move project creation into the project menu or expose it as a labelled action
  instead of placing an unexplained `+` between identity labels.
- Keep connection status, sharing, and export secondary to project/document
  orientation.

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

- Selecting a file changes the editor without changing the active document.
- The right pane continues to preview the active composed document and focuses
  the selected file's transcluded position.
- Clicking composed preview content opens its originating file and range.
- A shared file indicates which documents include it.
- **Create and include** creates a new fragment and inserts an include directive
  at the current caret.
- A file action can insert an existing file into the current file.

### PDF evidence capture

- Render captured draft geometry immediately after pointer release using a
  visually distinct active-selection highlight.
- Keep the draft highlight visible until the researcher saves, cancels, or
  replaces the selection.
- Saving should transition the draft highlight into the normal persisted
  annotation style without a visual jump.
- Keep saved annotations visually quieter than the active draft, while a
  focused saved annotation remains distinct from both.
- Present a compact sticky capture summary close to the PDF with the selected
  quotation and explicit **Save annotation** and **Cancel** actions. Detailed
  note and linking controls may remain in the composer.
- Selecting another passage while a draft exists must explicitly replace,
  extend, or cancel the previous draft rather than silently discarding it.
- Preserve the current rule that highlights are annotation overlays and never
  modify imported PDF bytes.

### Separate evidence capture, citation, and reference intake

- Make reading and evidence capture the default PDF workflow.
- Replace the always-expanded intake form with a compact paper-identity status,
  such as **Unidentified paper · Identify**, or move it behind a disclosure or
  dedicated reference context.
- If the PDF is already linked, show its citation identity compactly without
  exposing enrichment controls by default.
- Present explicit actions close to an active highlight:
  - **Save highlight** creates or updates the annotation draft.
  - **Cite source at cursor** inserts the linked publication's citation at a
    remembered manuscript caret.
  - **Link highlight to selected prose** connects exact evidence to an exact
    authored passage.
- Keep these as visibly separate commands. Saving a highlight must not silently
  add a publication, insert a citation, or link manuscript prose.
- If **Cite source at cursor** is requested for an unidentified PDF, open the
  identification flow and then return to the pending citation action. Metadata
  acceptance should still require a final explicit citation confirmation.
- If no safe manuscript caret or selection exists, keep the relevant action
  unavailable and explain the prerequisite next to the control.
- Offer the same **Cite source** action from a saved annotation so citation does
  not depend on rediscovering the publication context.
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
- Keep the width as local browser state, not shared project or collaboration
  state.
- Rerender the active PDF at the new available width after resizing settles so
  text remains sharp and selection geometry stays aligned.
- A later focused-reading command may collapse the editor or context pane, but
  it should complement rather than replace direct resizing.

### Single-row research-context toolbar

- Condense the context tab strip and active-resource header into one row of
  approximately 48px.
- Keep the tab list as a horizontally scrollable region on the left so Preview
  and open resources retain standard tab semantics.
- Remove the repeated PDF title; the active tab already supplies resource
  identity and should truncate long filenames with the full name available on
  focus or hover.
- Keep active-resource controls fixed on the right so they remain reachable
  when the tab list scrolls.
- For a PDF, show a quiet inline status followed by a compact grouped page
  control: **Previous · 1 / 4 · Next**.
- Retain one **Pin** and one **Close** action for the active resource. Remove the
  second panel-level Close button.
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
- Keep only a compact connection state in the authoring UI, such as **Local
  model connected** or **Configure model**.
- Replace the full-width workbench with a collapsible assistant attached to the
  editor, preferably a bottom drawer that does not permanently reduce document
  width.
- Keep the drawer quiet and collapsed until invoked. An editor selection may
  reveal a small contextual **Ask assistant** or **Revise selection** action.
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
retrieval, and multi-turn tool use would be a separate feature. The current
typed `revise-selection` operation can use a familiar foldable composer without
implicitly promising those capabilities.

### Editor command bar and contextual actions

Prefer a compact, visible command bar over replacing the browser's native
right-click menu:

- Reuse the existing editor header instead of adding a tall formatting ribbon.
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
- Offer the most frequent actions directly when space permits, with the rest in
  **Insert**.
- Make commands context-aware. A caret can receive a citation or included file;
  selected text can be linked to evidence, wrapped, turned into a claim, or sent
  to the writing assistant.
- Show a small selection toolbar for transient selection-specific actions such
  as **Link evidence** and **Ask assistant**.
- Preserve the editor selection when a toolbar or menu receives focus, using
  the same durable relative-selection approach required by citation insertion.
- Provide keyboard shortcuts and a searchable command palette for experienced
  users, but do not make either the only discovery path.
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

- Offer **Explore graph** from the research navigation and from each publication
  card or publication context.
- Distinguish two honest views:
  - **Project graph** shows documents, publications, PDFs, annotations, claims,
    and their current typed relationships.
  - **Citation network** shows publication-to-publication `cites` edges when
    those relationships are actually available.
- Default to a focused paper view rather than rendering the complete workspace
  as an unreadable hairball.
- Selecting a publication should show its immediate incoming and outgoing
  relationships, with explicit expansion to another level.
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

Supporting a real citation network requires an explicit publication-reference
relationship model. Reference lists may come from reviewed external metadata,
parsed source material, or manual connections, but uncertain extraction must
remain distinguishable from confirmed citations.

### Evidence-document lifecycle and removal

- Add a labelled **Remove from project** action to each PDF's overflow menu and
  resource context. Do not hide deletion exclusively behind right-click.
- Keep **Close tab**, **Disconnect from reference**, and **Remove from project**
  as separate actions with distinct language.
- Before removal, summarize dependent resources, for example:

```text
Remove vogel-354….pdf?
12 highlights · 3 manuscript links · 1 reference association
```

- Allow immediate removal when the PDF has no dependents, with a short undo
  window if feasible.
- When dependents exist, require an explicit choice and state exactly what will
  be retained, detached, archived, or deleted.
- Preserve authored manuscript text and bibliographic publications unless the
  user separately chooses to remove them. Deleting a PDF must never silently
  remove citations from prose.
- Consider two lifecycle operations:
  - **Archive evidence** hides the PDF from ordinary library navigation while
    retaining the artifact and provenance required by existing links.
  - **Delete permanently** removes the stored artifact and applies a reviewed
    dependency policy to annotations and relationships.
- Close any open context tab for a removed artifact and update search and graph
  projections immediately.
- Restrict permanent deletion to an authorized project role and make the
  irreversible storage consequence explicit.

### Separate test data and add legitimate collection filters

- Run E2E tests against a dedicated ephemeral persistence root or namespace
  that cannot appear in the interactive developer catalog.
- Reset or discard that test store as part of the test-server lifecycle rather
  than requiring every test to delete complex dependent resources.
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
- Apply bibliographic edits back to canonical BibTeX through the existing
  collaboration/materialization boundary rather than creating a second
  authoritative metadata copy.
- Keep metadata provenance visible so researchers can distinguish imported,
  Crossref-enriched, and manually edited values.
- Model project tags separately from bibliographic author keywords. Tags
  organize the local research workflow; keywords describe the publication.
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

The recommended starting model is shared project metadata for collaborative
tags and notes, with personal reading state considered separately. Storing all
organizational tags in BibTeX `keywords` would be portable but would conflate
researcher workflow with publication metadata.

### Export

- Replace extension-specific header buttons with one **Export ▾** menu.
- Organize menu items by scope rather than presenting a flat format list:

```text
Export
Document
  PDF document
  LaTeX project (.zip)
  Composed Markdown (.md)

Project
  Source bundle (.zip)
  Bibliography (.bib)
```

- **PDF document** means the rendered active document, not one of the imported
  research PDFs.
- **LaTeX project** should normally be a bundle containing generated `.tex`,
  bibliography, images, and other required assets rather than an isolated file
  with broken dependencies.
- **Composed Markdown** produces a flattened portable representation of the
  active document after resolving transclusions.
- **Source bundle** preserves the folder tree, canonical source files,
  directives, bibliography, and assets.
- Keep Markdown canonical. LaTeX and PDF are derived publication targets and
  must not replace or mutate authored source.
- The initial unified menu can contain only formats that actually work; new
  targets can be added without changing the header structure.

## Architectural Implications

- The present workspace snapshot, Yjs state, SQLite row, search graph, anchors,
  revision checks, and export API all assume one source document.
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
- This direction changes lasting architectural constraints and therefore needs
  a proposed ADR plus a multi-file composition spec before implementation.

## Open Questions

- Use exact MyST include syntax or the concise Kirjolab/Satteri-style
  `::include[path]` form?
- Can every Markdown file act as an entry file, or should documents explicitly
  own designated entry files?
- Can one entry file back more than one named document?
- Is bibliography state project-wide, document-specific, or selectable per
  document?
- Which asset kinds should Kirjolab edit directly versus only store and link?
- How should project and file deletion work when resources are shared or
  included?
- Which project-management actions belong in the first pass?
- What are the empty-project, onboarding, mobile, and narrow-screen flows?
- Should project export use a ZIP bundle, a directory integration, or both?
- Should a new PDF selection replace the current draft or support accumulating
  several disjoint passages before saving?
- Should pane width be one global local preference or remembered separately for
  manuscript preview and PDF reading contexts?
- Should **Cite source** be available for an unsaved highlight, or only after an
  annotation has been saved?
- Should requesting a citation for an unidentified PDF preserve a pending
  action across identification, or return neutrally and require the researcher
  to initiate citation again?
- What minimum metadata is required to cite a paper when no DOI is available?
- Should document exports contain only references cited by that composition or
  the complete project bibliography?
- What is the portable LaTeX target: one generic Kirjolab template, a
  user-provided publication template, or both?
- Which deterministic rendering path should produce PDF, and how should export
  diagnostics be presented when composition or typesetting fails?
- How should the single-row context toolbar prioritize status, tabs, and page
  navigation when several resources are open or the pane is narrow?
- Should invoking the writing assistant require an explicit selection action,
  or should a quiet affordance appear automatically after text selection?
- Should model connection settings be browser-wide, user-wide, or configurable
  per project?
- Is assistant history equivalent to persisted revision candidates, or does a
  future conversational transcript need a separate retention and privacy
  contract?
- Which scholarly commands deserve permanent editor-header placement versus
  the **Insert** menu or selection toolbar?
- Should a `/` command menu complement the toolbar once the initial syntax set
  is stable?
- Should the citation network remain bounded to papers in the project library,
  or allow on-demand expansion to external publications?
- Which sources may establish publication-to-publication citation edges, and
  how should incomplete, inferred, or conflicting relationships be represented?
- Should the initial graph prioritize paper citation analysis or the broader
  project evidence-and-claims graph?
- When a PDF has dependent annotations or claim evidence, should permanent
  deletion be blocked, cascade those resources, or retain tombstoned provenance
  without the artifact?
- Is **Archive evidence** necessary in the first deletion slice, or is a clear
  dependency-aware permanent removal sufficient?
- Should local E2E state be fully ephemeral per run or use a dedicated reusable
  test store with an explicit reset lifecycle?
- Are tags and research notes shared project knowledge, personal organization,
  or both with explicit visibility?
- Should project tags be included in an optional export manifest, mapped to
  BibTeX keywords on request, or remain Kirjolab-only metadata?
- Which bibliographic fields must support per-field provenance rather than the
  current publication-level metadata source?
