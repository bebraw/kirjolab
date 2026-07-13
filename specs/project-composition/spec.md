# Feature: Project Composition

## Blueprint

### Context

A Kirjolab project represents one paper whose source may be divided into
user-named Markdown files and folders. The project must remain portable,
collaborative, and unambiguous about what preview and export mean.

### Architecture

- Every project has stable file identities and exactly one root entry file at
  `main.md`. Paths are mutable presentation data; file identities qualify
  evidence links and model targets.
- Each Markdown file is a `Y.Text` inside the project's existing
  `DocumentRoom`. File content, the file tree, reference paths, and the project
  revision persist in one SQLite-backed coordination atom.
- `::include[path]` is a block directive. It resolves relative to its including
  file and may recurse. Composition retains authored headings and accepts
  frontmatter only from `main.md`.
- The pure composition engine returns composed Markdown, diagnostics,
  dependencies, and source-map spans containing stable file ids, source ranges,
  output ranges, and include chains.
- Composition stops on cycles, unsafe paths, more than 32 levels, more than 512
  distinct files, or more than 2 MiB of output.
- Rename updates every inbound include path in the same revision. Delete is
  rejected while an inbound include remains. `main.md` cannot be renamed or
  deleted.
- Preview and Markdown export always compose from `main.md`; selecting a
  supporting file changes the editor, not the publication root.
- The workspace exposes project files as a dedicated navigation mode, separate
  from research inventory. The entry file is visibly identified, supporting
  paths are sorted for scanning, and file creation is available from both the
  file navigator and the active-file toolbar.
- A fresh starter project includes one supporting Markdown file transcluded
  from `main.md`, making the portable include syntax and composed result
  discoverable without changing existing projects during migration.
- The authoring toolbar inserts an existing file with a path relative to the
  active file. **Create and include** creates a supporting file and inserts its
  directive at the remembered collaborative caret, so authors do not have to
  type or repair project-relative paths by hand.
- Publication exports consume the versioned source-mapped intermediate defined
  by `specs/export-pipeline/spec.md`; no target may reimplement include
  expansion or front-matter offset handling.
- Stable file identities also qualify rename-aware history. A historical
  composition resolves the retained `main.md` and file tree from that exact
  logical revision rather than current paths or content.

### API Contracts

- `GET /api/workspaces/{id}` includes `entryFileId`, `files`, and the current
  `composition` alongside the compatibility `source` field for `main.md`.
- `POST /api/workspaces/{id}/files` creates a supporting Markdown file from a
  bounded project-relative path and optional bounded content.
- `PATCH /api/workspaces/{id}/files/{fileId}` renames a supporting file and
  atomically rewrites inbound include directives.
- `DELETE /api/workspaces/{id}/files/{fileId}` deletes only an unreferenced
  supporting file.
- Passage-link and model-candidate inputs carry `fileId`; persisted selectors
  retain it with their Yjs relative positions.

### Anti-Patterns

- Do not infer composition order from lexical file order.
- Do not treat supporting files as independent documents or export roots.
- Do not resolve paths outside the project or silently omit invalid includes.
- Do not rewrite heading levels or merge included frontmatter into root
  metadata.
- Do not anchor durable relationships only to a mutable path or composed
  offset.

### Validation

- Pure tests cover nested relative includes, frontmatter, source maps, cycles,
  missing paths, path normalization, inbound rewrite, and resource bounds.
- Workers tests cover migration, stable entry identity, project-wide
  persistence, composition, atomic rename, guarded deletion, and file-qualified
  anchors in a real `workerd` runtime. Project-history tests cover retained
  file identity across rename, composed diffs, non-destructive restore, and
  revision seeds.
- Browser coverage verifies that authors can insert an existing file and create
  a new file at a remembered caret without changing the `main.md` composition
  root.
- Workers coverage verifies that a fresh project exposes the transclusion demo
  as a real supporting file and composes it without diagnostics.

## Current Milestone

- Implemented: discoverable starter transclusion, Markdown file tree, canonical `main.md`, recursive composition,
  source maps and diagnostics, file management API/UI, composed preview/export,
  project-wide revisions, and file-qualified manuscript/model anchors.
- Deferred: binary asset management and a graphical folder tree. These do not
  change the composition contract.
