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

[ADR-151](../../docs/adrs/implemented/ADR-151-model-reviews-as-independent-resources.md)
defines reviews as independent collaborative resources whose evidence can be
published deliberately into several writing projects.

### Architecture

- `ReviewCatalog` is a SQLite-backed catalog per authenticated identity. It
  stores discoverable review UUID, title, `slr` or `mlr` profile, role,
  lifecycle, and activity metadata while keeping the storage locator internal
  to server-side catalog records.
- `ReviewAccess` is the independent SQLite-backed authority for one review's
  owner, members, deletion state, and complete active and unlinked project-link
  ledger. `ReviewStudy` remains a separately addressed SQLite-backed authority
  for structured review state and its monotonic revision. Both resolve through
  the catalog locator rather than a public workspace id.
- New reviews use a stable UUID and `review:{reviewId}` storage key. A legacy
  project-associated review receives the same stable UUID contract while its
  existing workspace storage key remains behind a locator; registration moves
  no ReviewStudy data.
- `/review` lists the current identity's catalog and creates reviews without a
  writing project. `/review/{reviewId}` is the canonical focused browser
  representation, and `/api/reviews/{reviewId}` is the canonical API boundary.
  `/review/{workspaceId}` and
  `/api/workspaces/{workspaceId}/review-study` remain bounded legacy adapters.
- Legacy registration atomically assigns one stable review UUID, snapshots the
  then-current project members into independent review membership exactly once,
  creates an explicit project link, and registers the same locator and
  role-qualified summary in each seeded member's catalog. Later project
  membership changes do not alter review membership.
- Legacy registration idempotently reconciles the authoritative ReviewAccess
  link into the project's DocumentRoom projection even after a partial prior
  attempt. A later project member excluded from the frozen review membership is
  skipped during discovery without gaining review access or failing the page.
- Review membership authorizes review-only operations. Project membership does
  not grant review access; review membership does not grant project or owner-
  private Library access; and a project-review link grants neither. Operations
  that resolve project evidence or publish into a project require an explicitly
  selected active link plus independent access to both resources.
- `src/domain/review-study.ts` owns portable types, bounds, validation, query
  rendering, projections, report calculations, and interchange contracts.
- `src/durable-objects/review-study.ts` owns versioned structured persistence,
  atomic mutation, reviewer decisions, and append-only provenance.
- `src/domain/review-catalog.ts` owns independent review, membership, locator,
  project-link, backup, and bound contracts. `src/durable-objects/review-catalog.ts`
  and `src/durable-objects/review-access.ts` own their corresponding atomic
  SQLite authorities.
- `src/api/reviews.ts` resolves review catalog and access before dispatching to
  `src/api/review-study.ts`. Both boundaries require authentication, enforce
  same-origin mutation checks, and never trust browser-computed counts,
  identities, links, or derived reports.
- The focused review route follows Plan, Search, Screen, Appraise, Extract,
  Synthesize, and Report without embedding the workflow in manuscript authoring
  chrome. It exposes review membership, lifecycle, and explicit many-to-many
  project relationships as resource context rather than treating one project
  as the owner.
- A review uses one common lifecycle plus a versioned `slr` or `mlr` method
  profile selected at creation. The profile is immutable because it defines the
  method defaults and catalog identity; changing method family requires a new
  review. Question-framework and appraisal templates remain versioned
  configuration, not hard-coded universal methodology.
- Every review projection can be reconstructed at an exact retained review
  revision. Protocol, search, deduplication, screening, final inclusion,
  evidence, model, finding, synthesis, and export projections filter their
  append-only events at that boundary; requests below the recorded history
  floor fail instead of approximating old state.
- Project history owns only explicitly materialized review artifacts, never the
  live ReviewStudy. Each artifact pin records the review, link, publication,
  review/protocol/analysis revisions, generator/schema, publisher, generation
  time, and Markdown digest. A review mutation does not advance a project
  revision or rewrite a pinned materialization.

### Core Resource Model

- **Review catalog record:** the current identity's role-qualified projection of
  one stable UUID review, including title, profile, lifecycle, activity, and a
  server-private locator. Public catalog and detail responses omit the locator.
- **Review locator:** an immutable mapping from review UUID to its physical
  ReviewAccess and ReviewStudy storage key plus an optional legacy workspace
  identity. It permits legacy continuity without making storage identity part
  of the URL contract.
