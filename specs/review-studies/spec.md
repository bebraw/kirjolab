# Feature: Review Studies

## Blueprint

### Context

Systematic literature reviews and multivocal literature reviews require an
auditable path from a question and registered protocol through search,
selection, appraisal, extraction, synthesis, and reporting. Kirjolab already
connects research questions, references, PDFs, captured web sources,
annotations, claims, project history, local-model candidates, and manuscripts.
Review studies connect those capabilities without making Markdown, a personal
library, or a flat interchange file authoritative for collaborative review
state.

### Architecture

- `ReviewStudy` is a project-associated SQLite-backed Durable Object addressed
  by the workspace storage key. It is the coordination atom for one review and
  has an independent monotonic revision.
- The ordinary workspace access check authorizes every review API request.
  Project access does not grant access to owner-private library records or
  artifacts; bibliographic snapshots and rights-checked research sharing retain
  their existing boundaries.
- `src/domain/review-study.ts` owns portable types, bounds, validation, query
  rendering, projections, report calculations, and interchange contracts.
- `src/durable-objects/review-study.ts` owns versioned structured persistence,
  atomic mutation, reviewer decisions, and append-only provenance.
- `src/api/review-study.ts` exposes authenticated, same-origin workspace routes
  and never trusts browser-computed counts, identities, or derived reports.
- The workspace UI hosts one **Review study** surface using the existing thin
  design system. Its task navigation follows Plan, Search, Screen, Appraise,
  Extract, Synthesize, and Report without replacing manuscript authoring.
- A review uses one common lifecycle plus a versioned `slr` or `mlr` method
  profile. Question-framework and appraisal templates are configuration, not
  hard-coded universal methodology.
- Every logical workspace history snapshot pins the review revision used by
  review-derived manuscript artifacts. A review mutation does not advance the
  collaborative Markdown revision.

### Core Resource Model

- **Protocol revision:** objectives, method profile, question framework,
  research questions, concept groups, eligibility criteria, appraisal
  instrument, extraction schema, and search-source definitions.
- **Concept group:** a stable concept with preferred terms, synonyms, acronyms,
  controlled vocabulary, field intent, and active state.
- **Logical query:** a versioned expression over concept groups. Terms within a
  group use `OR`; selected groups use explicit Boolean composition.
- **Source query:** a generated or manually overridden query for one source,
  including field scope, adapter identity, diagnostics, and rationale.
- **Search run:** an immutable execution event binding one frozen source query
  to date, filters, reported result count, searcher, and import batches.
- **Imported occurrence:** one record as returned by one search run, retaining
  raw metadata and source provenance.
- **Review record:** the deduplicated work or grey-literature item screened by
  the team while retaining every related occurrence.
- **Screening decision:** an append-only reviewer judgment qualified by stage,
  protocol revision, criterion, rationale, and time.
- **Adjudication:** an explicit resolution that preserves conflicting reviewer
  judgments.
- **Appraisal judgment:** a typed answer under one applicable instrument item,
  with rationale and optional evidence selector.
- **Extraction value:** a typed answer under one schema field, with explicit
  missingness and optional evidence selectors.
- **Analysis definition:** a versioned, bounded process or evidence-synthesis
  projection over one exact review revision.
- **Model candidate:** a provenance-bearing suggestion that never mutates a
  canonical decision, judgment, extraction, code, or finding before review.

### Protocol and Query Planning

- New studies start with one editable protocol revision and either the `slr` or
  `mlr` profile.
- Research questions keep stable ids and ordering and may link to concept
  groups, extraction fields, synthesis findings, claims, and manuscript
  sections.
- The initial question frameworks are PICOC and a free-form concept matrix.
  PICOC fields are optional; missing Comparison, Outcome, or Context values do
  not invalidate a protocol.
- Concept terms retain kind, provenance, active state, and exact authored text.
  The query preview quotes phrases and preserves explicit truncation markers.
- Known-relevant validation records may be linked to query revisions. Query
  calibration reports which validation records are found or missed and never
  presents an inferred universal quality score.
- Search sources record stable type, name, URL, platform or collection, field
  capabilities, coverage notes, and profile applicability.
- Source-query adapters render title, abstract, keyword, topic, or all-field
  scopes where supported. Generated and executed text remain distinct.
  Unsupported constructs and manual semantic differences are visible.
