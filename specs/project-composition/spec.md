# Feature: Project Composition

## Blueprint

### Context

A Kirjolab project represents one paper whose source may be divided into
user-named Markdown files and folders. The project must remain portable,
collaborative, and unambiguous about what preview and export mean.

### Architecture

- Every non-empty project has stable file identities and one persisted effective
  entry file. An explicit owner choice wins; otherwise creation prefers root
  `main.md` and then the first normalized Markdown path. Paths are mutable
  presentation data; file identities qualify evidence links and model targets.
- Project folders also have stable identities and mutable project-relative
  paths. Empty folders persist in snapshots and revision history. Creating a
  file materializes missing ancestor folders.
- Project images have stable asset identities and project-relative paths under
  the reserved durable `figures/` folder. SQLite versions their metadata while
  R2 stores their bytes outside collaborative Yjs state. SVG is accepted only
  as bounded UTF-8 XML with an `<svg>` root and no DTD, entity, script,
  embedded-document, event-handler, or external-resource constructs. SVG
  responses carry a sandboxed no-network Content Security Policy.
- Each Markdown file is a `Y.Text` inside the project's existing
  `DocumentRoom`. File content, the file tree, reference paths, and the project
  revision persist in one SQLite-backed coordination atom.
- `::include[path]` is a block directive. It resolves relative to its including
  file and may recurse. Composition retains authored headings and accepts
  frontmatter only from the effective entry.
- Include syntax inside a standalone `::: comment` block is inert: it creates no
  dependency, diagnostic, expansion, or path rewrite. The canonical comment
  text remains in composed source until the publication projection removes it.
- The pure composition engine returns composed Markdown, diagnostics,
  dependencies, and source-map spans containing stable file ids, source ranges,
  output ranges, and include chains.
- The live Preview uses those spans to translate disposable rendered-element
  offsets into file-qualified source positions for bidirectional navigation.
  Repeated includes remain distinct output occurrences and resolve to the
  occurrence nearest the current Preview viewport.
- Recursive expansion tracks the active include chain by stable file identity.
  When an include targets an identity already on that chain, composition omits
  only that cyclic edge from expansion, emits a navigable diagnostic with the
  complete route, and continues valid surrounding and sibling content for
  preview and recovery. The authored dependency edge remains recorded, and the
  same file may be expanded again outside the active chain.
- Any composition diagnostic—including a cycle, invalid, duplicate, or missing
  path, or resource-limit violation—invalidates normal publication exports. A
  depth violation terminates that branch; more than 512 distinct files or more
  than 2 MiB of output stops composition globally. The active include chain may
  contain at most 32 files.
- A file move or rename updates affected include paths in the same revision. A
  folder move atomically changes its descendant folder and file paths and
  rewrites includes and project image references relative to both moved sources
  and targets. Destinations cannot collide or sit inside the folder being moved. File deletion is
  rejected while an inbound include remains; folder deletion is limited to
  empty folders. The entry may be renamed, but deleting it requires selecting
  another entry first.
- Preview follows file selection. Selecting the effective entry shows the composed paper;
  selecting a supporting Markdown file shows only that file's authored content
  without expanding its includes. Its headings retain the numbers assigned by
  the file's first source-mapped occurrence in the entry composition, including
  numbering changes caused by nested includes; an untranscluded file numbers
  itself locally. A quiet context label identifies the active path and whether
  Preview is composed or isolated. Markdown export, word
  statistics, history, project search, and every publication path continue to
  compose from the persisted effective entry.
- The workspace exposes project files as a dedicated navigation mode, separate
  from research inventory. Files is the default rail mode so the workspace
  opens with its authored structure visible. The file navigator uses one
  direct heading and omits redundant list counts, sort labels, and extension
  badges; the entry file remains visibly identified because it defines the
  composition root. Supporting paths render as a compact hierarchy. File
  selection lives in this default-visible navigator instead of a duplicate
  authoring-toolbar dropdown. File creation remains available from both the
  navigator and the active-file toolbar. The navigator directly exposes folder
  creation and contextual folder move, rename, and empty-delete actions. The
  three primary navigator creation actions use compact file, folder, and image
  icons with accessible names and native titles. The file toolbar labels its
  editable path action as **Move or rename file**.
- A visible, client-side Files filter matches complete file, folder, and asset
  paths without changing the project tree or include menu. `Command-P` or
  `Control-P` expands the desktop rail when necessary, activates Files, and
  focuses the filter; Enter opens the first matching Markdown file.
- A fresh starter project includes one supporting Markdown file transcluded
  from `main.md`, making the portable include syntax and composed result
  discoverable, plus an empty `figures/` folder that exposes the image
  convention before the first upload. It also includes an untranscluded
  `KIRJOLAB.md` guide describing the tool, standard Markdown surface, custom
  scholarly directives and their options, project composition, images, and a
  practical research workflow. The guide is visible in Files but remains out
  of manuscript preview and publication exports.
