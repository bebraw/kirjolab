# ADR-061: Preserve Project Revisions and Milestones

**Status:** Proposed

**Date:** 2026-07-11

## Context

ADR-037 requires recoverable materialized history, but the current workspace
revision is effectively one advancing source number. A multi-file project also
contains citation aliases, claims, evidence links, and snapshots of shared
metadata. Versioning only `main.md` or each file independently cannot reproduce
the paper as collaborators understood it at submission or publication time.

Researchers need automatic recovery during ordinary writing and durable names
for meaningful states such as submissions, reviewer responses, accepted
manuscripts, and published versions. They also need to compare any two states
without rewriting history when an older state is restored.

## Decision

Kirjolab will record automatic, atomic project revisions. Each logical revision
captures the project file tree and file contents, project citation aliases,
claims, evidence relationships, project settings, and the shared-reference
metadata or source snapshots required to reproduce that state.

Researchers may attach an immutable name and optional description to any
revision. These milestone names behave like Git tags: they identify one exact
snapshot and later work creates new revisions or milestones rather than
changing the tagged state.

Historical views are read-only. Restoring a revision creates a new head revision
with the restored contents while preserving the intervening timeline. A
revision or milestone may also seed a new project for substantially divergent
work.

Kirjolab will support file-tree, rename-aware per-file, and composed `main.md`
diffs between retained revisions. Text files receive semantic text diffs.
Binary files initially receive side-by-side inspection with content identity,
size, type, dimensions or page count, and metadata changes.

Every user-visible logical revision and named milestone is retained indefinitely
unless the project owner explicitly removes eligible history. Internal CRDT
updates and storage deltas may be compacted only when exact retained content,
identity, provenance, restoration, and diff behavior remain unchanged. Named
milestones are never removed by automatic retention.

This decision extends ADR-037's recoverable materialization boundary from one
document to an atomic composed project. It does not make CRDT operation logs the
user-facing history model.

## Trigger

The UI review identified paper history, named versions, and revision-to-revision
diffs as requirements for revisiting publication milestones.

## Consequences

**Positive:**

- Submissions and published states remain reproducible after later source,
  metadata, and evidence changes.
- Non-destructive restore preserves a complete audit trail.
- Project-wide snapshots avoid impossible combinations of independently
  versioned files and relationships.
- Named milestones provide stable human references without exposing storage
  implementation details.

**Negative:**

- Atomic revision capture across text, files, relationships, and shared-source
  snapshots adds storage and transaction complexity.
- Indefinite logical history requires compaction, deduplication, quota, and
  explicit owner-deletion policies.
- Composed and rename-aware diffs need source maps and stable file identities.

**Neutral:**

- Fine-grained CRDT updates remain an internal convergence mechanism rather than
  one visible revision per keystroke.
- Removing an active file creates a revision; it does not erase that file from
  earlier retained history.

## Alternatives Considered

### Version only `main.md`

This misses transcluded files, assets, aliases, relationships, and shared
metadata needed to reproduce the paper.

### Keep independent history per file

Per-file history is useful for inspection but cannot identify one coherent
cross-file publication state without an additional project snapshot.

### Delegate history entirely to an external Git repository

Git expresses the model well, but requiring every researcher and collaborator
to manage repositories would make core recovery, milestones, and permissions an
external prerequisite.

### Move the working head backward on restore

This resembles a destructive reset and obscures intervening work. Creating a
new head preserves both recovery and auditability.
