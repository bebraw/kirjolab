# ADR-057: Compose Projects From a Root Main File

**Status:** Partially superseded by
[ADR-113](./ADR-113-follow-preview-file-selection.md) and
[ADR-133](./ADR-133-resolve-optional-project-entry-files.md)

**Date:** 2026-07-11

## Context

Kirjolab currently coordinates one manuscript source string per workspace. That
model cannot represent the modular authoring structure researchers commonly use
for long papers: chapters and sections in separate files, with figures, tables,
data, and templates organized in user-defined folders.

Introducing a first-class document object above files would add another identity
and navigation layer even though the reviewed workflow needs one paper per
project. Treating every Markdown file as an independent export root would make
composition and project orientation ambiguous.

The source must remain portable Markdown under ADR-035. Includes therefore need
readable paths in authored source while internal relationships, revision
history, and rename handling use stable file identities.

## Decision

Each project will be a foldered file tree with exactly one root `main.md` entry
point. `main.md` is the sole composition and rendered-export root. Supporting
Markdown files are editable and previewable but do not become independent
top-level documents or publication targets.

Kirjolab will use the block directive `::include[path]` for transclusion. Paths
resolve relative to the including file. Includes may recurse and retain source
provenance. Expansion tracks the active include chain by stable file identity;
when a target already appears on that chain, the authored dependency remains
recorded, but that edge is omitted from expansion and receives a navigable cycle
diagnostic. Valid surrounding and sibling content continues composing for
preview and recovery, while any composition diagnostic blocks normal
publication exports. The same file may be expanded again through a separate
non-cyclic branch. Explicit depth and resource bounds provide independent
termination. Frontmatter applies only from root `main.md`; included headings
remain authored content rather than being rewritten by the composition engine.

Files will have stable internal identities and mutable project-relative paths.
Authored include paths remain canonical Markdown. Rename and move operations
must update inbound paths atomically or retain an explicit resolvable alias.
The composed representation must provide a source map back to file identities,
ranges, and include chains.

Related project files will share one project-scoped collaboration and revision
atom initially. If accepted, this changes the coordination atom in ADR-040 from
one source document to one composed project while preserving Markdown
materialization and conflict-resolving text collaboration.

## Trigger

The UI review found no clear way to add multiple manuscript files and confirmed
that researchers expect a LaTeX-like folder structure assembled by
transclusion.

## Consequences

**Positive:**

- Long papers can use user-defined files and folders without imposed chapter or
  section types.
- One visible entry point keeps preview, export, navigation, and collaboration
  orientation unambiguous.
- Relative include syntax remains readable outside Kirjolab.
- Source maps allow preview navigation, diagnostics, revisions, and model
  operations to retain exact file provenance.

**Negative:**

- Workspace snapshots, collaboration state, anchors, APIs, indexes, and exports
  must become file-qualified.
- Rename, move, and delete operations require dependency analysis and atomic
  include maintenance.
- Recursive composition needs cycle detection, resource bounds, and useful
  multi-file diagnostics.
- A broken composition may return bounded partial content for diagnosis, so
  publication paths must reject it rather than treating it as a complete paper.

**Neutral:**

- Lexical file ordering remains predictable, but composition order comes from
  `main.md`, not the file tree.
- Binary assets remain linked files rather than transcluded Markdown unless a
  text wrapper is included.

## Alternatives Considered

### Add named documents with independent entry files

This supports several publications in one project but introduces document
identity, switching, permissions, and export scope that the reviewed one-paper
project model does not need.

### Allow every Markdown file to be an export root

This makes small files convenient but leaves collaborators and automation
without one authoritative project composition.

### Enforce chapter and section file types

This could standardize navigation, but researchers organize papers differently
and ordinary Markdown headings already express semantic structure.

### Adopt fenced MyST include syntax

MyST provides useful semantic precedent, but its fenced spelling is more verbose
than Kirjolab's existing one-line directive family.