- Freezing a protocol pins its full planning representation. Later changes
  create an amendment and identify affected records or stages; they never edit
  an earlier search or decision in place.

### Search, Import, and Deduplication

- A search run stores the exact executed source query, source definition,
  protocol revision, searcher, time, filters, notes, and reported result count.
- BibTeX is the first accepted import format. CSL JSON, RIS, EndNote XML, and
  source CSV remain explicit later adapters over the same occurrence contract.
- Import preview validates bounds and reports malformed or skipped records.
  Confirmation stores the accepted batch with filename, media type, byte count,
  digest, parser version, and normalized occurrences.
- The initial implementation retains normalized imported metadata and a digest,
  not the original uploaded byte payload. A future raw-archive boundary requires
  an explicit retention and rights decision.
- DOI and exact external identifiers establish deterministic duplicate
  candidates. Normalized title, first author, and year produce reviewable
  similarity candidates only.
- Resolving a duplicate associates occurrences with one canonical review
  record and selects field provenance without deleting source membership.
- PRISMA identification counts derive from occurrences and deduplication events,
  never from the visible review-record list alone.

### Screening and Adjudication

- Screening stages are `title-abstract` and `full-text`; inclusion at one stage
  advances a record without becoming final inclusion.
- Reviewer decisions are `include`, `exclude`, or `uncertain`. Exclusion
  requires one applicable stable criterion; other decisions may retain notes.
- A review may require one or two independent decisions per stage. In blinded
  mode, a reviewer cannot inspect another reviewer's pending decision.
- Divergent complete decisions create a conflict. Only an explicit adjudication
  advances the record and all original judgments remain inspectable.
- Full-text exclusion contributes exactly one primary PRISMA reason, with
  optional secondary notes.
- Metadata correction is a separate provenance-bearing action and never edits
  the imported occurrence as it appeared to an earlier reviewer.
- The UI supports keyboard-first save-and-next operation, remaining counts, and
  filters by stage, status, source, criterion, reviewer, and conflict.

### Quality Appraisal and Data Extraction

- Eligibility, appraisal, bibliographic metadata, and extracted study data are
  separate semantic authorities even when they reuse typed field primitives.
- An appraisal instrument declares applicable formal or grey source types,
  stable items, guidance, answer options, optional weights, and critical items.
- Appraisal exposes dimension-level judgments before any derived total score.
  The `mlr` profile may use separate credibility dimensions for authority,
  objectivity, evidence support, currency, and outlet reputation.
- Extraction fields support text, integer, decimal, Boolean, date, single or
  multiple controlled choices, and source selector values. Fields may be
  required, optional, conditional, or repeatable and may link to RQs.
- `not-reported`, `not-applicable`, and `unclear` are distinct missingness
  states and never collapse into an empty value.
- Appraisal and extraction may be independently completed by two reviewers.
  Comparison and adjudication preserve both original values.
- Evidence selectors identify an authorized project-shared PDF annotation or
  captured-web passage. Review data never broadens access to a private source.
- A record is complete only when every applicable required field is resolved.

### Synthesis and Manuscript Integration

- Process analysis covers source yield, deduplication, screening progression,
  exclusions, conflicts, agreement, missing data, and PRISMA flow counts.
- Evidence synthesis covers typed extraction matrices, study characteristics,
  RQ coverage, cross-tabs, appraisal-sensitive views, formal-versus-grey
  comparisons, contradictions, and evidence-linked qualitative themes.
- Every analysis definition records type, filters, columns or dimensions,
  review revision, and generator schema. Counts and datasets are derived on the
  server from that pinned review revision.
- Qualitative synthesis preserves the chain from source selector through code,
  category, theme, RQ finding, claim, and manuscript use.
- A bounded review-artifact directive may place a named table, figure, or flow
  artifact in Markdown. The directive is canonical authored intent; its data
  and visual representation remain derived from the pinned review revision.
- Updating a review never silently changes an immutable project milestone or a
  previously materialized publication bundle.
- Native scope covers descriptive, qualitative, and mixed-evidence synthesis.
  Statistical meta-analysis uses exported data until a separate method and
  computation decision is approved.

### Reviewable Model Assistance

- Screening assistance returns one proposed decision, criterion where
  applicable, rationale, and exact title/abstract evidence.