- **Review member:** an opaque member identity, normalized email access
  attribute, `owner` or `member` role, and addition time. The owner alone
  manages review settings, membership, project links, and permanent deletion.
- **Project-review link:** a stable many-to-many association with review UUID,
  workspace identity, creator and creation time, and `active` or `unlinked`
  state with attributed unlink provenance. An unlinked row remains history and
  grants no authority.
- **Protocol revision:** objectives, method profile, question framework,
  research questions, concept groups, eligibility criteria, method rules,
  appraisal instrument, extraction schema, amendment impact, and search-source
  definitions.
- **Concept group:** a stable concept with preferred terms, synonyms, acronyms,
  controlled vocabulary, field intent, and active state.
- **Logical query:** a versioned expression over concept groups. Terms within a
  group use `OR`; selected groups use explicit Boolean composition.
- **Source query:** a generated or manually overridden query for one source,
  including field scope, adapter identity, diagnostics, and rationale.
- **Search run:** an immutable execution event binding one frozen source query
  and protocol revision to search/import times, reported result count,
  importing researcher, parser counts and digest, and import batches.
- **Import batch:** filename, BibTeX media type, byte count, SHA-256 digest,
  parser version, reported result count, and normalized occurrences associated
  with one search run. Detected/skipped entry counts and per-record warnings
  remain available in the run projection.
- **Imported occurrence:** one record as returned by one search run, retaining
  raw metadata and source provenance.
- **Review record:** the deduplicated work or grey-literature item screened by
  the team while retaining every related occurrence.
- **Screening decision:** an append-only reviewer judgment qualified by stage,
  protocol revision, criterion, rationale, and time.
- **Adjudication:** an explicit resolution that preserves conflicting reviewer
  judgments.
- **Final-inclusion decision:** a separate append-only include or exclude event
  after full-text inclusion. Final exclusion retains its applicable criterion,
  reason, protocol revision, reviewer, and time.
- **Reassessment obligation:** an amendment-generated, stage-qualified global
  or record-scoped task with an append-only completion rationale and actor.
- **Appraisal judgment:** a typed answer under one applicable instrument item,
  with rationale and optional evidence selector.
- **Extraction value:** a typed answer under one schema field, with explicit
  missingness and optional evidence selectors.
- **Analysis definition:** a versioned, bounded process or evidence-synthesis
  projection over one exact review revision.
- **RQ finding:** an append-only statement and interpretation linked to one
  research question, contributing appraisal or extraction values, and exact
  evidence selectors. A later finding may supersede one earlier finding without
  deleting it or branching the supersession chain.
- **Review artifact pin:** a project-history binding between a
  `review/{reviewId}/*.md` artifact and the exact review, project link,
  publication identity, review and protocol revision, analysis definition and
  revision, generator/schema, publisher, generation time, and content digest.
- **Model candidate:** a provenance-bearing suggestion that never mutates a
  canonical decision, judgment, extraction, code, or finding before review.

### Protocol and Query Planning

- New studies start with one editable protocol revision and either the `slr` or
  `mlr` profile.
- Research questions keep stable ids and ordering and may link to concept
  groups, extraction fields, synthesis findings, claims, and manuscript
  sections.
- Planning and synthesis identify questions to researchers as `RQ1`, `RQ2`,
  and so on by visible order. Extraction-field input resolves those labels to
  stable internal ids; internal ids are not required knowledge for authoring.
- The initial question frameworks are PICOC and a free-form concept matrix.
  PICOC fields are optional; missing Comparison, Outcome, or Context values do
  not invalidate a protocol.
- Concept terms retain kind, provenance, active state, and exact authored text.
  The query preview quotes phrases and preserves explicit truncation markers.
- Known-relevant validation records may be linked to query revisions. Query
  calibration reports which validation records are found or missed and never
  presents an inferred universal quality score.
- Search sources record stable type, name, URL, platform or collection, field
  capabilities, evidence class, source class, optional grey-literature class,
  and profile applicability. The SLR profile defaults to formal scholarly
  sources; the MLR profile adds grey-literature search and stopping rules,
  credibility dimensions, and formal-versus-grey synthesis dimensions.
- Source-query adapters render title, abstract, keyword, topic, or all-field
  scopes where supported. Generated and executed text remain distinct.
  Unsupported constructs and manual semantic differences are visible.
