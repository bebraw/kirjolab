# ADR-214: Read Paired Chapter Notes in Context

**Status:** Implemented

**Date:** 2026-08-03

**Amends:** [ADR-053](./ADR-053-use-a-tabbed-research-context-pane.md)

## Context

Authors often keep chapter-specific working notes in files such as
`01_introduction.notes.md`. Those notes need to remain portable project material,
but switching the primary editor between chapter and notes makes comparison
slow and loses the immediate caret context.

Kirjolab already has a context pane for material consulted while writing and an
ordinary collaborative Markdown-file model. Adding another persistence type or
another permanent pane would duplicate those authorities and reduce the space
available to the manuscript.

## Decision

Recognize an exact same-folder companion convention: an eligible lowercase
`chapter.md` maps to `chapter.notes.md`. Files already ending in `.notes.md` do
not derive nested companions.

Discover a pair from current canonical paths, then address the resolved notes
file by stable project-file identity. File paths remain mutable: renaming or
moving either file does not automatically rename the other, and a path change
that breaks the convention detaches the pair until matching paths are restored.

When the active chapter has an authorized companion, add a conditional
**Chapter notes** Context destination immediately after Preview. Render the
companion's live collaborative Markdown read-only, preserve the active chapter
and caret while reading, and expose an explicit **Open in editor** action that
reuses the primary project-file editor. When the pair is absent, expose
**Create paired notes** through the existing More/File surface.

Companion notes remain ordinary collaborative, versioned, shared project files.
The naming convention never creates an include, changes the effective entry,
or implicitly adds notes to manuscript composition or publication exports.
Desktop and compact layouts reuse the established Context behavior.

## Trigger

A chapter-writing workflow exposed that authors want to consult a separate
notes file beside the source without repeatedly switching files or adding a
third workspace surface.

## Consequences

**Positive:**

- Authors can compare a chapter with live collaborative notes while preserving
  their exact authoring position.
- Notes retain the existing portable project-file, collaboration, history,
  sharing, backup, and GitHub synchronization contracts.
- Exact path derivation keeps the relationship understandable outside Kirjolab,
  while stable identity prevents rename-era or stale-snapshot misselection.
- Reusing Context preserves the established desktop and compact navigation
  model.

**Negative:**

- Authors must use the exact lowercase `.notes.md` suffix and same folder for
  automatic discovery.
- Renaming or moving only one member detaches the pair until the paths match
  again.
- A conditional Context destination changes with active-file selection and must
  reconcile safely when a collaborator renames or deletes the notes file.

**Neutral:**

- Notes are shared with authorized project collaborators; the feature does not
  create private personal notes.
- An author can still explicitly include a notes file because it remains
  ordinary Markdown, but pairing alone has no composition effect.
- Open in editor intentionally replaces the active source file; merely reading
  Chapter notes does not.

## Alternatives Considered

### Add a collapsible shelf below the editor

This keeps notes near the source, but consumes scarce vertical space, creates
nested scrolling, and introduces another responsive surface. Context already
owns read-along material and adapts to narrow layouts.

### Switch the primary editor between Chapter and Notes

A `Chapter | Notes` switcher would be compact, but it prevents simultaneous
reading and writing and turns routine consultation into repeated file switches.
The explicit Open in editor action retains that workflow when editing is needed.

### Rename or move both files automatically

This would preserve pairing after a chapter rename, but makes an ordinary file
operation mutate a second source implicitly and complicates collision handling.
Recomputing the convention from explicit canonical paths keeps moves reviewable.

### Store notes as a dedicated service resource

A separate notes table could model an explicit relationship independent of
paths, but would make prose less portable and duplicate collaboration, history,
sharing, and editor behavior already supplied by project Markdown files.
