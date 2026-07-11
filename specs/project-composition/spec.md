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
  anchors in a real `workerd` runtime.

## Current Milestone

- Implemented: Markdown file tree, canonical `main.md`, recursive composition,
  source maps and diagnostics, file management API/UI, composed preview/export,
  project-wide revisions, and file-qualified manuscript/model anchors.
- Deferred: binary asset management and a graphical folder tree. These do not
  change the composition contract.