- Eligibility criteria have stable ids, include or exclude semantics, and an
  explicit set of applicable screening stages. Extraction fields have stable
  ids, one of the eight supported value types, requiredness, single or
  repeatable cardinality, an optional condition description, controlled
  choices where applicable, and stable RQ links.
- Freezing a protocol pins its full planning representation. Later changes
  append a frozen amendment with rationale and an impact declaration naming at
  least one affected stage and optionally exact active record ids. Kirjolab
  creates stage-global or per-record reassessment obligations from that impact;
  completing an obligation advances the review revision and retains actor,
  time, and rationale. Earlier searches and decisions continue to expose their
  original protocol revision and criterion id/text.

### Search, Import, and Deduplication

- A search run stores the exact executed source query, source identity and name,
  protocol revision, searching and import times, importing researcher, digest,
  parser counts, accepted occurrence count, and source-reported result count.
- BibTeX is the first accepted import format. CSL JSON, RIS, EndNote XML, and
  source CSV remain explicit later adapters over the same occurrence contract.
- Import preview validates bounds and reports malformed or skipped records.
  Confirmation stores the accepted batch with filename, media type, byte count,
  digest, parser version, reported source result count, and normalized
  occurrences. The source-reported count remains distinct from parsed and
  accepted occurrence counts.
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
  advances a record without becoming final inclusion. A separate final-
  inclusion decision after full-text inclusion determines the evidence and
  synthesis corpus.
- Reviewer decisions are `include`, `exclude`, or `uncertain`. Each stored
  decision retains the exact stable applicable criterion selected by the
  reviewer, its text, and the current protocol revision; exclusion requires an
  applicable exclusion criterion.
- A review may require one or two independent decisions per stage. In blinded
  mode, a reviewer cannot inspect another reviewer's pending decision.
- Divergent complete decisions create a conflict. Only an explicit adjudication
  advances the record and all original judgments remain inspectable.
- Full-text exclusion contributes exactly one primary PRISMA reason, with
  optional secondary notes. A final exclusion likewise contributes its stable
  full-text exclusion criterion without being collapsed into full-text
  screening.
- Final-inclusion decisions are append-only. Their latest event is
  authoritative for the current corpus, and earlier final decisions remain
  reconstructible at their original review revisions.
- Imported occurrence metadata is immutable. A future metadata-correction event
  must remain separate and provenance-bearing rather than rewriting the record
  as it appeared to an earlier reviewer.
- The UI exposes stage-specific decision forms, separate final-inclusion forms,
  and remaining/included/conflict counts. Rich source, criterion, reviewer, and
  conflict filters remain a later screening-throughput enhancement.

### Quality Appraisal and Data Extraction

- Eligibility, appraisal, bibliographic metadata, and extracted study data are
  separate semantic authorities even when they reuse typed field primitives.
- A quality-assessment protocol declares stable question ids/text, answer ids
  and labels, numeric weights, rejecting answers, and an optional minimum score.
- Appraisal exposes dimension-level judgments before any derived total score.
  The `mlr` method configuration separately records credibility guidance for
  authority, objectivity, evidence support, currency, and outlet reputation;
  those dimensions do not silently become scored appraisal answers.
- Positive appraisal answers require an exact evidence quotation. A
  zero-weight or rejecting answer may instead record a bounded explicit
  absence rationale, so reviewers never fabricate a quotation to support a
  missing report element.
- Extraction fields support text, integer, decimal, Boolean, date, single or
  multiple controlled choices, and source selector values. Fields record
  required, optional, or conditional policy, may be single or repeatable, and
  may link to RQs. Single fields expose the latest append-only value; repeatable
  fields expose all recorded values.
- `not-reported`, `not-applicable`, and `unclear` are distinct missingness
  states and never collapse into an empty value.
- Appraisal and extraction events are append-only and reviewer-attributed, so
  independently recorded values remain inspectable. The current effective
  projection selects the latest appraisal answer per question and applies each
  extraction field's single or repeatable cardinality; a separate appraisal or
  extraction adjudication workflow is not yet native.
- Evidence selectors identify an authorized project PDF annotation or fragment,
  a project-shared PDF highlight, or a project-shared captured-web passage by
  `kind`, resource id, selector id, exact quote, page where applicable, and
  bounded location. The request selects an active project-review link, and the
  API independently verifies review membership, project membership, link
  status, resource identity, and selector identity against that project
  snapshot before accepting a new value. Legacy pointers without stable
  resource identity remain visibly `legacy-unresolved` and cannot be submitted
  as new evidence. Review access never broadens access to project evidence or a
  private Library source.