- Extraction assistance returns typed proposed values and exact authorized
  source selectors. It never invents `not reported` content.
- Coding or synthesis assistance returns bounded candidate codes, themes, or
  findings with contributing extraction ids and evidence selectors.
- Every model run records operation, provider, model, prompt-template version,
  supplied source scope, result, time, and reviewer disposition.
- A study may use `human-first` mode, which hides model output until an initial
  human judgment exists, or `assisted` mode, which exposes it during work.
- The initial contract requires human validation of every model proposal.
  Automatic exclusion, acceptance, extraction, or stopping requires a separate
  registered automation rule and evaluation contract.

### Reporting and Interchange

- Reporting derives from one exact review revision through the existing
  source-mapped export boundary.
- The review package manifest records schema, generator, project, review
  revision, protocol revision, generation time, files, and SHA-256 digests.
- Lossless JSON is the primary interchange representation. CSV provides
  rectangular review records and long-form repeatable extraction values.
- BibTeX and CSL JSON exports retain included or excluded bibliographic scope.
- Search history, screening decisions, appraisal, analysis definitions, model
  disclosure, PRISMA counts, and flow data are separately inspectable package
  entries.
- The PRISMA diagram is derived from flow data and available as accessible HTML
  plus portable SVG. A JSON representation remains the calculation authority.
- DOCX may become an optional publication target but never becomes canonical
  review, analysis, or manuscript state.

### API Contracts

- `GET /api/workspaces/{id}/review` returns the authorized review snapshot.
- `PUT /api/workspaces/{id}/review/protocol` replaces the current editable
  protocol using revision preconditions.
- `POST /api/workspaces/{id}/review/protocol/freeze` freezes the current
  protocol; `POST /amendments` creates a new editable successor.
- `/review/search-runs` creates and reads immutable runs; nested `/imports`
  previews or confirms bounded bibliographic batches.
- `/review/duplicates` lists candidates and records explicit resolutions.
- `/review/records/{recordId}/decisions` appends screening decisions;
  `/adjudications` resolves conflicts without deleting decisions.
- `/review/records/{recordId}/appraisals` and `/extractions` append typed
  reviewer values under the pinned instrument or schema.
- `/review/analyses` stores and evaluates bounded definitions.
- `/review/model-candidates` creates, accepts, or rejects typed local-model
  proposals through the normal provider boundary.
- `/review/export/{artifact}` returns `review.json`, `extraction.csv`,
  `bibliography.bib`, `prisma.json`, `prisma.svg`, or `review.zip` with
  `Cache-Control: no-store`.
- All mutations require normal workspace write authorization, same-origin
  validation, a current review revision, and bounded validated input.

### Bounds and Security

- One review retains at most 128 research questions, 128 concept groups, 1,024
  active terms, 128 sources, 512 criteria or typed schema fields, 256 search
  runs, 1,024 import batches, 100,000 occurrences, and 50,000 review records.
- One bibliographic import contains at most 20,000 records and 32 MiB of UTF-8
  input. One review API JSON request is bounded to 2 MiB unless an import route
  declares the larger streaming boundary.
- Strings, identifiers, arrays, selectors, and exported cell values have
  explicit field-level limits in the domain guards.
- Formula-looking CSV cells beginning with `=`, `+`, `-`, or `@` are escaped on
  export to prevent spreadsheet formula execution.
- Imported markup is inert text. Review UI never inserts database or model HTML
  into the DOM.
- Review routes are private and non-cacheable. Read-only and edit-share
  capabilities do not receive review-study APIs unless a later rights decision
  explicitly adds them.

### Anti-Patterns

- Do not store review state in Markdown, the owner-private library, browser
  local state, or a flat CSV authority.
- Do not discard source occurrences when deduplicating review records.
- Do not silently regenerate an executed source query from a changed base
  query.
- Do not use one `accepted` flag across screening stages.
- Do not mix eligibility, appraisal, bibliographic metadata, and extraction
  semantics merely because their controls look similar.
- Do not reduce quality appraisal to an opaque total score.
- Do not create unsupported summaries or extracted values without exact
  evidence and researcher validation.
- Do not calculate the same report count independently in UI, API, diagram,
  and export code.
- Do not let review access disclose private PDFs, notes, captures, or library
  state.

## Contract

