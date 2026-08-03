# Feature: Companion Chapter Notes

## Blueprint

### Context

Authors often keep working notes beside the chapter they are drafting. They
need to consult those notes alongside the source without replacing the active
chapter, losing the caret, or introducing a second persistence model for prose.

### Architecture

- A companion is discovered by an exact, same-folder path convention. An
  eligible lowercase Markdown path ending in `.md` maps to the same path with
  `.notes.md` before the final extension. For example,
  `chapters/01_introduction.md` maps to
  `chapters/01_introduction.notes.md`.
- A file already ending in `.notes.md` is not an eligible chapter and cannot
  produce a nested `.notes.notes.md` companion. Uppercase `.MD` and other
  Markdown extensions do not participate in this exact convention.
- Pair discovery uses the current canonical project-relative paths. After a
  companion is resolved, reading and opening it use the file's stable identity,
  not a retained path lookup. Every accepted project snapshot reconciles the
  pair so a stale path cannot select another file or cross a workspace boundary.
- Paths remain mutable presentation data. Moving or renaming either ordinary
  file does not change its stable identity and does not implicitly move or
  rename the other file. A path change that no longer satisfies the convention
  detaches the pair; restoring matching same-folder paths attaches it again.
- When the active authored file has an authorized companion, Context exposes a
  conditional **Chapter notes** destination immediately after **Preview**. It
  is absent when no companion exists and reconciles back to Preview if the
  companion is deleted, renamed away, or becomes unauthorized.
- The Chapter notes destination renders the companion's current collaborative
  Markdown as a live, read-only view. It identifies the companion path and
  offers **Open in editor** through the existing project-file selection owner.
  Opening the destination alone does not change the active chapter, source
  focus, caret, selection, or per-file undo history. Choosing Open in editor is
  an explicit file switch and therefore may change those authoring inputs.
- When no pair exists, the existing More/File surface offers **Create paired
  notes** for an eligible active chapter. Creation uses the derived exact path
  and the ordinary project-file workflow; it does not invent an alternate
  suffix or create a duplicate after concurrent reconciliation.
- Companion notes are ordinary project Markdown files. They use the existing
  collaboration, authorization, sharing, revision history, offline recovery,
  project backup, and GitHub synchronization contracts. The convention does
  not make notes private.
- Pairing never adds an include edge and never changes the effective entry,
  Preview composition, statistics, or publication exports. As with any
  ordinary project file, only an explicit authored `::include` can place its
  content in the manuscript. Project-tree archives may still carry the file as
  ordinary project material.
- Desktop Split view renders notes in the existing Context pane. Narrow layouts
  reuse the existing Authoring/Context switch instead of adding a third pane or
  a vertically nested reader.

### Anti-Patterns

- Do not infer companions from similar basenames, headings, frontmatter, or
  fuzzy filename matching.
- Do not key an open notes view by mutable path after the companion file has
  been resolved.
- Do not replace the active chapter merely because Chapter notes becomes
  visible.
- Do not add a separate notes database, browser-local note store, third desktop
  pane, or nested editor.
- Do not include companion notes in the paper or publication export solely
  because the filename follows the convention.
- Do not silently rename or move a companion when an ordinary project file is
  renamed.

## Contract

### Definition of Done

- [x] An exact same-folder companion is discovered for eligible lowercase
      Markdown chapter paths.
- [x] An available companion appears as a live read-only Chapter notes Context
      destination directly after Preview.
- [x] Reading notes preserves the active chapter and its authoring state.
- [x] Open in editor deliberately selects the companion through the existing
      project-file workflow.
- [x] An eligible chapter without a companion offers Create paired notes through
      the existing file-action surface.
- [x] Compact layouts reuse the established Context surface.

### Regression Guardrails

- Pairing is derived from current canonical paths, while file access and UI
  reconciliation remain stable-identity and authorization scoped.
- Chapter notes remain collaborative, versioned project Markdown and never gain
  private or service-only persistence semantics.
- Activating the read view cannot mutate source selection, composition, entry
  identity, include relationships, or export output.
- A `.notes.md` file never derives another companion.

### Verification

- Pure tests cover eligible paths, nested folders, existing `.notes.md` files,
  uppercase or alternate extensions, and exact target derivation.
- Context tests cover conditional tab ordering, live rendering, stable-identity
  selection, active-authoring preservation, reconciliation after rename or
  deletion, and Open in editor routing.
- File-action tests cover missing-pair creation, exact derived paths, and
  duplicate or concurrent reconciliation.
- Browser tests cover desktop Split reading and the narrow Authoring/Context
  workflow without implicit manuscript composition.

### Scenarios

**Scenario: Read notes without leaving a chapter**

- Given: `chapters/01_introduction.md` is active and its same-folder
  `chapters/01_introduction.notes.md` companion exists
- When: the author activates Chapter notes
- Then: Context renders the live notes while the chapter, source focus, caret,
  selection, and undo history remain unchanged

**Scenario: Create a missing companion**

- Given: `chapters/02_methods.md` is active and
  `chapters/02_methods.notes.md` does not exist
- When: the author chooses Create paired notes from the file-action surface
- Then: Kirjolab creates that exact ordinary Markdown path and makes its
  Chapter notes destination available without adding an include

**Scenario: Edit a companion deliberately**

- Given: the author is reading an available Chapter notes destination
- When: they choose Open in editor
- Then: Kirjolab selects the companion's stable file identity in the primary
  editor through the ordinary project-file workflow

**Scenario: Rename detaches a conventional pair**

- Given: a chapter and companion currently satisfy the same-folder convention
- When: either file is moved or renamed without a matching explicit move of the
  other
- Then: their stable identities remain unchanged, but Chapter notes disappears
  after path reconciliation when the convention no longer matches

**Scenario: Notes stay outside publication output**

- Given: a conventionally paired notes file exists but no source explicitly
  includes it
- When: Kirjolab composes or exports the paper
- Then: the notes content is absent from the manuscript output while remaining
  available in ordinary project history and project-tree portability workflows
