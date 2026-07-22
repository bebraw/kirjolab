# ADR-161: Filter and Quick-Open Project Files

**Status:** Implemented

**Date:** 2026-07-22

## Context

Files is the default project navigator, but its compact hierarchy previously
required visual scanning. That is adequate for a starter project and becomes
slow as supporting chapters, notes, figures, and assets accumulate. A global
command palette would address file navigation but also introduce an extensible
command registry, ranking model, and modal interaction before those broader
needs are established.

## Decision

- Add one visible client-side path filter to the Files rail. It filters file,
  folder, and asset rows without filtering the editor's include menu or
  changing canonical project data.
- Treat `Command-P` and `Control-P` as a bounded project-file quick-open
  shortcut in workspace mode. It expands the desktop project rail, selects
  Files, focuses the filter, and leaves dialogs and Library mode alone.
- Let Enter open the first matching Markdown file and return focus to the
  editor. Escape clears a non-empty filter.
- Keep search input, matches, and focus transient. They do not enter workspace
  URLs, local storage, collaboration, or server state.

## Consequences

- Large file trees remain navigable without another route or dependency.
- Pointer and keyboard workflows share one visible control.
- The browser's Print shortcut is replaced by quick open while the workspace
  has focus; printing remains available through browser menus.
- Broader command search remains deferred until actions beyond file navigation
  demonstrate a concrete need.

## Alternatives Considered

### Add a global command palette

This offers a general extension point but adds substantially more interaction
and maintenance surface than project-file navigation currently requires.

### Filter only displayed file names

Matching complete paths lets a researcher find nested material by folder name
even when each row displays only its compact basename.

### Persist the query

A file query is incidental navigation state. Restoring it after refresh would
hide project rows unexpectedly and does not describe a shareable location.
