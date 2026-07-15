# ADR-118: Render the Remembered Editor Target

**Status:** Implemented

**Date:** 2026-07-15

## Context

Writing-assistant, citation, evidence-linking, and syntax insertion actions act
at a manuscript caret or selection. Kirjolab already retains that target as
Yjs-relative positions when focus moves into Context, but the native textarea
stops showing it after blur. A hidden target makes contextual actions feel
unpredictable and encourages unsafe fallback to the textarea's current numeric
offset.

## Decision

- Treat the most recently focused manuscript caret or selection as the local
  authoring target for the active file.
- Keep both ends as Yjs-relative positions and resolve them against the current
  collaborative document before display or use.
- Paint the resolved local target in the existing source-highlight layer, with
  a distinct local-author color, alongside remote collaborator presence.
- Show the active path, line range, and caret or selection length in persistent
  editor chrome. Native selection remains authoritative while the textarea has
  focus; the derived layer keeps the target visible after focus moves.
- Reset the target to the start of a newly selected file rather than carrying a
  position across file identities.

## Consequences

- Contextual actions expose their insertion or replacement location before
  they run.
- Collaborative edits can move the remembered target without leaving a stale
  integer offset.
- The shared highlight projection now distinguishes local and remote presence.
- Overlapping local and collaborator selections still use one text projection,
  so the local target takes visual precedence where their ranges intersect.

## Alternatives Considered

Relying on native textarea selection requires the editor to retain focus and
hides context as soon as the user enters Writing assistant. Copying numeric
offsets into each feature duplicates stale-position handling. A separate
absolutely positioned editor overlay would repeat layout and scroll logic that
the source-highlight layer already owns.
