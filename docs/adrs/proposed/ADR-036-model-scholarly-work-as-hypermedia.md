# ADR-036: Model Scholarly Work as Typed Hypermedia Resources

**Status:** Proposed

**Date:** 2026-07-10

## Context

Kirjolab combines writing with a working memory for publications, PDFs,
annotations, claims, and notes. Treating the editor and library as separate data
silos would force users to manually reconstruct why a source mattered and where
it was used.

A generic knowledge graph would expose relationships but would not by itself
define resource identity, useful relationship semantics, representations, or
actions. Citation keys, filenames, titles, heading slugs, and DOI values are also
insufficient as universal identities because they may change, collide, or be
absent.

## Decision

Kirjolab will model documents, sections, publications, PDFs, annotations,
claims, notes, people, projects, links, and model suggestions as addressable
resources with stable internal identities.

Relationships will be explicit typed resources or records. The initial
relationship vocabulary will include `cites`, `supports`, `contradicts`,
`extends`, `annotates`, `derived-from`, and `used-in`, and may grow through
versioned domain changes.

Each resource representation will expose links to related resources and the
actions available in its current state. Storage may use relational tables and a
typed link table; the domain model will not require a graph database.

External identifiers and mutable human-facing identifiers will be attributes or
aliases of resources rather than primary identities.

## Trigger

The architectural vision identifies the traceable path from source to annotation
to claim to cited prose as the product's defining workflow.

## Consequences

**Positive:**

- Editor and library workflows operate on one coherent scholarly model.
- Provenance and navigation can be expressed through ordinary resource links.
- Stable identity survives renamed citation keys, files, headings, and routes.
- The model can begin with simple relational persistence without closing off
  graph-oriented queries later.

**Negative:**

- Resource and relationship vocabularies require governance and migrations.
- Stable identity introduces reconciliation work during import and deduplication.
- Hypermedia representations require deliberate action and link design rather
  than ad hoc endpoint payloads.

**Neutral:**

- DOI, ISBN, ORCID, citation keys, and content fingerprints remain useful for
  lookup and reconciliation.
- A visual graph may be added as a secondary view but is not the primary domain
  or navigation model.

## Alternatives Considered

### Keep editor and reference library as separate subsystems

This would reduce early modeling work but would preserve the central friction
Kirjolab is intended to remove and create brittle integration identifiers.

### Use citation keys as publication identities

Citation keys are convenient author-facing aliases, but they are mutable,
workspace-scoped, and not always available.

### Require a graph database from the start

The domain is graph-shaped, but the initial access patterns do not justify
making a specialized database a prerequisite. A typed relational link model can
preserve the semantics with less operational commitment.
