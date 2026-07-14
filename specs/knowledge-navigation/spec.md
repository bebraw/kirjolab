# Feature: Knowledge Navigation

## Blueprint

### Context

Kirjolab's editor and working memory form one scholarly workspace. Researchers
must be able to find a resource, see why it is connected, and follow the
connection without reconstructing identity from a citation key or filename.

### Architecture

- `src/domain/knowledge.ts` derives lexical search results and typed graph
  projections from an authorized `WorkspaceSnapshot`.
- Resource ids use kind-qualified project, document, section, publication, PDF,
  annotation, claim, shared note, person, and model-candidate identities.
  Explicit heading ids are stable section identities; unanchored headings use
  their current generated slug. Workspace people receive stored opaque ids
  independent of their mutable email attribute.
- The relationship vocabulary is `contains`, `participates-in`, `cites`,
  `has-artifact`, `annotates`, `used-in`, `supports`, `contradicts`, `extends`,
  and `derived-from`. `has-artifact` is derived only from a durable explicit
  publication/PDF link. Model candidates retain typed `derived-from` edges to
  their captured evidence.
- `GET /api/workspaces/{id}/search?q={query}` returns at most fifty ranked
  resources for at most ten query tokens.
- `GET /api/workspaces/{id}/graph` returns the current nodes and typed edges.
- The authoring surface offers peer `Write` and `Map` modes. `Map` renders the
  derived project graph, workspace search, and typed connections while keeping
  every node and connection available as an ordinary keyboard-operable resource
  action.
- The Research rail remains a compact inventory of project evidence, claims,
  and references. It does not duplicate search, project graph, or library
  citation-network controls.
- The projection is derived state. It is not stored or synchronized as an
  authoritative representation.

### Anti-Patterns

- Do not use citation keys, filenames, or titles as internal edge endpoints.
- Do not bypass workspace authorization for search or graph reads.
- Do not persist a search index without a version and rebuild contract.
- Do not make a visual graph the only way to inspect or follow connections.
- Do not let missing related resources make the whole projection invalid.

## Contract

### Definition of Done

- [x] Search covers projects, documents, sections, publications, PDFs,
      annotations, evidence-backed claims, shared notes, people, and model
      candidates.
- [x] Multi-token results require every bounded query token and use
      deterministic relevance ordering.
- [x] Citations, PDF annotations, and manuscript passage links become typed
      connections.
- [x] Claim evidence and manuscript usage become typed, navigable connections.
- [x] Repeated citations produce one connection per publication.
- [x] Both search results and connection endpoints navigate to their resource.
- [x] Write and Map are peer authoring modes, with editor-directed navigation
      returning to Write.
- [x] The project map pairs its visual projection with searchable resource cards
      and a typed connection list.
- [x] Explicit publication/PDF associations project as navigable
      `has-artifact` connections.
- [x] Project membership, shared-note provenance, and model evidence project as
      typed connections without creating another authority.
- [x] Search and graph endpoints use the existing workspace access boundary.
- [x] Domain tests cover ranking, graph derivation, deduplication, and guards.
- [x] Browser coverage proves search, connection rendering, and API shapes.

### Regression Guardrails

- Search must stay bounded to one authorized workspace, ten tokens, two hundred
  query characters, and fifty results.
- Projections must be reconstructible from canonical workspace state.
- Graph edges must refer to kind-qualified resource ids.
- Person endpoints must use stored opaque member ids rather than email values.
- `has-artifact` must never be inferred from publication or PDF metadata.
- Client code must validate API representations before rendering them.
- Live source edits may update derived citation navigation but must never mutate
  canonical Markdown as a side effect.

### Scenarios

**Scenario: Researcher finds captured evidence**

- Given: an annotation has a quote and note
- When: the researcher searches terms from that evidence
- Then: the annotation appears as a navigable result

**Scenario: Researcher follows evidence into prose**

- Given: an annotation is linked to a manuscript passage
- When: the researcher inspects workspace connections
- Then: an `annotates` link reaches the PDF and a `used-in` link reaches the
  document

**Scenario: Manuscript cites one publication repeatedly**

- Given: the same stable publication is cited more than once
- When: the graph projection is derived
- Then: it contains one `cites` edge for that document-publication pair

**Scenario: Publication links to several PDF artifacts**

- Given: durable links associate one publication with multiple PDFs
- When: the graph projection is derived
- Then: it contains one `has-artifact` edge for each explicit unique pair

**Scenario: Model proposal retains evidence provenance**

- Given: a persisted candidate was grounded in an annotation or claim
- When: the knowledge projection is derived
- Then: the candidate is an addressable resource with a `derived-from` edge to
  each captured evidence resource and a `used-in` edge to its manuscript

**Scenario: Researcher changes authoring modality**

- Given: the project contains manuscript, evidence, claim, and reference nodes
- When: the researcher switches from Write to Map
- Then: the editor is replaced by a derived project map with resource search
  and typed connection actions, while canonical Markdown remains unchanged