- A record is complete only when every quality question and every extraction
  field not marked optional has an effective value. Conditional expressions are
  retained as protocol data but are not yet evaluated by a native rule engine.
- The extraction form displays the latest recorded value, missingness reason,
  evidence pointer, reviewer, and time. Saving a later value is labelled as a
  superseding append-only action rather than presenting a blank form.
- Evidence snapshots retain the protocol's research-question identities so
  RQ-linked extraction fields validate and render consistently in the browser.

### Synthesis and Manuscript Integration

- Process analysis covers source yield, deduplication, screening progression,
  exclusions, conflicts, agreement, missing data, and PRISMA flow counts.
- Evidence synthesis covers typed extraction matrices, study characteristics,
  RQ coverage, cross-tabs, appraisal-sensitive views, formal-versus-grey
  comparisons, contradictions, and evidence-linked qualitative themes.
- The native analysis registry currently exposes versioned process, evidence,
  and report definitions. Every definition records type, exact review and
  protocol revision, generator schema, filters, columns, and dimensions.
  Counts, matrices, diagnostics, contributor ids, and current findings are
  derived on the server from that pinned review revision.
- Evidence analysis filters explicitly select the current final-inclusion
  outcome rather than treating full-text eligibility as corpus inclusion.
  Publication diagnostics block draft or mismatched revisions, unresolved
  duplicate/screening work, open amendment reassessments, incomplete included
  evidence, and missing contributor provenance.
- RQ findings are append-only researcher-authored synthesis events. Each one
  links its statement and interpretation to declared appraisal or extraction
  contributors and requires exact evidence for every contributor. Supersession
  preserves the complete finding history while synthesis exposes the current
  non-superseded findings.
- Publication selects one explicit active project link, verifies access to the
  review and linked project, and checks both the exact review revision and
  expected project revision. It materializes a named analysis under
  `review/{reviewId}/{artifactId}.md`, so several reviews can contribute to one
  project without path or publication-identity collisions and one review can
  publish independently into several projects.
- The project pin retains review UUID, project-link UUID, publication and
  artifact identity, review/protocol/analysis revisions, generator/schema,
  publisher, generation time, and content digest. Unlinking either resource or
  later mutating or deleting the review never rewrites that retained project
  materialization.
- `::review-artifact[review/{reviewId}/{artifactId}.md]` is the bounded
  canonical directive for a published review artifact. Preview and every
  publication target use the same composition resolver and require a matching
  artifact pin in the project snapshot. A pinned artifact file cannot be edited
  through ordinary project mutations; it must be regenerated through the
  revision-checked review publication route.
- Updating a review never silently changes an immutable project milestone or a
  previously materialized publication bundle.
- Native scope covers descriptive, qualitative, and mixed-evidence synthesis.
  Statistical meta-analysis uses exported data until a separate method and
  computation decision is approved.

### Reviewable Model Assistance

- Screening assistance returns one proposed decision, criterion where
  applicable, rationale, and exact title/abstract evidence.
- Extraction assistance returns typed proposed values and exact source
  selectors. Candidate creation and acceptance both select an active project
  link and resolve those selectors through independent review and project
  authorization before canonical review data can change. A model never invents
  `not reported` content.
- Native model assistance currently covers screening and extraction candidates.
  Any later coding or synthesis assistance must return bounded candidate codes,
  themes, or findings with contributing value ids and evidence selectors rather
  than writing findings directly.
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
- The review package manifest records schema, generator, stable review UUID,
  review revision, protocol revision, generation time, files, and SHA-256
  digests. It is independent of any linked writing project.
- Lossless structured authority JSON is the primary review interchange
  representation and includes reassessment plus append-only finding history.
  CSV provides long-form extraction values; the content-addressed relational
  backup payload, rather than CSV or a generated report, is the lossless
  recovery representation.
- BibTeX exports retain included, excluded, and pending bibliographic scope with
  explicit Kirjolab status. CSL JSON remains a later interchange adapter.
- Search history, screening decisions, appraisal, analysis definitions, model
  disclosure, PRISMA counts, and flow data are separately inspectable package
  entries.
- The PRISMA diagram is derived from flow data as portable SVG with an
  accessible title and description. A JSON representation remains the
  calculation authority.
