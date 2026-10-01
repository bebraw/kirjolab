# ADR-242: Scope Reference Imports to the Active Project

**Status:** Implemented

**Date:** 2026-10-01

**Partially supersedes:**
[ADR-156](./ADR-156-keep-bibtex-at-interoperability-boundaries.md)

## Context

The editor's Library initially shows both linked project references and
unrelated private sources. Importing a project bibliography adds its records
only to the private Library, requiring one Add action per reference before the
project can use them. For a bibliography already prepared for an existing
project, this repeats a choice the file itself expresses.

ADR-156 correctly keeps BibTeX at explicit interchange boundaries and removes
raw bibliography authoring from the project. Requiring separate per-reference
linkage after every import is unnecessary to preserve that boundary. The
owner-only project bibliography-import API already imports canonical Library
records and links them to an existing project.

## Decision

Make the existing Library reference-file workflow project-aware. In the
editor, BibTeX destination defaults to **This project**: choosing one file
imports its sources into the shared Library and links every imported source
to the current project through the existing bibliography-import API. Expose
**Library only** for private intake without project linkage. Standalone
Library import remains private; CSL JSON stays explicitly Library-only.

Keep canonical source identity and metadata in the Library. Reuse library
matches and existing project links under the current import, alias collision,
and synchronization rules. Import does not insert manuscript citations. Keep
the current owner authorization boundary rather than granting project members
write access to another person's Library.

Default the editor Library to references linked to the current project,
including uncited references. Keep the full private Library reachable through
the Project filter and identify the selected scope in the Filter summary.
Preserve deliberate filter and import-destination choices during refreshes in
the same project; reset defaults when project context changes. Standalone
Library browsing shows all private references.

The bounded import control owns destination, transport, response validation,
and local errors. The Library workspace applies a successful project snapshot
before canonical Library refresh. After import, clear other filters and show
the destination's sources: linked references for project intake, all references
for Library-only intake. Acknowledge completion even if refresh fails. These
choices are ephemeral browser view state and create no additional storage.
Successful private PDF, website, and discovery intake also reveals all
references so the new source remains inspectable before project linkage.

This partially replaces ADR-156's requirement for separate project linkage
after Library import. Its removal of raw BibTeX authoring and its explicit
interchange/export boundary remain in effect.

## Consequences

**Positive:**

- A project bibliography requires one file import rather than one Add action
  per reference.
- The editor initially presents references relevant to the current writing
  project while retaining private cross-project reuse.
- The workflow reuses existing APIs, authorization, and storage without new
  dependencies or persisted preferences.

**Negative:**

- A file containing unrelated references will link those too unless the owner
  selects Library only. The destination and its all-reference effect must be
  visible before file selection.
- Whole-library browsing requires an explicit filter change in the editor.
- Import and project linkage retain the existing multi-authority API behavior;
  this change does not introduce transactional rollback across Durable Objects.

**Neutral:**

- PDF, website, and CSL JSON intake retain their current private-library scope.
- General selection of existing references in bulk is a separate feature.

## Alternatives Considered

### Add checkboxes and an Add selected action first

This helps reuse existing Library sources but still requires selecting an
already prepared bibliography after import. It adds selection state and list
controls without addressing the simplest file-to-project path directly.

### Keep imports private and offer Add all imported afterward

This removes individual Add clicks but adds another completion step and needs
to retain an import batch for later linkage. An explicit destination before
file selection expresses the same choice through the existing project API.

### Store an independent bibliography inside each project

This duplicates reference identity and metadata, conflicting with the shared
Library authority and making corrections diverge across projects.
