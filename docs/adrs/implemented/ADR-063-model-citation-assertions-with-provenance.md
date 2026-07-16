# ADR-063: Model Citation Assertions With Provenance

**Status:** Implemented

**Date:** 2026-07-11

**Amended by:** [ADR-138](./ADR-138-accept-snowball-candidates-atomically.md)

## Context

ADR-036 models scholarly work as typed hypermedia and ADR-046 derives bounded
workspace navigation, but current `cites` edges describe manuscript-to-source
usage rather than one source citing another. A literature citation network needs
reference-list data that may come from external metadata providers, parsed PDFs
or web snapshots, manual researcher input, or probabilistic extraction.

Flattening these inputs into one trusted edge would hide disagreement and make
inferred title matches look equivalent to confirmed references. Restricting the
network to one project would also discard relationships already known by the
shared library and repeat external discovery work across papers.

## Decision

Kirjolab will model source-to-source citation relationships as
provenance-bearing assertions in the shared reference library. Each assertion
retains direction, asserting source, retrieval or capture time, extraction
method, source snapshot or provider response identity where available, and any
researcher review.

Assertions will expose at least four states:

- **Confirmed:** directly established by authoritative source material or
  deliberate researcher confirmation.
- **Extracted:** parsed from preserved source content but not yet confirmed.
- **Inferred:** suggested through uncertain matching or a model and never
  presented as an established citation.
- **Conflicting:** incompatible assertions are retained side by side with their
  provenance rather than resolved by retrieval order.

The citation network will be a shared-library view with an optional current
project filter. It begins with known library relationships and expands selected
sources to external references or citing works only after explicit researcher
action. The visual graph remains paired with an accessible list or table and
does not require a graph database.

This decision extends ADR-036's typed relationship model and ADR-046's bounded
navigation boundary from workspace-derived links to cross-project library
citation assertions. It does not change project `cites` relationships that
record how a manuscript uses a source.

## Trigger

The UI review found no discoverable way to inspect relationships between papers
and selected citation analysis as the first graph experience.

## Consequences

**Positive:**

- Researchers can inspect where each citation relationship came from and how
  strongly it is established.
- Conflicting providers or extractions do not silently overwrite one another.
- Shared discovery work becomes reusable across projects while a project filter
  preserves local focus.
- Explicit expansion keeps graph size and external requests bounded.

**Negative:**

- Multiple assertions for one apparent edge require reconciliation, review UI,
  and more storage than one flattened link.
- Incoming and outgoing coverage will remain incomplete and provider-dependent.
- Citation matching across missing or inconsistent identifiers needs uncertain
  candidate handling rather than simple insertion.

**Neutral:**

- The graph may use relational assertion tables and derived layouts; a graph
  database is not implied.
- The broader project evidence-and-claims graph remains a later view on the same
  typed-resource foundation.

## Implementation

- `src/domain/citation-assertions.ts` validates immutable assertions and
  derives bounded shared or project-focused networks. Opposing active polarity
  derives `conflicting`; rejected assertions remain stored but leave the active
  projection.
- Reference-library SQLite migration 4 stores stable directional endpoints,
  polarity, evidence state, method, actor, observation time, source identity,
  locator, confidence, and review. The owner-private library API exposes
  assertion creation, audit reads, review, and network projection.
- Explicit DOI expansion retrieves one bounded Crossref work response, hashes
  its normalized candidate representation, and records only DOI matches already
  in the library as `extracted` provider assertions. Unmatched candidates remain
  visible for later identification; no recursive or title-based matching occurs.
- The closed-by-default library UI provides a shared graph, a project-neighborhood
  filter, manual assertions, review controls, and an accessible list containing
  full provenance. The graph is derived SVG rather than authoritative storage.
- `specs/citation-network/spec.md` defines API, privacy, interaction, bounding,
  and regression contracts. Pure, integration, API, real-Workers, view, and
  browser tests protect the implementation.

## Alternatives Considered

### Store one boolean citation edge

This is easy to query but loses source, confidence, disagreement, and the
distinction between extraction and confirmation.

### Treat every provider result as confirmed

Providers have incomplete and conflicting coverage. Retrieval alone does not
justify erasing uncertainty or disagreement.

### Infer edges from title or embedding similarity

Similarity can suggest candidates but does not establish that one work cites
another and would make the graph academically misleading.

### Build a separate graph per project

Project graphs are focused but duplicate literature discovery and cannot expose
relationships known elsewhere in the user's shared library.
