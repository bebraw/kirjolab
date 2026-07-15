# ADR-112: Store Sanitized Project Templates

**Status:** Implemented

**Date:** 2026-07-15

## Context

Kirjolab can duplicate a live project or seed a new project from one retained
revision. Those operations intentionally preserve complete project state,
including research relationships and history-facing identities. A reusable
project template has a different privacy and lifecycle contract: it should
retain authored structure and publication defaults while excluding private
research, collaboration, and revision state.

The workspace catalog must remain a bounded navigation index and must not
become a manuscript store. Hidden `DocumentRoom` projects would blur normal
project authorization, history, backup, and deletion behavior. Templates also
need to survive changes to or deletion of the project from which they were
created.

## Decision

Kirjolab will represent each built-in or owner-created project template as a
versioned, sanitized `ProjectTemplateSeed`. The seed contains Markdown files,
folders, portable BibTeX, and the publication profile. It excludes PDFs,
project images, annotations, claims, comments, model candidates, private
research shares, collaborators, share links, milestones, and project history.

Built-in seeds live in the application code. Personal seeds live in a separate
owner-keyed SQLite Durable Object, not in `WorkspaceCatalog` or a hidden
`DocumentRoom`. Promoting a project copies one sanitized snapshot into that
store. Instantiation copies the selected seed into a newly authorized
`DocumentRoom` and creates an independent revision-zero project.

Templates never remain linked to their source project or to projects created
from them. Replacing a personal template is an explicit owner action that
captures a new sanitized snapshot.

## Trigger

The starter now teaches Kirjolab syntax in-project, and researchers want
different starting structures plus a way to reuse their own common project
layouts.

## Consequences

**Positive:**

- New-project choices and personal reuse share one bounded seed contract.
- Promoting a project cannot copy private evidence or collaboration state.
- Source projects and instantiated projects can change or disappear
  independently.
- Workspace navigation remains free of manuscript payloads and hidden records.

**Negative:**

- A new Durable Object binding and schema must be maintained and backed up.
- Project images are excluded initially, so image-backed boilerplate requires a
  later rights-aware binary template contract.
- Template replacement copies a complete bounded seed rather than storing a
  delta from an earlier version.

**Neutral:**

- Duplication and revision branching retain their existing complete-copy
  semantics.
- Portable BibTeX may contain public bibliographic metadata but retains no
  private-library identity or notes.

## Alternatives Considered

### Store template payloads in `WorkspaceCatalog`

Rejected because it would mix navigation metadata with versioned manuscript
content and weaken the catalog's current bounded role.

### Represent templates as hidden projects

Rejected because hidden `DocumentRoom` instances would inherit project
history, access, deletion, and backup semantics while remaining invisible to
ordinary project management.

### Reuse complete revision seeds

Rejected because revision seeds intentionally contain PDFs, annotations,
claims, research shares, comments, and other state that must not cross the
template boundary implicitly.

### Keep instantiated projects linked to templates

Rejected because automatic propagation would require merge semantics for
collaborative Markdown, paths, settings, and user-owned edits. Templates are
starting points, not dependencies.