- The Files rail accepts multiple PNG, JPEG, GIF, WebP, AVIF, or constrained SVG
  images of at most 20 MiB each. It inserts a relative Markdown image reference
  at the collaborative caret. Preview resolves that path relative to the
  originating source-map span, including references authored in supporting
  files. Project-tree action menus remain within the rail so every image and
  folder action label stays visible and interactive. Deleting a supporting
  file, an empty folder, or an image hides it immediately but delays the server
  operation for six seconds; an announced message offers **Undo** throughout
  that grace period.
- The authoring toolbar inserts an existing file with a path relative to the
  active file. **Create and include** creates a supporting file and inserts its
  directive at the remembered collaborative caret, so authors do not have to
  type or repair project-relative paths by hand. Existing-file actions pair a
  safely truncated path with the compact `::include[…]` hint; the complete path
  and inserted directive remain available through native titles.
- Publication exports consume the versioned source-mapped intermediate defined
  by `specs/export-pipeline/spec.md`; no target may reimplement include
  expansion or front-matter offset handling.
- Stable file identities also qualify rename-aware history. A historical
  composition resolves the retained entry identity and file tree from that exact
  logical revision rather than current paths or content.

### API Contracts

- `GET /api/workspaces/{id}` includes `entryFileId`, `files`, `folders`, and the current
  `composition` alongside a compatibility `source` field for the effective entry.
- `PATCH /api/workspaces/{id}/settings` accepts an owner-selected `entryFileId`.
- `POST /api/workspaces/{id}/files` creates a supporting Markdown file from a
  bounded project-relative path and optional bounded content.
- `PATCH /api/workspaces/{id}/files/{fileId}` renames a supporting file and
  atomically rewrites inbound include directives.
- `DELETE /api/workspaces/{id}/files/{fileId}` deletes only an unreferenced
  supporting file.
- `POST /api/workspaces/{id}/folders` creates a durable folder and missing
  ancestors from a bounded project-relative path.
- `PATCH /api/workspaces/{id}/folders/{folderId}` moves or renames a folder
  subtree and atomically rewrites affected include directives.
- `DELETE /api/workspaces/{id}/folders/{folderId}` deletes only an empty folder.
- `POST /api/workspaces/{id}/assets` accepts a bounded supported image body and
  a percent-encoded `X-File-Path` below `figures/`, returning the updated
  project. SVG must pass the active-content and external-resource validator.
- `GET /api/workspaces/{id}/assets/{assetId}` authorizes through workspace
  membership and serves the image with its stored media type and `nosniff`.
- `DELETE /api/workspaces/{id}/assets/{assetId}` removes current metadata and
  stored bytes. The `figures/` folder itself cannot be moved or deleted.
- Passage-link and model-candidate inputs carry `fileId`; persisted selectors
  retain it with their Yjs relative positions.

### Anti-Patterns

- Do not infer composition order from lexical file order.
- Do not treat an isolated supporting-file preview as an independent document
  or export root.
- Do not resolve paths outside the project or silently omit invalid includes.
- Do not rewrite heading levels or merge included frontmatter into root
  metadata.
- Do not anchor durable relationships only to a mutable path or composed
  offset.
- Do not persist Preview DOM offsets as composition or manuscript state.

### Validation

- Pure tests cover nested relative includes, frontmatter, source maps, direct
  and indirect cycles, valid repeated and diamond includes, missing paths, path
  normalization, inbound rewrite, resource bounds, and export refusal for
  invalid composition.
- Workers tests cover migration, stable entry identity, project-wide
  persistence, composition, atomic file and folder moves, durable empty
  folders, guarded deletion, and file-qualified
  anchors in a real `workerd` runtime. Project-history tests cover retained
  file identity across rename, composed diffs, non-destructive restore, and
  revision seeds.
- Browser coverage verifies that authors can insert an existing file and create
  a new file at a remembered caret, select it through the file tree to isolate
  its Preview without changing the persisted publication root, and that Files
  is the initial rail mode. Compact split-width coverage verifies that toolbar
  controls remain fully visible without a duplicate file dropdown and that
  include-action help cannot overlap its file path.
- Browser coverage verifies live path filtering, first-match opening, and the
  cross-platform quick-open shortcut from a collapsed desktop rail.
- Workers and browser coverage verify that a fresh project exposes the syntax
  guide and transclusion demo as real supporting files while composing neither
  diagnostics nor guide prose into the paper.
- Domain and browser coverage verify safe SVG acceptance, active or externally
  referenced SVG rejection, sandboxed serving, preview, and source export.

## Current Milestone

- Implemented: optional explicit entry selection with `main.md`/first-file fallback, starter syntax guide, discoverable starter transclusion, durable Markdown folder tree, recursive composition,
  source maps and diagnostics, file management API/UI, composed preview/export,
  project-wide revisions, and file-qualified manuscript/model anchors.
- Implemented: project image upload, durable `figures/` assets, Markdown
  insertion, composed live preview, backup references, and source-archive bytes.
- Deferred: drag-and-drop tree reordering, public-share image serving, and
  publication PDF/LaTeX image embedding. These do not change text composition.