- The deterministic ZIP contains `review.json`, long-form `extraction.csv`,
  `bibliography.bib`, PRISMA JSON/SVG, search history, event history, model
  disclosure, and separate analysis definitions, diagnostics, contributors,
  reassessment history, and complete evidence-linked finding history. Its
  manifest pins the schema, generator, review UUID, review and protocol
  revisions, generation time, byte counts, and SHA-256 file digests.
- DOCX may become an optional publication target but never becomes canonical
  review, analysis, or manuscript state.

### History, Backup, and Recovery

- Project-history snapshots retain each materialized review-artifact pin, while
  the independent ReviewStudy reconstructs its own protocol, reassessment,
  search, screening, evidence, model, finding, and synthesis projections at any
  retained review revision. Project snapshots do not own the live review.
- Owner backup schema v3 stores independent reviews as a top-level collection
  beside workspaces. Each entry retains the exact catalog record and locator,
  ReviewAccess state with membership and the complete active and unlinked link
  ledger, revision seed, and a content-addressed reference to the canonical
  ReviewStudy payload in R2.
- Before taking the v3 ReviewCatalog snapshot, the backup coordinator registers
  accessible legacy ReviewStudy data discovered through both active and
  archived project catalog entries. This removes UI access as a prerequisite
  for preserving a legacy review.
- The review payload is bounded to 64 MiB and serializes only allowlisted
  authoritative relational tables. Its reference pins byte count, payload
  digest, unblinded-authority digest, review and protocol revisions, and history
  floor. Verification rejects non-canonical bytes, owner-scope or review-id
  mismatches, digest or byte-count mismatches, and revision metadata that
  disagrees with the payload.
- Recovery drills restore v3 catalog, access, link, and ReviewStudy authorities
  into manifest-derived isolated identities, read them back through the live
  Durable Objects, and compare both digests, membership, links, locators, and
  every pinned revision. They never overwrite canonical review objects.
  Project-associated v2 and legacy v1 owner manifests remain readable under
  their historical compatibility semantics.
- Permanent project deletion first registers any existing unregistered legacy
  ReviewStudy, then marks that project's active review links unlinked and
  deletes only project-owned state and materializations. It does not delete an
  independent ReviewStudy. Permanent review deletion marks all active links
  unlinked, deletes review data, and removes each member's catalog entry without
  deleting projects or rewriting retained project-history artifacts. A compact
  ReviewAccess deletion tombstone retains the owner, membership fan-out, links,
  and deletion time long enough for interrupted cross-object cleanup to be
  retried; deleted reviews remain hidden from ordinary reads. Content-addressed
  backup retention remains an operator lifecycle, not active review state.

### API Contracts

- `GET /api/reviews` lists role-qualified summaries from the current identity's
  catalog; `POST /api/reviews` creates an independent review and returns its
  public summary. Catalog responses never expose the storage locator.
- `GET /api/reviews/{reviewId}` returns the authorized review summary, members,
  and permission-qualified active and unlinked project-link views.
  `PATCH /settings` changes owner-controlled title or lifecycle, and
  `DELETE /settings` permanently deletes the independent review.
- `GET`, `POST`, and `DELETE /members` inspect, invite, or remove review
  members. `GET` and `POST /project-links` inspect link history or create an
  owner-authorized link, and `DELETE /project-links/{linkId}` soft-unlinks one
  active relationship. Membership and link mutations mirror catalog or project
  projections without transferring authority.
- `GET /api/workspaces/{workspaceId}/reviews` returns the project's active and
  unlinked relationship projections after project authorization; it includes a
  review title and canonical link only when the caller independently has review
  access, otherwise it returns a review-access-required state.
- Every workflow route below is relative to `/api/reviews/{reviewId}` and
  retains independent review authorization.
  `/api/workspaces/{workspaceId}/review-study` remains an authenticated legacy
  adapter that registers and resolves the stable review before dispatch.
- `GET /review-study` returns the authorized review snapshot.
- `PUT /review-study/protocol` replaces the current editable protocol using
  revision preconditions.
  `POST /review-study/protocol/freeze` freezes it and
  `POST /review-study/protocol/amend` creates an editable successor with a
  rationale and explicit amendment impact.
- `GET /review-study/reassessments` lists amendment obligations and
  `POST /review-study/reassessments/{obligationId}/complete` records a
  revision-checked completion rationale.
- `POST /review-study/search-import-previews` validates bounded BibTeX without
  mutation; `GET` or `POST /review-study/search-runs` reads or confirms
  immutable runs.