### Definition of Done

- [x] A project can initialize, edit, freeze, and amend an SLR or MLR protocol.
- [x] Researchers can build concept groups, calibrate a logical query, and
      review source-specific field-scoped query renderings.
- [x] Immutable search runs can import BibTeX occurrences and preserve source
      counts through reviewed deduplication.
- [x] One or two reviewers can complete staged screening, inspect conflicts,
      and adjudicate without overwriting original decisions.
- [x] Included records support evidence-linked quality appraisal and typed data
      extraction with explicit missingness.
- [x] RQ-oriented process and evidence analyses derive from a pinned review
      revision and can enter the manuscript as named review artifacts.
- [x] Local models can propose screening and extraction candidates that require
      explicit human acceptance and produce an auditable disclosure.
- [x] JSON, CSV, BibTeX, PRISMA JSON/SVG, and deterministic review ZIP exports
      derive from the same review revision.
- [x] Project history, backup, and deletion cover the review-study authority and
      its pinned revisions.
- [x] Domain, Workers-runtime, browser, export, security, and accessibility
      tests cover the critical workflow.

### Regression Guardrails

- Existing writing, library, evidence, collaboration, history, backup, and
  export workflows remain usable for projects without a review study.
- Review mutations do not change Markdown or private-library state as an
  implicit side effect.
- Review revisions advance once per successful logical mutation and stale
  revision preconditions fail without partial writes.
- Search and PRISMA counts remain reproducible from retained occurrences and
  events after deduplication, screening, amendment, and restore.
- Derived outputs disclose their review revision, definitions, filters, and
  generator versions.
- Model failure or rejection leaves canonical review and manuscript state
  unchanged.
- Exported archives remain traversal-free, private, deterministic, and bounded.

### Verification

- Pure domain tests cover guards, bounds, query rendering, duplicate grouping,
  stage projection, appraisal/extraction typing, analysis calculations, CSV
  safety, PRISMA flow derivation, and deterministic manifests.
- Workers tests cover schema migration, eviction, authorization adapters,
  atomic revisions, protocol freeze/amendment, import, deduplication,
  independent decisions, adjudication, evidence selectors, candidate review,
  backup, restore, and deletion.
- Browser tests cover planning, keyboard screening, conflict resolution,
  side-by-side evidence extraction, synthesis, manuscript artifact insertion,
  disclosure, and export.
- The full quality gate and local Agent CI pass before the feature is treated as
  ready.

### Scenarios

**Scenario: Researcher calibrates and freezes a protocol**

- Given: an editable SLR protocol with RQs, concept groups, validation records,
  sources, criteria, appraisal items, and extraction fields
- When: the researcher reviews generated source queries and freezes the protocol
- Then: every planning resource receives one immutable protocol revision and
  later edits require a documented amendment

**Scenario: Search occurrences survive deduplication**

- Given: the same DOI was imported from ACM, IEEE, and Scopus search runs
- When: a researcher resolves those occurrences to one review record
- Then: the record is screened once while all three source occurrences remain
  available to identification counts and audit views

**Scenario: Two reviewers disagree**

- Given: blinded title-and-abstract screening requires two decisions
- When: one reviewer includes and the other excludes a record
- Then: the record enters conflict, neither decision is overwritten, and only
  an explicit adjudication advances it

**Scenario: Extraction remains grounded**

- Given: an included paper with a rights-checked shared PDF
- When: a reviewer records a key finding from a selected passage
- Then: the typed extraction value retains its RQ, reviewer, schema revision,
  PDF selector, and exact source quotation

**Scenario: Review evidence enters the manuscript**

- Given: a named analysis over a pinned review revision
- When: the author inserts its review-artifact directive
- Then: preview and export render the same table or figure and expose the
  analysis definition and contributing evidence

**Scenario: Model assistance remains transparent**

- Given: assisted screening or extraction is enabled
- When: a researcher accepts, edits, or rejects a local-model proposal
- Then: the human disposition and complete bounded model provenance enter the
  disclosure while rejection changes no canonical review data

**Scenario: Researcher archives a reproducible review**

- Given: a completed review revision
- When: the researcher exports the review package
- Then: JSON, CSV, bibliography, PRISMA data and SVG, audit logs, disclosure,
  and manifest agree on the same revision and deterministic digests
