# ADR-133: Resolve Optional Project Entry Files

**Status:** Implemented

**Date:** 2026-07-16

**Supersedes in part:**
[ADR-057](../implemented/ADR-057-compose-projects-from-main.md)

## Context

ADR-057 requires every project to contain an immutable root `main.md`. That is
convenient for Kirjolab-created papers but imposes application structure on
imported projects. A GitHub subtree may contain several useful Markdown files
without a `main.md`, or its external build system may define composition outside
the synchronized subtree.

Generating a local `main.md` during import would keep the old invariant but add
source that does not exist in the external project. Publishing it accidentally
would modify the repository's structure, while excluding it would make the
Kirjolab and GitHub trees intentionally different.

Editors such as Overleaf allow an explicit main-document setting and otherwise
infer a usable source file. Markdown has no direct equivalent to LaTeX's
`\documentclass` marker, so Kirjolab needs a simpler deterministic rule.

## Decision

The project entry setting is optional at creation and import boundaries. Every
non-empty project still resolves one stable Markdown file identity as its
effective entry before it becomes editable:

1. use the valid Markdown file explicitly selected by the owner;
2. otherwise use root `main.md` when it exists;
3. otherwise use the first Markdown file by normalized project-relative path.

The resolved stable file id is persisted. Kirjolab does not continuously rerun
the fallback when files are added, renamed, or reordered, because doing so could
silently change preview, citation reachability, statistics, and publication
output. The owner may explicitly choose a different entry file later.

Any Markdown file may be the entry, including a file in a folder. Includes
continue to resolve relative to the including file, and the selected entry is
the root for composition, source maps, citation reachability, word statistics,
history composition, and rendered exports. `main.md` has no reserved identity
after resolution; it is simply the preferred conventional default.

Deleting the effective entry requires choosing a valid replacement in the same
reviewed operation. A project must retain at least one Markdown file. Historical
revisions retain the effective entry file id that applied at that revision.

GitHub import presents the inferred entry in its preview and lets the owner
override it before confirmation. It never creates a synthetic composition file
solely to satisfy Kirjolab.

## Trigger

Designing import for `bebraw/scalability_book/book/` exposed that the selected
subtree has chapter Markdown but no root `main.md`. Requiring or generating that
filename would make GitHub synchronization more invasive than the authoring
workflow requires.

## Consequences

**Positive:**

- Existing Markdown trees can be imported without adding Kirjolab-specific
  source files.
- Conventional projects still select `main.md` automatically.
- Persisting the inferred file id prevents later tree changes from silently
  changing the publication root.
- The same explicit setting supports repositories whose entry filename follows
  another convention.

**Negative:**

- Existing project, composition, export, history, and UI code that assumes the
  path `main.md` must use the effective entry file id instead.
- Selecting the first Markdown file is deterministic but cannot infer an
  external generator's complete publication structure.
- Allowing a nested entry increases the importance of testing relative include
  and asset resolution from that file.

**Neutral:**

- A project still has exactly one effective publication root; this does not
  introduce multiple independent documents per project.
- Supporting-file Preview continues to follow ordinary file selection without
  changing the persisted effective entry.

## Alternatives Considered

### Continue requiring root `main.md`

This keeps the current implementation simple but forces imported repositories
to adopt a Kirjolab filename or accept a synthetic local-only file.

### Leave the entry unresolved until export

This avoids choosing during import, but Preview, statistics, citation
reachability, history comparison, and publication actions would have no stable
project-wide meaning in the meantime.

### Recompute the fallback on every operation

This would automatically adopt a newly added `main.md`, but an unrelated file
addition or rename could silently change the effective paper and its exports.

### Infer composition from every Markdown file

Concatenating the tree would invent semantic order from filenames and conflict
with Kirjolab's explicit include-based composition model.