- `POST /review-study/duplicate-candidates/{candidateId}/resolve` records an
  explicit duplicate resolution without discarding occurrences.
- `GET /review-study/screening` returns the reviewer projection.
  `/review-study/records/{recordId}/screening-decisions` appends a decision and
  `/screening-adjudications` resolves conflicts without deleting decisions.
- `/review-study/records/{recordId}/final-inclusion-decisions` appends the
  separate final corpus decision after full-text inclusion.
- `GET /review-study/evidence` returns the authorized evidence projection.
  `/review-study/records/{recordId}/quality-values` and `/extraction-values`
  append typed reviewer values under the pinned instrument or schema.
- `GET` or `POST /review-study/findings` lists or appends RQ findings after
  validating their contributor ids and exact project evidence selectors.
- `/review-study/model-candidates` creates or lists typed local-model proposals;
  `/review-study/model-candidates/{candidateId}/{accept|reject}` records the
  human disposition.
- `/review-study/synthesis`, `/review-study/synthesis.csv`, and
  `/review-study/synthesis.md` expose the same revision-pinned synthesis.
  The canonical `POST /review-study/synthesis/publish` request supplies
  `projectLinkId`, `expectedProjectRevision`, `reviewRevision`, `artifactId`,
  `analysisDefinitionId`, and a bounded `review/{reviewId}/*.md` path. The
  server resolves one active link, derives a bounded publication identity when
  omitted, writes only through the independently authorized document room, and
  returns the directive plus complete provenance pin.
- `/review-study/export/{artifact}` returns `review.json`, `extraction.csv`,
  `bibliography.bib`, `prisma.json`, `prisma.svg`, or `review.zip` with
  `Cache-Control: no-store`.
- Review mutations require review membership, same-origin validation, a current
  review revision where applicable, and bounded validated input. Owner-only
  settings, membership, link, and deletion routes enforce the catalog role.
  Evidence-bearing mutations and publication additionally require an active
  selected project link and independent project authorization; publication
  checks the exact project revision as well.

### Bounds and Security

- One identity catalog retains at most 200 reviews; one review retains at most
  200 members and 5,000 historical project links. Review titles contain at most
  120 characters, and review, member, link, and publication identities are
  bounded and validated before storage.
- One review retains at most 128 research questions, 128 concept groups, 1,024
  active terms, 128 sources, 512 criteria or typed schema fields, 256 search
  runs, 1,024 import batches, 100,000 occurrences, and 50,000 review records.
- One bibliographic import contains at most 20,000 records and 32 MiB of UTF-8
  input; the same 32 MiB byte bound applies cumulatively across a review's
  confirmed import batches. One review API JSON request is bounded to 2 MiB
  unless an import route declares the larger boundary.
- Strings, identifiers, arrays, selectors, and exported cell values have
  explicit field-level limits in the domain guards.
- Formula-looking CSV cells beginning with `=`, `+`, `-`, or `@` are escaped on
  export to prevent spreadsheet formula execution.
- Imported markup is inert text. Review UI never inserts database or model HTML
  into the DOM.
- Public review summaries omit storage locators. Project-link presentation
  exposes project title and navigation only after an independent project access
  check; otherwise it presents an access-required state.
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
- Do not infer final inclusion from a full-text include decision.
- Do not mix eligibility, appraisal, bibliographic metadata, and extraction
  semantics merely because their controls look similar.
- Do not reduce quality appraisal to an opaque total score.
- Do not create unsupported summaries or extracted values without exact
  evidence and researcher validation.
- Do not calculate the same report count independently in UI, API, diagram,
  and export code.
- Do not include a review-generated Markdown file through ordinary `::include`
  syntax or edit a pinned artifact by hand.
- Do not let review access disclose private PDFs, notes, captures, or library
  state.
- Do not use a workspace id as the canonical review identity, expose catalog
  storage locators, or move legacy ReviewStudy data merely to adopt UUID URLs.
- Do not change a review's SLR or MLR profile after creation or let catalog and
  protocol authorities advertise different profiles.
- Do not infer review access from project membership, project access from review
  membership, or either permission from a project-review link.
- Do not hard-delete link rows when unlinking, delete a review with its project,
  delete a project with its review, or rewrite pinned materializations after
  either resource is unlinked or deleted.
