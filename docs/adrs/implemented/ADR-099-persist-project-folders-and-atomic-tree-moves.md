# ADR-099: Persist Project Folders and Atomic Tree Moves

**Status:** Implemented

**Date:** 2026-07-14

**Amends:** [ADR-057](./ADR-057-compose-projects-from-main.md)

## Context

ADR-057 established a foldered project tree, but the implementation represented folders only as path segments on Markdown files. Authors could create `chapters/introduction.md`, yet they could not create an empty `chapters` folder, recover it from history, or move a whole subtree. Moving one file was possible only by editing its complete path.

Folders affect workspace snapshots, revision restore and branching, path collision rules, and relative `::include[...]` directives. Browser-only folder state would disappear on reload and could disagree between collaborators.

## Decision

Project folders have stable identities and mutable, normalized project-relative paths in the project Durable Object's SQLite storage. Existing file path prefixes are materialized during migration. Folder rows participate in project revision snapshots, restore, and revision seeds, so empty folders remain durable.

Creating a file materializes any missing ancestor folders. A folder move changes the selected folder, all descendant folder paths, and all descendant file paths in one project revision. The same transaction rewrites include directives from their old source and target locations to their new relative paths. A folder cannot move inside itself or overwrite an existing project item. Folder deletion is limited to empty folders.

The Files rail renders this durable hierarchy. File and folder path dialogs expose moving and renaming as the same operation because both change mutable project-relative paths while stable identities remain unchanged.

## Trigger

The Files rail had no control for adding folders and did not make the existing path-based file move discoverable. It also had no project-wide folder move.

## Consequences

**Positive:**

- Authors can create empty folders and reorganize complete subtrees without repairing includes manually.
- Folder identity and history survive reload, collaboration, restore, and branching.
- File and folder moves share the stable-identity model already used for rename-aware history.

**Negative:**

- Project revisions capture another SQLite table.
- Folder moves must validate every destination path and may update many Yjs texts and rows atomically.
- Folders cannot be merged by moving onto an existing path; authors must choose an unused destination.

**Neutral:**

- Folders organize source but do not affect composition order, which remains defined solely by `main.md` includes.
- Only empty folders may be deleted; recursive deletion remains deliberately explicit and out of scope.

## Alternatives Considered

### Keep folders implicit in file paths

This avoids a table, but cannot represent empty folders and leaves subtree moves without stable identity or revision semantics.

### Store folder state only in the browser

This makes the rail easy to prototype, but folders would not synchronize or survive reload, restore, and shared editing.

### Represent folders with hidden placeholder files

Placeholder files would leak implementation artifacts into a portable Markdown project and complicate composition, export, and deletion.
