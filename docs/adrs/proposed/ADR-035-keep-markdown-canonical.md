# ADR-035: Keep Markdown as the Canonical Authored Representation

**Status:** Proposed

**Date:** 2026-07-10

## Context

Kirjolab needs fast preview, semantic validation, collaboration, comments,
cross-references, citations, and model-assisted revisions. Each capability may
benefit from a specialized representation such as a syntax tree, collaboration
document, rendered HTML, or search index.

If one of those supporting representations becomes canonical, authored work can
become difficult to inspect, version, export, or use without Kirjolab. The
scientific-writing syntax already expresses citations, references, aliases, and
anchors as meaningful Markdown and validates them at build time.

## Decision

Markdown source will be the canonical authored representation for documents.
Bibliography data will likewise remain available in a portable bibliographic
format.

Kirjolab will parse source into a semantic syntax tree carrying source ranges,
validate it against workspace resources, and derive previews and indexes from
it. Parsed trees, rendered output, search indexes, embeddings, and caches will be
rebuildable rather than authoritative.

Editor, preview, diagnostics, comments, and model patches will refer back to
source ranges and stable semantic resource identities where applicable.

## Trigger

The architectural vision requires a WYSIWYM editor that supports extended
Markdown while preserving work independently of Kirjolab.

## Consequences

**Positive:**

- Documents remain readable, versionable, and exportable with ordinary tools.
- Rendering and indexing implementations can change without migrating authored
  content to a new proprietary format.
- Model suggestions can be represented as reviewable source patches.
- The parser and validator become reusable domain components shared by editing,
  preview, export, and automation.

**Negative:**

- Structured edits must preserve acceptable Markdown formatting and source
  positions.
- Some rich interactions are harder than they would be with a proprietary
  editor document model.
- Incremental parsing and range reconciliation require explicit engineering.

**Neutral:**

- Collaboration state may use a specialized internal representation, but it
  must materialize to canonical Markdown as defined separately.
- Exact parser and editor libraries remain implementation choices.

## Alternatives Considered

### Make a rich-text editor JSON model canonical

This would simplify some structured editing interactions but would make Markdown
an export target and risk losing source fidelity, portability, and transparent
version history.

### Make the semantic syntax tree canonical

This would expose document structure directly but would couple persistence to a
parser schema and require serialization rules for details that Markdown already
represents clearly.

### Make rendered HTML canonical

HTML is suitable as a preview and publication target, not as an ergonomic or
stable scholarly authoring representation.