- Do not resolve project evidence or publication through an implicit owning
  project. Select and authorize an active link, pin both revisions, and retain
  complete review, link, publication, analysis, generator, and digest
  provenance.

## Contract

### Definition of Done

- [x] A researcher can create an independent SLR or MLR, manage its review
      membership and lifecycle, and edit, freeze, or amend its protocol without
      selecting a writing project.
- [x] Researchers can build concept groups, calibrate a logical query, and
      review source-specific field-scoped query renderings.
- [x] Immutable search runs can import BibTeX occurrences and preserve source
      counts through reviewed deduplication.
- [x] One or two reviewers can complete staged screening, inspect conflicts,
      and adjudicate without overwriting original decisions.
- [x] Full-text inclusion remains distinct from an append-only final-inclusion
      decision, and only final includes enter evidence and synthesis.
- [x] Protocol amendments declare affected stages or records and create
      inspectable reassessment obligations with attributed completion.
- [x] Included records support evidence-linked quality appraisal and typed data
      extraction with explicit missingness.
- [x] Researchers can append RQ findings whose declared appraisal or extraction
      contributors are all backed by exact authorized evidence selectors.
- [x] RQ-oriented process and evidence analyses derive from a pinned review
      revision and can enter the manuscript as named review artifacts.
- [x] Local models can propose screening and extraction candidates that require
      explicit human acceptance and produce an auditable disclosure.
- [x] JSON, CSV, BibTeX, PRISMA JSON/SVG, and deterministic review ZIP exports
      derive from the same review revision.
- [x] Explicit soft links support several reviews per project and several
      projects per review without implying access; revision-checked publication
      creates collision-free, fully pinned project artifacts.
- [x] Owner backup v3, recovery, and permanent deletion treat catalog, access,
      links, and ReviewStudy as an independent authority, while project history
      retains only its materialized pins.
- [x] `/review` lists the independent role-qualified catalog,
      `/review/{reviewId}` and `/api/reviews/{reviewId}` are canonical, and
      workspace-qualified browser and API routes remain bounded legacy
      adapters.
- [x] Domain and Workers-runtime suites cover versioning, exact historical
      projections, export, backup, authorization, and evidence contracts; a
      browser workflow covers planning through explicit final inclusion and
      evidence-stage gating.

### Regression Guardrails

- Existing writing, library, evidence, collaboration, history, backup, and
  export workflows remain usable for projects without a review study.
- A focused canonical route must resolve its UUID through the current identity's
  ReviewCatalog and ReviewAccess. A legacy workspace route must register the
  same stable UUID and membership snapshot exactly once, retain the original
  storage locator, and never create a duplicate ReviewStudy under concurrency.
- Project membership, review membership, and private Library ownership remain
  independent. Project-link creation, evidence selection, and publication must
  not weaken any of those checks.
- Project unlink or deletion leaves the live review intact. Review unlink or
  deletion leaves projects and retained materialized artifact pins intact.
- Review deletion removes collaborator catalog projections before destroying
  study/access authority, retains an owner-resolvable tombstone until final
  catalog cleanup, and is idempotent after interruption between Durable Object
  calls.
- Review mutations do not change Markdown or private-library state as an
  implicit side effect.
- Review revisions advance once per successful logical mutation and stale
  revision preconditions fail without partial writes.
- Search and PRISMA counts remain reproducible from retained occurrences and
  events after deduplication, screening, amendment, and restore.
- Derived outputs disclose their review revision, definitions, filters, and
  generator versions.
- A synthesis whose pinned revision has open reassessment obligations remains
  inspectable but cannot be published as a project artifact.
- Model failure or rejection leaves canonical review and manuscript state
  unchanged.
- Exported archives remain traversal-free, private, deterministic, and bounded.
- A v3 recovery drill restores catalog, access, links, and ReviewStudy into
  isolated identities and never overwrites canonical review or project state;
  v1 and v2 inputs retain their historical compatibility behavior.

### Verification

- Pure domain tests cover guards, bounds, query rendering, duplicate grouping,
  stage projection, appraisal/extraction typing, analysis calculations, CSV
  safety, PRISMA flow derivation, and deterministic manifests.
- Workers tests cover ReviewCatalog, ReviewAccess, and ReviewStudy schema
  migration and eviction; atomic legacy identity seeding; catalog and membership
  authorization; partial-link reconciliation; archived pre-backup registration;
  legacy preservation on project deletion; many-to-many soft links; canonical and compatibility adapters;
  atomic revisions; protocol freeze/amendment; import; deduplication;
  independent decisions; adjudication; evidence selectors; candidate review;
  independent v3 backup, restore, and deletion; and v1/v2 compatibility.
