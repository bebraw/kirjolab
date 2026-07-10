# ADR-046: Derive Bounded Knowledge Navigation

**Status:** Implemented

**Date:** 2026-07-10

## Context

Kirjolab now has documents, sections, publications, PDFs, annotations, citation
references, and passage links. Researchers need to find those resources and
follow the path between evidence and prose. A generic graph canvas would expose
structure but would not provide the direct editorial navigation needed by this
slice.

The current workspace representation is small and already materialized by one
Durable Object. Adding a persistent full-text index, embeddings, or a graph
database before measuring larger libraries would introduce synchronization and
deployment complexity while canonical Markdown and resource records continue
to evolve.

## Decision

Derive a bounded knowledge projection on demand from each authorized workspace
snapshot. The first projection contains stable resource nodes for the document,
sections, publications, PDFs, and annotations, plus `cites`, `annotates`, and
`used-in` edges.

Expose workspace-scoped `search` and `graph` read endpoints behind the existing
authorization boundary. Search tokenizes at most ten terms, returns at most
fifty deterministic results, and searches only one workspace snapshot. The
graph projection deduplicates repeated citations and uses kind-qualified
resource ids, not citation keys or filenames, as edge endpoints. Authored
heading ids provide stable section identity; an unanchored heading uses its
current generated slug until sections are materialized as independent records.

Present these representations as searchable resource cards and typed,
navigable connections in the editorial rail. Both ends of a connection remain
actions that take the researcher to the document, preview section, publication,
PDF, or annotation. A visual graph may be added later as a secondary view.

Do not persist the projection yet. Canonical Markdown, bibliography, and
workspace resources remain authoritative. Introduce a versioned persisted
index only after workspace size and query measurements demonstrate the need.

## Trigger

The sixth roadmap slice connects the editor and working-memory surfaces through
search, backlinks, and resource navigation.

## Consequences

**Positive:**

- Researchers can move directly between evidence, prose, and references.
- Search and graph results cannot drift permanently from canonical state.
- The first implementation requires no new storage product or migration.
- The domain projection is pure, typed, deterministic, and unit-testable.

**Negative:**

- Search work is linear in the size of one workspace snapshot.
- The first vocabulary omits claims, notes, people, and richer scholarly links.
- Search has lexical relevance only and no stemming, ranking history, or
  semantic retrieval.

**Neutral:**

- This implements the first navigable subset of ADR-036 without claiming its
  broader scholarly resource vocabulary is complete.
- A future index may use Durable Object SQLite, Vectorize, or a local companion
  behind the same resource contracts.

## Alternatives Considered

### Add Durable Object SQLite full-text search now

This would scale lexical lookup better but requires index lifecycle and
reconciliation rules before current workspace sizes justify them.

### Add a graph database

The domain is graph-shaped, but current traversal is bounded and can be derived
from typed records without another operational dependency.

### Make a graph canvas the primary interface

A canvas is useful for overview, but resource search and direct typed links are
faster for the evidence-to-prose editorial workflow and remain accessible on
small screens.
