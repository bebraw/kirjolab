# ADR-058: Use a Shared Reference Library

**Status:** Proposed

**Date:** 2026-07-11

## Context

ADR-044 and ADR-051 keep one workspace's BibTeX text canonical and materialize
workspace-scoped publication projections from it. That boundary made the first
vertical slice portable, but it requires researchers to maintain duplicate
bibliographies and metadata corrections across every paper. Notes, tags, PDFs,
and highlights attached to one workspace also cannot become reusable research
memory elsewhere.

Citation keys are author-facing aliases. They can collide across papers and
different projects may reasonably prefer different naming conventions for the
same publication. They are therefore unsuitable as library-wide identities.

Kirjolab must preserve portable bibliography export without making a
project-local `.bib` file the authoritative copy of shared research metadata.

## Decision

Kirjolab will maintain one user-scoped reference library above projects. Each
source has a stable internal identity. Bibliographic metadata, external
identifiers, researcher notes, tags, attached PDFs, and reusable highlights
refer to that identity rather than being copied into every project.

The shared library is the authoritative working representation for reference
metadata. Every externally sourced or editable bibliographic field retains its
own provenance, retrieval or edit time, and responsible researcher where
applicable. Source-type validation follows BibTeX entry types and their
type-specific required and recommended fields; a DOI is not mandatory when the
selected type can be identified honestly without one.

PDF intake must identify or manually describe the source before it becomes an
ordinary library item. Automatic extraction and metadata services may suggest
matches and values, but the system must expose uncertainty, detect likely
duplicates, and never invent missing fields.

Projects link to stable library identities and assign project-local citation
keys. Renaming a project alias updates project source without renaming or
duplicating the library record.

BibTeX becomes a derived interchange and export representation. Generated
BibTeX uses project aliases and snapshots the relevant library metadata. Normal
paper exports include only sources cited by the composed `main.md`; archival
source bundles may include a broader explicit project-linked snapshot.

If accepted, this decision supersedes ADR-044 and ADR-051 where they make
workspace BibTeX canonical and publication projections workspace-scoped. Their
stable internal publication identity, portable export, bounded parsing, and
explicit metadata-provenance principles remain applicable. It also supersedes
ADR-055's DOI-only, workspace-BibTeX intake boundary while retaining reviewed,
non-fabricated metadata acceptance and explicit PDF association.

## Trigger

The UI review established that researchers reuse references and notes across
papers and consider per-project bibliography maintenance a recurring source of
drift and lost work.

## Consequences

**Positive:**

- Metadata corrections, PDFs, highlights, tags, and notes become reusable across
  every project.
- Stable source identity is independent of project-specific citation aliases.
- Generated `.bib` files preserve interoperability without creating divergent
  authoritative copies.
- Per-field provenance can represent imported, fetched, and manually corrected
  values honestly.

**Negative:**

- Shared-library persistence, authorization, deduplication, and cross-project
  lookup require a new coordination boundary above project rooms.
- Project exports must snapshot evolving shared metadata to remain reproducible.
- Migrating existing workspace BibTeX and publication rows requires identity
  reconciliation and conflict handling.

**Neutral:**

- BibTeX remains supported, but as interchange and derived export rather than
  live project authority.
- Researcher workflow tags remain separate from publication author keywords.

## Alternatives Considered

### Keep one canonical BibTeX file per project

This preserves the current implementation but repeats metadata, PDFs, notes,
and corrections across papers and cannot provide shared research memory.

### Keep one user-wide canonical BibTeX file

A single file is portable, but concurrent edits, per-field provenance,
attachments, private notes, aliases, and selective sharing do not fit cleanly
inside BibTeX text.

### Use citation keys as global source identities

Keys are readable but mutable, collision-prone, and subject to project-specific
author preferences.

### Copy a library record into each project when cited

Copies make projects self-contained but immediately recreate the metadata drift
that the shared library is intended to remove.