- View and client tests cover independent creation controls and navigation,
  project-link permission states, canonical UUID APIs, and explicit publication
  requests. Browser tests cover the canonical independent review workflow,
  structured protocol planning, freezing, immutable import, title-and-abstract
  and full-text decisions, separate final inclusion, and evidence-stage gating.
  Domain and Workers tests cover the lower-level conflict, exact-selector,
  synthesis publication, artifact-pin provenance, disclosure, export, backup,
  and restore boundaries.
- The full quality gate and local Agent CI pass before the feature is treated as
  ready.

### Scenarios

**Scenario: Researcher calibrates and freezes a protocol**

- Given: an editable SLR protocol with RQs, concept groups, validation records,
  sources, criteria, appraisal items, and extraction fields
- When: the researcher reviews generated source queries and freezes the protocol
- Then: every planning resource receives one immutable protocol revision and
  later edits require a documented amendment

**Scenario: Researcher opens focused review work**

- Given: an authorized review appears in the researcher's independent catalog
- When: the researcher opens `/review/{reviewId}`
- Then: Kirjolab renders the review workflow outside manuscript authoring chrome
  after resolving ReviewAccess, without selecting a writing project or granting
  access to one

**Scenario: Legacy review registration is stable**

- Given: a project-associated ReviewStudy exists under its workspace storage
  key and has not yet entered a ReviewCatalog
- When: authorized project members concurrently use the legacy browser or API
  route
- Then: ReviewAccess assigns exactly one review UUID and membership snapshot,
  every seeded member receives the same locator, the project link is explicit,
  and no ReviewStudy rows move

**Scenario: One review supports several manuscripts**

- Given: a review owner can access two writing projects
- When: they link both projects to the review
- Then: each stable link remains an access-neutral relationship and either
  project can receive its own revision-pinned publication without copying or
  re-identifying the live review

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

**Scenario: Full-text eligibility does not imply final inclusion**

- Given: a record has an included full-text screening outcome
- When: no final-inclusion decision has been recorded
- Then: the record remains outside appraisal, extraction, evidence synthesis,
  and the reported included-study count

**Scenario: A frozen protocol is amended**

- Given: a frozen protocol and active review records
- When: a researcher records an amendment naming affected stages and records
- Then: the earlier protocol and events remain unchanged, the new revision pins
  its impact, and inspectable reassessment obligations remain open until
  completed with an actor and rationale; derived output publication remains
  blocked while they are open

**Scenario: Extraction remains grounded**

- Given: a finally included paper and an active link to a project whose
  rights-checked shared PDF the reviewer can access
- When: a reviewer records a key finding from a selected passage
- Then: the typed extraction value retains its RQ, reviewer, schema revision,
  project-link context, PDF selector, and exact source quotation

**Scenario: A finding remains evidence-linked**

- Given: current appraisal or extraction values for one research question
- When: a researcher records or supersedes an RQ finding
- Then: every declared contributor has an exact authorized evidence link, the
  previous finding remains in history, and synthesis exposes the current one

**Scenario: Review evidence enters the manuscript**

- Given: a named analysis over a pinned review revision and an active authorized
  link to a writing project at an exact revision
- When: the reviewer publishes it and the author inserts the returned review-
  artifact directive
- Then: preview and export render the same materialization and its pin exposes
  the review, link, publication, both revisions, analysis, generator, publisher,
  time, digest, and contributing evidence

**Scenario: Model assistance remains transparent**

- Given: assisted screening or extraction is enabled
- When: a researcher accepts, edits, or rejects a local-model proposal
- Then: the human disposition and complete bounded model provenance enter the
  disclosure while rejection changes no canonical review data

**Scenario: Linked lifecycles remain independent**

- Given: a project retains a materialized artifact from a linked review
- When: the link is removed or either live resource is permanently deleted
- Then: the other live resource is not deleted, the link remains auditable as
  unlinked, and the project's retained artifact pin is never rewritten

**Scenario: Researcher archives a reproducible review**

- Given: a completed review revision
- When: the researcher exports the review package
- Then: JSON, CSV, bibliography, PRISMA data and SVG, audit logs, disclosure,
  and manifest agree on the same revision and deterministic digests
