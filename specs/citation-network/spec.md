# Feature: Provenance-Bearing Citation Network

## Blueprint

### Context

Project `cites` links describe how a manuscript uses a source. Literature
review also needs reusable source-to-source relationships without presenting a
provider result, extraction, or model suggestion as equally trustworthy.

### Architecture

- The owner-scoped `ReferenceLibrary` stores directional citation assertions
  between stable reference UUIDs. Assertions do not replace manuscript
  citation links or project-local aliases.
- Every assertion retains polarity, evidence state, method, asserting actor,
  observation time, source kind, source identity, locator, optional confidence,
  and optional researcher review.
- Stored evidence states are `confirmed`, `extracted`, or `inferred`. The
  derived network exposes `conflicting` when active positive and negative
  assertions address the same directed pair. Assertions remain intact rather
  than being overwritten.
- A rejected assertion remains in the audit record but is omitted from the
  active network. Confirming an assertion raises its derived state to
  `confirmed` without rewriting its captured provenance.
- `GET /api/library/citation-network` derives the shared owner-library network.
  `?projectId={id}` limits relationships to those touching a reference linked
  to that project and includes isolated linked references.
- The projection reads at most 513 stored assertions and returns at most 512.
  Expansion is an explicit action on one DOI-backed source and reads at most
  128 outgoing Crossref reference candidates from a one-megabyte response.
- Crossref expansion records only DOI matches already present in the library as
  `extracted` provider assertions. Unmatched candidates are returned as a
  reviewable discovery round and are never silently created or inferred by
  title. Accepting one refetches the exact expansion, verifies its response
  fingerprint and DOI membership, retrieves complete metadata, then atomically
  creates or reuses the reference and records its extracted assertion.
- The visual SVG is paired with an ordinary accessible list containing every
  visible assertion and its provenance and review controls. Relational SQLite
  remains sufficient; the layout is derived browser state.

### API Contracts

- `POST /api/library/citation-assertions` records one validated manual or
  extracted assertion; `GET` lists a bounded audit view, optionally for one
  reference.
- `POST /api/library/citation-assertions/{id}/review` records a confirmation or
  rejection, reviewer, time, and note without mutating source provenance.
- `GET /api/library/citation-network[?projectId={id}]` returns stable reference
  nodes, grouped directional edges, derived states, and underlying assertions.
- `POST /api/library/references/{id}/citation-expansions` explicitly retrieves
  outgoing Crossref references and returns matched assertions plus unmatched
  DOI candidates.
- `POST /api/library/references/{id}/citation-candidates` accepts one candidate
  from a named expansion response after refetch verification and returns the
  saved reference, whether it was created, and the provenance-bearing
  assertion.

### Privacy and Security

- Citation assertions and network routes use the verified owner-library
  boundary. Workspace membership alone cannot browse them.
- External retrieval targets the fixed Crossref HTTPS origin, uses an encoded
  validated DOI, applies response and candidate bounds, and performs no
  automatic recursive expansion.
- Candidate acceptance trusts neither client-supplied metadata nor a bare DOI.
  The Worker refetches the seed expansion, verifies its response fingerprint,
  and fetches the candidate's current metadata before entering one library
  transaction.
- Every API representation is non-cacheable and the client validates network
  data before rendering it.

### Anti-Patterns

- Do not flatten several assertions into one stored boolean edge.
- Do not call a provider result confirmed merely because retrieval succeeded.
- Do not infer a citation from title, embedding, or author similarity.
- Do not let a rejected or newer assertion erase earlier provenance.
- Do not make the SVG the only way to inspect the network.
- Do not expand the network implicitly when opening it or traversing an edge.
- Do not create a reference from an unmatched candidate until the researcher
  explicitly accepts it.

## Contract

### Definition of Done

- [x] Assertions retain direction, polarity, evidence state, source identity,
      retrieval time, method, actor, confidence, and review.
- [x] Opposing active assertions derive a visible conflict without data loss.
- [x] Rejection removes an assertion from the active projection but preserves
      its audit record.
- [x] The library network has an optional current-project neighborhood filter.
- [x] Expansion is explicit, bounded, DOI-matched, and reports unmatched work.
- [ ] Unmatched works render as a reviewable discovery round and explicit
      acceptance atomically saves the work and its extracted relationship.
- [x] A graph and accessible provenance list expose the same projection.
- [x] Pure, API, integration, Workers-runtime, view, and browser tests cover
      derivation, validation, persistence, review, filtering, and interaction.

### Regression Guardrails

- Stable edge endpoints must be library reference UUIDs, never DOI, title, or
  project citation alias.
- Conflicts must be derived from retained active assertions, not stored as a
  replacement assertion.
- Provider responses must stay `extracted` until researcher review confirms
  them.
- A project filter must not turn a private library endpoint into a collaborator
  endpoint.
- Expansion must remain one level, researcher-triggered, and bounded.

### Scenarios

**Scenario: Providers disagree**

- Given: active positive and negative assertions address the same directed pair
- When: the library network is derived
- Then: the edge and its assertions are conflicting and both provenances remain
  inspectable

**Scenario: Researcher confirms extracted evidence**

- Given: Crossref produced an extracted assertion
- When: the owner confirms it with a review note
- Then: the network reports it as confirmed while retaining the provider
  response identity and retrieval time

**Scenario: Researcher focuses on one paper**

- Given: the shared network contains relationships across several projects
- When: the owner selects the current-project filter
- Then: only edges touching a linked project reference and isolated linked
  references remain visible

**Scenario: Crossref names an unknown reference**

- Given: explicit expansion returns a DOI absent from the library
- When: the response is reconciled
- Then: the DOI is returned as unmatched and no reference or citation assertion
  is fabricated

**Scenario: Researcher accepts an expansion candidate**

- Given: an unmatched DOI appears in a fingerprinted expansion round
- When: the owner explicitly saves that candidate
- Then: Kirjolab refetches and verifies the round, creates or reuses the DOI
  identity, and records the extracted citation assertion in one transaction

**Scenario: Expansion changed before acceptance**

- Given: the provider response no longer matches the reviewed fingerprint
- When: the owner tries to save a candidate from the stale round
- Then: Kirjolab rejects the acceptance and asks for a fresh expansion without
  creating a reference or assertion
