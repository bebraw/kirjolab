# Dependency Reduction Notes

**Date:** 2026-07-25

## Purpose

Kirjolab has grown beyond 100,000 lines across source, tests, and tooling. The
goal of dependency adoption is not to minimize the repository mechanically. It
is to retire project-owned implementations of commodity infrastructure while
keeping product rules, security bounds, and durable authorities explicit.

The current codebase is large but not broadly unhealthy. The local Fallow
diagnostics report an 81/B health score, average cyclomatic complexity of 3,
5% duplication, and one dominant churn hotspot: `src/client/app.ts`.

## Evidence

- Runtime validation is distributed across 203 `is…`, `parse…`, `validate…`,
  and `assert…` functions. Forty-three files define their own `isRecord`
  helper.
- `src/client/app.ts` is 12,495 lines and combines a large typed element
  registry with event binding, rendering, and feature orchestration.
- `src/integrations/github-app.ts` and
  `src/integrations/github-user.ts` contain about 860 lines of handwritten
  GitHub authentication and REST protocol code.
- `src/domain/bibliography.ts` implements a deliberately bounded 240-line
  BibTeX parser and serializer.
- `src/client/offline-workspace.ts` contains about 70 lines of direct IndexedDB
  promise and transaction plumbing.

## Recommended Sequence

### 1. Pilot schema validation at one trust boundary

Adopt Valibot for a coherent family of external or persisted payloads. A schema
should become the single runtime contract and infer its TypeScript output type
where doing so removes a duplicated interface or type guard.

The pilot must:

- preserve all existing bounds and accepted payloads;
- remain local to one contract family;
- keep cross-record and stateful business invariants in domain functions;
- avoid converting internal predicates merely for consistency; and
- demonstrate a net reduction in maintained validation code.

The library-interchange boundary is the preferred pilot because its CSL JSON
and portable research payloads are explicit, versioned, and already covered by
focused tests and a living spec.

### 2. Pilot decomposed Octokit packages

Replace only commodity GitHub protocol work: App authentication, installation
tokens, authenticated request construction, and standard request errors. Keep
Kirjolab's repository selection, path normalization, content limits, response
normalization, concurrency checks, and safe public error mapping.

Prefer decomposed Octokit packages over the all-in-one SDK. Preserve injected
`fetch` support so tests and Workers runtime behavior remain deterministic.

### 3. Pilot one Lit component

Extract one bounded, low-coupling browser surface from `WorkspaceApp` into a
Lit custom element. The component should own its local template, element
references, reactive presentation state, and DOM events while emitting typed
intent events to the existing application coordinator.

The pilot must not:

- turn Lit into a global application store;
- move Yjs, XState actors, network authority, or persisted domain state into
  the component;
- require client-side ownership of the whole server-rendered shell; or
- introduce a second visual language.

The GitHub connection/import presentation is the preferred pilot because it
has bounded state, explicit user intents, and existing contract tests.

## Deferred Options

- Adopt Citation.js only when broader BibTeX, BibLaTeX, RIS, or CSL
  interoperability becomes a product requirement. The current bounded parser
  is smaller than the adaptation layer would likely be today.
- Adopt `idb` when a second browser database store or schema migration appears.
  The current saving is too small to justify a dependency by itself.
- Do not adopt a Worker router solely to reduce conditional route matching.
  Most API volume is authorization and product workflow logic.
- Keep explicit LaTeX ZIP envelope validation. It enforces Kirjolab-specific
  security and resource bounds beyond decompression.

## Evaluation Gates

Each pilot receives its own commit and must pass targeted tests, affected
guardrails, and the full native local CI gate before the sequence is considered
ready. Record lasting constraints in an ADR and update the affected feature spec
in the same commit as the implementation.

Continue to the next pilot only when the preceding change preserves behavior
and leaves a narrower project-owned maintenance surface. A pilot that adds
abstraction without deleting equivalent infrastructure should be reverted or
kept out of the production path.

## Pilot Outcome Clarification

The Lit pilot's first component adds more source lines than it removes because
it establishes the reactive boundary and preserves server-rendered fallback
markup. It is accepted on the basis of reduced long-term coordination
complexity: `WorkspaceApp` now addresses one typed GitHub connection surface
instead of its internal status and action elements. This is a deliberate
exception to the immediate line-reduction gate, not permission to wrap static
markup. Later components must retire meaningful element-registry, imperative
rendering, or event-wiring complexity.

### Browser response schemas: accepted

The second Valibot boundary consolidates GitHub, LaTeX import, snapshot
comparison, annotation, and share-link response validators in
`src/client/app-contracts.ts`. Existing malformed-field tests pass unchanged,
and the module is 96 lines smaller after removing nested handwritten predicates
and parallel structural return types.

### GitHub sync menu component: accepted

The second Lit boundary moves synchronization labels, repository detail,
relationship tone, action availability, and four local intent bindings behind
one typed component. `WorkspaceApp` drops eight internal element references and
25 lines while retaining refresh timing, requests, previews, and settings
authority. Existing Pull and Push browser workflows pass unchanged.

### Project history response schemas: accepted

The third Valibot boundary replaces independent summary, retained-content, and
comparison predicates with composable schemas. It removes 27 lines while
making shared revision/count constraints and composed word-delta arithmetic
explicit; the existing malformed-field matrix passes unchanged.

### Shared bounded GitHub response reader: accepted

GitHub App and user clients now share incremental response-size enforcement and
JSON parsing while retaining distinct byte ceilings and public error types.
This removes duplicate stream plumbing without adopting Octokit's unbounded
OAuth request path.

### GitHub import picker component: accepted

The third Lit boundary moves local import fields, option rendering, readiness,
preview/status DOM, and Cancel/Confirm intents behind one component.
`WorkspaceApp` drops ten internal element references, its repository-option
cache, and about 100 lines of imperative picker and preview coordination.
Connection, repository discovery, preview requests, and project creation remain
with the application coordinator.

### Shared scholarly response reader: accepted

Crossref, DataCite, OpenAlex, and Semantic Scholar now use the same stateless,
request-local bounded stream and JSON reader. Provider-specific 1 MB ceilings,
errors, structural checks, and metadata mappings remain local. The change
removes 123 duplicated lines while adding 52 shared and adapter lines, for a net
reduction of 71 source lines without adding a dependency.

### Project starting-point component: accepted

The fourth Lit boundary moves template and existing-project grouping,
selection, preview rendering, and local project-preview state out of
`WorkspaceApp`. The coordinator drops three internal element references and
247 source lines while retaining fetches, deferred deletion, and project
creation. The component adds 321 focused source lines, so total executable
source grows by 81 lines while the primary churn hotspot becomes narrower.
Reusing the existing Lit dependency adds no production packages; the minified
browser application changes by +1,307 B raw and +339 B gzip from the recorded
baseline.

### Shared local-model response reader: accepted

The OpenAI-compatible browser adapter now uses the same request-local bounded
JSON reader as GitHub and scholarly integrations. Its 256 KiB ceiling, fatal
UTF-8 decoding, and distinct empty and malformed response errors remain
explicit. The refactor removes the fifth streamed JSON implementation and five
net source lines; the generalized decoder option changes the minified browser
application by +358 B raw and +127 B gzip.

### GitHub sync review component: accepted

The fifth Lit boundary moves Pull and Publish diff rendering, conflict choices,
commit-message input, progress, readiness, and seven local control references
out of `WorkspaceApp`. The coordinator retains preview identities, requests,
project refresh, mutations, and disconnect confirmation. `WorkspaceApp` drops
147 net lines while the focused component adds 364 lines; total executable
source grows by 222 lines while the main churn hotspot loses another complete
presentation workflow. Reusing Lit adds no production packages; the minified
browser application changes by +3,722 B raw and +499 B gzip.

### Review-model schemas: accepted

The fourth Valibot boundary consolidates candidate creation requests with the
persisted candidate snapshot envelope. Operation, stage, provenance,
disposition, and result-envelope structure now have one schema-backed runtime
definition; extraction compatibility and evidence invariants remain explicit
domain functions. The pilot removes 30 net executable source lines without a
new package or a new validation concept.

### GitHub App responsibility split: accepted

The App integration now isolates credential normalization, Octokit signing,
installation-token exchange, bounded HTTP, and provider-error projection from
repository tree and commit orchestration. The public client contract and all
request-scoped Worker behavior stay unchanged. The split grows executable
source by 31 lines, but reduces the former 446-line mixed-responsibility module
to a 344-line repository client and a 133-line transport with one directional
dependency.

### Reproducible dependency-cost diagnostic: accepted

`npm run diagnostics:dependencies` now reproduces the package and complete
browser-artifact measurements used by these pilots. It reads the lockfile and
existing build outputs, reports Markdown or JSON, uses deterministic level-9
gzip, writes no state, and adds no package. Esbuild package attribution remains
an explicit deeper measurement rather than pretending gzip savings can be
assigned reliably per dependency.

### Shared assistant revision acceptance: accepted

The post-pilot duplicate audit found three copies of the same XState transition,
candidate persistence, success, failure, and availability-refresh sequence for
idea, phrasing, and clarity choices. One private workflow now owns that
sequence while each operation supplies its instruction and messages. Together
with two unused type exports exposed by the same audit, the cleanup removes 38
net executable source lines without changing behavior or adding a concept.

### Shared horizontal resizer lifecycle: accepted

The clean audit's largest remaining clone was the pointer capture, drag,
cancel, release, and PDF-resize lifecycle duplicated by the source rail and
authoring/context divider. One private binder now owns that browser lifecycle;
each resizer retains its distinct geometry, keyboard behavior, persistence, and
ARIA updates. The change removes 12 net executable lines.

### Shared source-completion option shell: accepted

Include-path and citation suggestions now share their button identity, option
role, code/metadata structure, pointer focus retention, and hover selection
behavior. Their content, optional Library action, and synchronous or async
acceptance remain supplied by each completion family. This removes the
remaining 10-line completion clone and five net executable lines.

## Final Re-audit and Stopping Point

The clean post-sequence audit reports 13,987 production LOC, zero dead files,
zero dead exports, 2.6 average cyclomatic complexity, and 88.2 maintainability.
Five clone groups remain, each only 6–9 lines:

- two review-request envelopes whose distinct domain errors and fields outweigh
  a shared parser;
- one record predicate shared only by the separated GitHub transport and
  repository layers;
- three small browser presentation fragments whose extraction would add as
  much parameter and helper surface as it removes.

Fallow also reports public Lit component methods and the installation transport
entrypoint as unused because their callers cross custom-element and class-module
boundaries. They are exercised by the browser and GitHub integration suites and
must not be deleted.

This is the current stopping point for opportunistic reduction. Resume when a
new dependency can retire a coherent responsibility, another trust-boundary
family produces a clear net schema reduction, or a repeated workflow grows
beyond these small local fragments.

## Dependency Cost Baseline

Measured from commit `74dc3b1` after `npm run ci:local` rebuilt the browser
artifacts:

| Measure                                 | Baseline       |
| --------------------------------------- | -------------- |
| Direct production dependencies          | 18             |
| Unique production package/version nodes | 150            |
| Browser application                     | 652,499 B raw  |
| Browser application                     | 184,812 B gzip |
| Lazy Markdown runtime                   | 204,779 B raw  |
| Lazy Markdown runtime                   | 62,504 B gzip  |
| Lazy PDF.js runtime                     | 481,994 B raw  |
| Lazy PDF.js runtime                     | 146,696 B gzip |
| Styles                                  | 134,696 B raw  |
| Styles                                  | 23,422 B gzip  |

Esbuild metadata attributes these minified bytes in the relevant output:

| Dependency          | Production closure | Browser application | Worker analysis |
| ------------------- | -----------------: | ------------------: | --------------: |
| Lit                 |                  6 |            14,783 B |               — |
| Valibot             |                  3 |             7,055 B |        10,017 B |
| `@octokit/auth-app` |                 16 |                   — |        30,266 B |

Production closure is the number of unique package/version nodes reachable
from that direct dependency in `npm ls --omit=dev --all --json`. Output
attribution is the sum of esbuild `bytesInOutput` for the dependency family.
The Worker number comes from a transient minified analysis bundle with
Cloudflare and build-only Node imports externalized; it is useful for comparing
dependencies, not as a deployed Worker-size claim. Gzip is reported only for
complete outputs because compression savings cannot be assigned reliably to
one dependency.

### Admission rule for later pilots

A new dependency should be accepted only when it retires a coherent
project-owned maintenance responsibility and records all of the following:

- direct and transitive production-package cost;
- minified bytes attributed in each affected browser or Worker output;
- source code, tests, and concepts removed or made local;
- the product-specific bounds and authorities that remain; and
- targeted tests plus the full native CI result.

Prefer an existing dependency or a source-local helper when it produces the
same reduction. Keep large optional browser capabilities behind the existing
lazy runtime boundaries. Do not treat fewer source lines alone as success when
the dependency adds a broader API, state owner, or upgrade surface.

## Continued Lit Extraction: Workspace Sharing

The authenticated workspace sharing dialog is a successful follow-on Lit
boundary. `WorkspaceApp` now addresses one `WorkspaceSharingPanel` instead of
fifteen member, invitation, and share-link elements. The component owns local
rendering, invitation input, clipboard interaction, and typed intent events;
the coordinator continues to own every fetch, response validation,
authorization outcome, and toast policy.

This checkpoint reduces `src/client/app.ts` from 11,914 to 11,833 lines
(-81). The focused component adds 242 lines, including the light-DOM template
and server-fallback-compatible event contract. The trade remains intentional:
the primary coordinator shrinks, access authority stays explicit, and later
changes to the sharing surface have one browser presentation owner.

Targeted affected guardrails, the read-only and edit-link browser workflows,
and the collaborator invitation workflow pass. Full native CI passes all 1,197
unit/coverage tests, 120 Workers-runtime tests, and 73 browser tests. The
rebuilt browser application is 658,628 B raw and 185,728 B gzip, an increase of
2,247 B raw and 607 B gzip from the preceding checkpoint; direct and unique
production package counts remain unchanged.

## Continued Lit Extraction: Workspace Catalog

The Projects browser is another successful bounded Lit extraction.
`WorkspaceApp` now addresses one `WorkspaceCatalogPanel` instead of its close
control, filter input, and result container. The component owns query state,
filtered rows, empty states, project metadata labels, and focus reset; the
coordinator still fetches and validates the catalog, updates the compact
workspace switcher, and retains navigation authority.

This checkpoint reduces `src/client/app.ts` from 11,833 to 11,800 lines (-33).
The focused component adds 116 lines. Its pure filter and metadata contracts
have unit coverage, and the existing isolated-workspace browser workflow covers
filtering, current-project labelling, empty results, and closing the dialog.
Full native CI passes all 1,200 unit/coverage tests, 120 Workers-runtime tests,
and 73 browser tests. The rebuilt browser application is 660,167 B raw and
185,944 B gzip, an increase of 1,539 B raw and 216 B gzip from the sharing
checkpoint; dependency counts remain unchanged.

## Continued Lit Extraction: Project History

Revision history is the largest successful extraction in this continuation.
`WorkspaceApp` now addresses one `ProjectHistoryPanel` instead of six timeline,
comparison, and inspector elements. The component owns local selection,
timeline cards, milestone labels, busy and error presentation, read-only
revision inspection, diff presentation, and typed operation intents. The
coordinator retains its XState workflow, request generations, validation,
confirmation prompts, fetches, mutations, reloads, and navigation.

This checkpoint reduces `src/client/app.ts` from 11,800 to 11,703 lines (-97).
The focused component adds 263 lines and reaches 90% statement coverage through
timeline, inspector, comparison, selection, and intent tests. The existing
browser workflow passes across inspect, compare, milestone, restore, and branch
operations. Full native CI passes all 1,202 unit/coverage tests, 120
Workers-runtime tests, and 73 browser tests. The rebuilt browser application is
663,150 B raw and 187,028 B gzip, an increase of 2,983 B raw and 1,084 B gzip
from the catalog checkpoint; dependency counts remain unchanged.

## Continued Lit Extraction: Writing Workflow Outlines

Research questions and reviewer responses now reuse one bounded
`WritingWorkflowPanel` rather than maintaining parallel imperative list
renderers. Two instances own Markdown-to-item presentation adaptation, counts,
empty states, action labels, download readiness, and typed open, download, and
source-selection intents. `WorkspaceApp` retains workflow-file creation,
response-letter export, and source navigation.

This checkpoint reduces `src/client/app.ts` from 11,703 to 11,665 lines (-38)
and replaces five internal element references with two component references.
The shared component adds 194 lines and reaches 92.5% statement coverage across
both workflow kinds, missing and empty states, populated lists, and every
intent. A focused browser workflow passes through creation and rendering of
both portable ledgers. Full native CI passes all 1,205 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests. The rebuilt browser application is
664,646 B raw and 187,552 B gzip, an increase of 1,496 B raw and 524 B gzip
from the history checkpoint; dependency counts remain unchanged.

## Continued Lit Extraction: Assistant Results

The Writing assistant's transient outputs now share one bounded
`AssistantResultPanel` instead of six imperative renderers and their local
button bindings. The component owns validated-table previews, the focused
clarity answer, idea and rewrite choices, reference-discovery cards, typed
intent construction, and local reference-save progress. `WorkspaceApp` keeps
the captured manuscript context, XState workflow, model requests, stale-target
checks, candidate persistence, canonical Markdown edits, and Library imports.

This checkpoint reduces `src/client/app.ts` from 11,665 to 11,559 lines (-106).
The focused component adds 305 lines and avoids direct DOM writes inside Lit's
light-DOM render root. Focused component and server-shell tests pass, as do the
affected unit tests and typecheck. The same simplification pass removed a
redundant reviewer-response export condition: canonical matrix-file existence
now defines readiness without racing transient parser output during
collaboration hydration. The component reaches 93.5% statement coverage and
the global suite remains above its threshold at 90.03%.

Full native CI passes all 1,209 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests, including the complete clarity, ideation, phrasing,
table, and reference-discovery workflow. The rebuilt browser application is
668,018 B raw and 188,591 B gzip, an increase of 3,372 B raw and 1,039 B gzip
from the writing-workflow checkpoint. Direct and unique production package
counts remain unchanged.

## Continued Lit Extraction: Project Map

The Project Map now has one bounded `ProjectMapPanel` instead of imperative
node, lane, connector, resize, focus, and hover management in `WorkspaceApp`.
The component owns its light-DOM projection, measured SVG geometry, responsive
relayout, transient emphasis, and typed resource-selection intent. The
coordinator continues to derive the canonical graph and own navigation.

This checkpoint reduces `src/client/app.ts` from 11,559 to 11,356 lines (-203)
and removes three internal element references plus two coordinator fields. The
233-line component keeps connector geometry in the existing pure layout module;
that module and the component reach 100% and 94.2% statement coverage,
respectively. The focused evidence-to-prose browser workflow verifies contained,
non-overlapping cards and connector alignment at desktop and compact widths.

Full native CI passes all 1,216 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The rebuilt browser application is 668,968 B raw and
189,050 B gzip, an increase of 950 B raw and 459 B gzip from the assistant
results checkpoint. Direct and unique production package counts remain
unchanged at 18 and 150.

## Continued Lit Extraction: Candidate Review

Grounded revision and claim-draft review now use one bounded
`CandidateReviewPanel` instead of thirteen candidate-specific element
references and separate imperative copy, status, evidence, and action
renderers. The component owns before/after and provenance presentation,
decision readiness and progress, local scroll state, and typed apply, reject,
and evidence-navigation intents. `WorkspaceApp` retains applicability checks,
XState transitions, canonical mutations, failure policy, and source navigation.

This checkpoint reduces `src/client/app.ts` from 11,356 to 11,235 lines (-121).
The 214-line component reaches 93.47% statement coverage and 95.23% line
coverage across revision, claim-draft, terminal, stale, busy, failure, scroll,
and intent states. Focused browser workflows pass for stale rejection, exact
revision application, claim creation, and evidence navigation.

Full native CI passes all 1,220 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The rebuilt browser application is 671,878 B raw and
189,811 B gzip, an increase of 2,910 B raw and 761 B gzip from the project-map
checkpoint. Direct and unique production package counts remain unchanged at 18
and 150.

## Continued Lit Extraction: Publication Context

Publication inspection now uses one bounded `PublicationContextPanel` instead
of eight metadata, paper-list, citation, scroll, and project-PDF linking element
references. The component owns scholarly metadata, linked-paper variants,
available project-PDF options, citation readiness, local scroll state, and
typed citation, paper, link, and unlink intents. `WorkspaceApp` retains
manuscript insertion, PDF navigation, authorization-sensitive API mutations,
and workspace refreshes.

This checkpoint reduces `src/client/app.ts` from 11,235 to 11,149 lines (-86).
The 208-line component reaches 93.18% statement coverage and 94.73% line
coverage across empty and populated metadata, project, private-library and
shared-reference papers, citation readiness, linking, unlinking, opening, and
scroll state. Focused browser workflows pass through citation insertion,
project-PDF linking, opening and disconnecting, and DOI intake.

Full native CI passes all 1,225 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The rebuilt browser application is 674,062 B raw and
190,183 B gzip, an increase of 2,184 B raw and 372 B gzip from the candidate
review checkpoint. Direct and unique production package counts remain unchanged
at 18 and 150.

## Continued Lit Extraction: Knowledge Search

Project-map search now uses one bounded `KnowledgeSearchPanel` instead of three
form, input, and results element references plus imperative result-card
rendering. The component owns trimmed query capture and empty, populated,
hidden, and error presentation while emitting typed search and
resource-selection intents. `WorkspaceApp` retains the authorized fetch,
response validation, overview visibility, and resource navigation.

This checkpoint reduces `src/client/app.ts` from 11,149 to 11,123 lines (-26).
The 114-line component reaches 90% statement coverage and 93.1% line coverage.
The focused evidence-to-prose browser workflow passes search results, resource
selection, and clearing back to the map overview.

Full native CI passes all 1,227 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The rebuilt browser application is 675,522 B raw and
190,633 B gzip, an increase of 1,460 B raw and 450 B gzip from the publication
context checkpoint. Direct and unique production package counts remain
unchanged at 18 and 150.

## Continued Lit Extraction: Claim List

The Claims collection now uses one bounded `ClaimListPanel` instead of five
imperative claim, grounding, evidence-link, passage-link, and action render
helpers. The component owns empty and populated claim presentation, grounding
checkbox state, evidence and manuscript link presentation, and typed claim,
selection, and navigation intents. `WorkspaceApp` retains selection authority,
dialogs, mutations, confirmations, refreshes, and source navigation.

This checkpoint reduces `src/client/app.ts` from 11,123 to 11,033 lines (-90).
The component adds 181 lines and reaches 93.47% statement coverage and 94.11%
line coverage. Four small shared evidence and anchor presentation functions
moved from the coordinator into a 20-line tested module instead of being
duplicated by the component. Focused browser workflows pass claim creation,
atomic replacement, evidence selection, passage linking, candidate grounding,
and deletion.

Full native CI passes all 1,231 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The rebuilt browser application is 678,143 B raw and
191,345 B gzip, an increase of 2,621 B raw and 712 B gzip from the knowledge
search checkpoint. Direct and unique production package counts remain unchanged
at 18 and 150.

## Continued Lit Extraction: Manuscript Comments

The manuscript comment collection now uses one bounded
`ManuscriptCommentList` instead of imperative empty-state, comment-card,
anchor-status, and action rendering. The component owns comment presentation
and emits typed open, re-anchor, and resolve intents. `WorkspaceApp` retains
comment creation, selected-passage authority, API mutations, refreshes, toast
policy, and source navigation.

This checkpoint reduces `src/client/app.ts` from 11,033 to 11,009 lines (-24).
The component adds 110 lines and reaches 87.5% statement coverage and 89.47%
line coverage across empty and populated lists, current and stale anchors, and
all three action intents. The focused collaboration browser workflow passes
comment creation, stale-anchor presentation, re-anchoring, opening, and
resolution.

Full native CI passes all 1,233 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The rebuilt browser application is 680,010 B raw and
191,601 B gzip, an increase of 1,867 B raw and 256 B gzip from the claim-list
checkpoint. Direct and unique production package counts remain unchanged at 18
and 150.

## Continued Lit Extraction: Project Publications

The project References collection now uses one bounded `PublicationListPanel`
instead of imperative empty-state, reference-card, metadata-label, and action
rendering. The component owns publication presentation and emits typed open,
Library-management, and metadata-enrichment intents. `WorkspaceApp` retains
context navigation, authorized Library and enrichment operations, refreshes,
and count presentation.

This checkpoint reduces `src/client/app.ts` from 11,009 to 10,984 lines (-25).
The component adds 127 lines and reaches 89.28% statement coverage and 90.9%
line coverage across empty, enrichable, DOI-free, and project-linked reference
states plus all three action intents. Focused browser workflows pass
publication opening, Library management, project-PDF context, and DOI
enrichment.

Full native CI passes all 1,235 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The rebuilt browser application is 682,060 B raw and
191,844 B gzip, an increase of 2,050 B raw and 243 B gzip from the
manuscript-comments checkpoint. Direct and unique production package counts
remain unchanged at 18 and 150.

## Continued Lit Extraction: Candidate Queue

The Writing assistant candidate queue now uses one bounded `CandidateListPanel`
instead of imperative empty-state, revision-card, claim-draft, and review-action
rendering. The component owns candidate summary presentation and emits one
typed review-opening intent. `WorkspaceApp` retains generation, canonical
candidate state, context navigation, applicability checks, and decisions.

This checkpoint reduces `src/client/app.ts` from 10,984 to 10,967 lines (-17).
The component adds 78 lines and reaches 85.71% statement coverage and 89.47%
line coverage across empty, revision, and claim-draft states plus known and
unknown selections. Focused browser workflows pass candidate rendering,
opening, stale review, evidence navigation, and evidence-backed application.

Full native CI passes all 1,237 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The rebuilt browser application is 682,884 B raw and
192,016 B gzip, an increase of 824 B raw and 172 B gzip from the
project-publications checkpoint. Direct and unique production package counts
remain unchanged at 18 and 150.

## Continued Lit Extraction: Context Tab Overview

The context overflow menu now uses one bounded `ContextTabOverview` instead of
three element references plus imperative visibility, count, row, and close
rendering. The component owns overflow presentation and emits typed activate
and close intents. `WorkspaceApp` retains tab-title resolution, routing,
canonical context state, focus restoration, and transitions.

This checkpoint reduces `src/client/app.ts` from 10,967 to 10,921 lines (-46).
The component adds 116 lines and reaches 86.95% statement coverage and 90.47%
line coverage across hidden, populated, standalone-Library, permanent-tab,
resource-tab, known-action, and rejected-action states. The focused research
context browser workflow passes overflow visibility, activation, closing, and
focus restoration.

Full native CI passes all 1,239 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The rebuilt browser application is 683,986 B raw and
192,336 B gzip, an increase of 1,102 B raw and 320 B gzip from the
candidate-queue checkpoint. Direct and unique production package counts remain
unchanged at 18 and 150.

## Continued Lit Extraction: Context Resource Tabs

The dynamic context resource-tab strip now uses one bounded
`ContextResourceTabs` instead of an imperative tab and close-button renderer.
The component owns resource-tab markup, active-state presentation, panel
associations, the shared tab-id contract, and typed activate and close intents.
`WorkspaceApp` retains title resolution, keyboard focus, routing, canonical
context state, panel labelling, and transitions.

This checkpoint reduces `src/client/app.ts` from 10,921 to 10,898 lines (-23).
The component adds 116 lines and reaches 86.95% statement coverage and 90.47%
line coverage across empty, publication, candidate, PDF, active, inactive,
known-action, and rejected-action states. The focused research-context browser
workflow passes tab rendering, activation, closing, keyboard focus, and panel
labelling.

Moving the final browser-side icon use out of `WorkspaceApp` also lets the
browser bundle drop the otherwise unused shared icon-rendering module. The
full native CI passes all 1,241 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The rebuilt browser application is 682,761 B raw and
191,653 B gzip, a decrease of 1,225 B raw and 683 B gzip from the
context-tab-overview checkpoint. Direct and unique production package counts
remain unchanged at 18 and 150.

## Continued Lit Extraction: Project Evidence

Project PDFs and annotations now use one bounded `ProjectEvidencePanel` instead
of five element references plus imperative PDF cards, annotation cards,
grouping, counts, visibility, passage links, and stroke controls. The component
owns presentation and local expanded state while emitting typed navigation,
grounding, and mutation intents. `WorkspaceApp` retains API mutations,
confirmations, editor selection, grounding authority, PDF navigation,
refreshes, and toast policy.

This checkpoint reduces `src/client/app.ts` from 10,898 to 10,681 lines (-217).
The component adds 359 lines and reaches 96.22% statement coverage and 96.15%
line coverage across empty, assigned, unassigned, linked, selected, expanded,
PDF, annotation, passage, and fragment-control states. Focused browser
workflows pass PDF opening and removal guards, highlight creation, extension,
editing, geometry adjustment, erasing, deletion, grounding selection,
passage-link presentation, and evidence-backed model navigation.

Full native CI passes all 1,244 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The rebuilt browser application is 686,789 B raw and
192,209 B gzip, an increase of 4,028 B raw and 556 B gzip from the
context-resource-tabs checkpoint. Direct and unique production package counts
remain unchanged at 18 and 150.

## Continued Lit Extraction: Project Tree

The Files rail now uses one bounded `ProjectTreePanel` instead of three element
references plus imperative filtering, sorting, folder, file, image, and action
menu rendering. The component owns local filter state, sorted hierarchy
presentation, active and entry labels, keyboard quick-open, and typed file,
folder, and image intents. `WorkspaceApp` retains file and folder mutations,
editor rebinding, include insertion, image operations, API access, and toast
policy.

This checkpoint reduces `src/client/app.ts` from 10,681 to 10,549 lines (-132).
The component adds 229 lines and reaches 89.33% statement coverage and 90%
line coverage across empty, sorted, nested, active, entry, filtered,
quick-open, known-action, and rejected-action states. Focused browser workflows
pass the primary file tree, image upload and insertion, transcluded-file
creation, folder rename, deferred deletion, and undo paths.

Full native CI passes all 1,247 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The rebuilt browser application is 688,715 B raw and
192,714 B gzip, an increase of 1,926 B raw and 505 B gzip from the project
evidence checkpoint. Direct and unique production package counts remain
unchanged at 18 and 150.

## Continued Lit Extraction: Manuscript Map

The Writing guide's manuscript map now uses one bounded `ManuscriptMapPanel`
instead of seven element references plus imperative metric, heading-outline,
structural-cue, editing-pass, and editing-cue rendering. The component owns
derived presentation and local editing-purpose state while emitting typed
source-range selection intents. `WorkspaceApp` retains composed-source
derivation and file-qualified editor focus.

This checkpoint reduces `src/client/app.ts` from 10,549 to 10,468 lines (-81).
The component adds 157 lines and reaches 89.65% statement coverage and 92.3%
line coverage across empty and populated maps, all editing purposes, valid
selection, and rejected-range states. A focused browser workflow passes
summary, outline, editing-purpose changes, source-range selection, and editor
focus.

Full native CI passes all 1,249 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The rebuilt browser application is 690,331 B raw and
193,100 B gzip, an increase of 1,616 B raw and 386 B gzip from the project-tree
checkpoint. Direct and unique production package counts remain unchanged at 18
and 150.

## Continued Lit Extraction: Library Discovery Results

Manual Library discovery now uses one bounded `LibraryDiscoveryResults`
component instead of imperative provider, metadata, verification-link, and
save-button card rendering. The component owns result presentation and local
save progress while emitting a typed save intent. `WorkspaceApp` retains
provider requests, response validation, CSL import, Library refreshes, and
status policy.

This checkpoint reduces `src/client/app.ts` from 10,468 to 10,439 lines (-29).
The component adds 105 lines and reaches 91.66% statement coverage and 93.1%
line coverage across empty, provider-combined, saving, saved, retry, known
selection, and rejected-selection states. A focused browser workflow passes
federated result presentation, verification, saving, and saved-state feedback
through the manual Library surface.

Full native CI passes all 1,251 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The rebuilt browser application is 691,354 B raw and
193,265 B gzip, an increase of 1,023 B raw and 165 B gzip from the
manuscript-map checkpoint. Direct and unique production package counts remain
unchanged at 18 and 150.

## Continued Lit Extraction: Citation Network

The citation network now uses one bounded `CitationNetworkPanel` instead of two
element references plus imperative SVG graph, source-card, edge, assertion,
provenance, review, expansion, candidate, and save-progress rendering. The
component owns derived presentation and local candidate progress while
emitting typed expansion, review, and candidate-save intents. `WorkspaceApp`
retains network requests, prompts, mutations, response validation, refreshes,
and toast policy.

This checkpoint reduces `src/client/app.ts` from 10,439 to 10,207 lines (-232).
The component adds 315 lines and reaches 94.52% statement coverage and 96.82%
line coverage across loading, empty, filtered, connected, truncated, reviewed,
expanded, saturated, saving, known-intent, and rejected-intent states. The
focused browser workflow passes assertion recording, graph and accessible-list
rendering, project filtering, review, expansion, candidate verification,
saving, and provenance feedback.

Full native CI passes all 1,253 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The rebuilt browser application is 693,504 B raw and
193,712 B gzip, an increase of 2,150 B raw and 447 B gzip from the Library
discovery checkpoint. Direct and unique production package counts remain
unchanged at 18 and 150.

## Continued Lit Extraction: Preview Presentation

Preview file-mode status, validation summary, unavailable state, and diagnostic
cards now use bounded `PreviewContextStatus` and `PreviewDiagnosticsPanel`
components instead of three element references and imperative composition and
Markdown diagnostic rendering. The diagnostic component owns source-map
resolution and emits typed file-qualified range intents. `WorkspaceApp`
retains Markdown loading and rendering, composition, file selection, and editor
focus.

This checkpoint reduces `src/client/app.ts` from 10,207 to 10,173 lines (-34).
The two components add 154 lines, while a shared five-line source-map helper
replaces the coordinator-local implementation. They reach 81.08% statement
coverage and 84.37% line coverage across default and updated status,
unavailable, project, mapped-renderer, fallback-renderer, selectable, and
rejected-selection states. Focused browser workflows pass composed and isolated
file status, renderer diagnostics, composition diagnostics, source navigation,
and unavailable recovery behavior.

Full native CI passes all 1,256 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The rebuilt browser application is 694,763 B raw and
194,053 B gzip, an increase of 1,259 B raw and 341 B gzip from the citation
network checkpoint. Direct and unique production package counts remain
unchanged at 18 and 150.

## Continued Lit Extraction: Publication Intake

Inline DOI intake now uses one bounded `PublicationIntakePanel` instead of
eleven element references plus imperative form, metadata-review,
linked-reference, visibility, busy, status, and focus updates. The component
owns local DOI and citation-key values and emits typed preview, accept, cancel,
and reference-opening intents. `WorkspaceApp` retains the XState workflow,
validated API requests, acceptance mutation, resource refresh, navigation, and
toast policy.

This checkpoint reduces `src/client/app.ts` from 10,173 to 10,129 lines (-44).
The component adds 208 lines. The focused browser workflow passes DOI lookup,
reviewed metadata, cancellation, repeated lookup, acceptance, linked-reference
presentation, and stable publication navigation. The full native CI gate passes
1,258 unit/coverage tests, 120 Worker integration tests, and 74 browser tests.
The component records 82.92% statement and 87.87% line coverage; the browser
workflow additionally exercises its focus handoffs.

The browser application artifact grows from 694,763 B raw / 194,053 B gzip to
698,319 B raw / 194,629 B gzip (+3,556 B raw / +576 B gzip). Direct and unique
production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: LaTeX Import

The LaTeX archive workflow now uses a bounded `LatexImportPanel` instead of ten
element references, two coordinator fields, and imperative root-option,
converted-file, diagnostic, visibility, readiness, busy, status, and local
input updates. The component owns the reviewed preview identity and emits typed
preview, confirmation, and cancel intents. `WorkspaceApp` retains validated
preview and project-creation requests plus successful navigation.

This checkpoint reduces `src/client/app.ts` from 10,129 to 10,000 lines (-129).
The component adds 293 lines. Component tests cover initial, ambiguous-root,
converted, blocking-diagnostic, failure, preview, confirmation, cancellation,
root-change invalidation, and oversized-archive states. The component records
82.1% statement and 85.88% line coverage.

Full native CI passes all 1,261 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 698,319 B raw
/ 194,629 B gzip to 701,258 B raw / 194,976 B gzip (+2,939 B raw / +347 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Export Statistics

The export dialog's publication statistics now use a bounded
`ExportStatisticsPanel` instead of coordinator-owned total, explanatory,
group, row, and empty-state DOM assembly. `WorkspaceApp` retains composition
and the canonical `PublicationWordStatistics` projection; the component owns
only its read-only presentation.

This checkpoint reduces `src/client/app.ts` from 10,000 to 9,952 lines (-48).
The component adds 81 lines. Component tests cover loading, populated, and
empty-group states. The focused browser export workflow passes live totals and
the existing export-dialog handoff. The component records 83.33% statement and
87.5% line coverage.

Full native CI passes all 1,262 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 701,258 B raw
/ 194,976 B gzip to 701,516 B raw / 195,023 B gzip (+258 B raw / +47 B gzip).
Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Knowledge Connections

The authoring Map's accessible connection list now uses a bounded
`KnowledgeConnectionsPanel` instead of two element references and imperative
edge-card, relationship-label, resource-link, count, and empty-state rendering.
The component emits typed resource-selection intents. `WorkspaceApp` retains
knowledge-graph derivation and all cross-resource navigation policy.

This checkpoint reduces `src/client/app.ts` from 9,952 to 9,918 lines (-34).
The component adds 88 lines. Component tests cover empty, linked, labelled,
unresolved-edge, valid-selection, and rejected-selection states. The focused
browser workflow passes annotation, claim, candidate, and typed-connection
presentation. The component records 86.95% statement and 90% line coverage.

Full native CI passes all 1,264 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 701,516 B raw
/ 195,023 B gzip to 702,559 B raw / 195,079 B gzip (+1,043 B raw / +56 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Assistant Task Setup

Writing-assistant task setup now uses a bounded `AssistantTaskPanel` instead of
eighteen element references and imperative operation, target-scope, rhetorical
purpose, claim-relation, structured-table, instruction-default, copy,
visibility, target-preview, and readiness updates. The component owns local
task values and emits typed operation, target, input, and generation intents.
`WorkspaceApp` retains editor-target resolution, evidence selection, model
requests, XState workflow state, result handling, and status policy.

This checkpoint reduces `src/client/app.ts` from 9,918 to 9,834 lines (-84).
The component adds 263 lines. Component tests cover every operation-specific
presentation, local values, readiness, typed changes, and generation gating.
The focused browser workflow passes revision, clarity drill, ideation,
rhetorical phrasing, structured table, reference discovery, target scope, and
generation behavior. The component records 94.33% statement and 96.07% line
coverage.

Full native CI passes all 1,266 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 702,559 B raw
/ 195,079 B gzip to 706,518 B raw / 196,007 B gzip (+3,959 B raw / +928 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: PDF Highlight Import

Private PDF highlight detection and review now use a bounded
`PdfHighlightImportPanel` instead of five element references, imperative
candidate-card rendering, DOM-based selection and note collection, and scan
and import busy updates. The component owns local review values and emits typed
detect, import, and cancel intents. `WorkspaceApp` retains PDF inspection,
duplicate filtering, active-artifact identity, mutation, refresh, and toast
policy.

This checkpoint reduces `src/client/app.ts` from 9,834 to 9,764 lines (-70).
The component adds 209 lines. Component tests cover default, scanning, empty,
mixed native and flattened, truncated, error, importing, completion, selection,
note editing, and typed action states. The focused browser workflow passes
flattened-highlight detection, note review, atomic import, refresh, and the
surrounding private-annotation workflow. The component records 93.1% statement
and 95.91% line coverage.

Full native CI passes all 1,268 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 706,518 B raw
/ 196,007 B gzip to 708,543 B raw / 196,840 B gzip (+2,025 B raw / +833 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Project File Dialog

File and folder creation and rename setup now use a bounded
`ProjectFileDialog` instead of seven element references and imperative title,
help, path, placeholder, action-label, focus, and cancellation handling. The
component emits a typed, trimmed save intent. `WorkspaceApp` retains resource
availability, remembered include-caret capture, API mutation, selection,
refresh, and toast policy.

This checkpoint reduces `src/client/app.ts` from 9,764 to 9,721 lines (-43).
The component adds 141 lines. Component tests cover all five operation modes,
file and folder classification, light-DOM ownership, and trimmed typed save
intents. The focused browser workflow passes file and folder creation, rename,
transclusion insertion, selection, and Preview refresh behavior. The component
records 78% statement and 80% line coverage.

Full native CI passes all 1,272 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 708,543 B raw
/ 196,840 B gzip to 709,962 B raw / 197,216 B gzip (+1,419 B raw / +376 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Project Template Save Dialog

Personal-template promotion now uses a bounded `ProjectTemplateSaveDialog`
instead of seven element references and imperative replacement-option, name,
description, status, focus, and cancellation handling. The component owns local
form values and emits typed create or replacement save intents. `WorkspaceApp`
retains catalog refresh, hidden-template policy, seed capture, API mutation, and
toast policy.

This checkpoint reduces `src/client/app.ts` from 9,721 to 9,688 lines (-33).
The component adds 183 lines. Component tests cover loading, ready, error,
create, replacement, input, modal reuse, focus, cancellation, and typed save
states. The focused browser workflow passes built-in selection, personal
template promotion, project creation, and saved-template reuse. The component
records 89.09% statement and 91.3% line coverage.

Full native CI passes all 1,276 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 709,962 B raw
/ 197,216 B gzip to 712,675 B raw / 197,718 B gzip (+2,713 B raw / +502 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Library Discovery Search

Scholarly discovery setup now uses a bounded `LibraryDiscoverySearch` instead
of six element references and imperative form-value, submit-state, progress,
count, empty, and error handling. The component owns query collection and emits
a typed `ReferenceDiscoveryQuery`. `WorkspaceApp` retains provider requests,
response validation, result presentation, import mutation, and Library refresh
policy.

This checkpoint reduces `src/client/app.ts` from 9,688 to 9,665 lines (-23).
The component adds 129 lines. Component tests cover initial, searching,
singular, plural, empty, error, typed-query, and duplicate-submit states. The
focused browser workflow passes provider search, result verification, save
mutation, and saved-state presentation. The component records 85.29% statement
and 86.66% line coverage.

Full native CI passes all 1,280 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 712,675 B raw
/ 197,718 B gzip to 714,699 B raw / 198,282 B gzip (+2,024 B raw / +564 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Workspace Settings

Project settings now use a bounded `WorkspaceSettingsPanel` instead of fifteen
element references and imperative entry-file option, publication-profile,
archive-label, template-visibility, modal, and nested GitHub-review
coordination. The component emits typed save, template, duplicate, archive, and
delete intents. `WorkspaceApp` retains authorization, persistence, navigation,
GitHub requests, destructive confirmation, catalog refresh, and toast policy.

This checkpoint reduces `src/client/app.ts` from 9,665 to 9,635 lines (-30).
The component adds 283 lines. Component tests cover active, archived, demo-safe,
save, template, duplicate, archive, delete, modal reuse, GitHub event
forwarding, value collection, and missing-control states. Focused browser
workflows pass modal lifecycle, entry-file changes, GitHub initialization, and
personal-template promotion. The component records 83.67% statement and 83.33%
line coverage.

Full native CI passes all 1,284 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 714,699 B raw
/ 198,282 B gzip to 721,355 B raw / 199,494 B gzip (+6,656 B raw / +1,212 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Reference Library Filters

Reference Library filtering now uses a bounded
`ReferenceLibraryFilterPanel` instead of eight element references, seven
control listeners, coordinator-local value validation, dynamic type-option
rendering, and result-count updates. The component owns query and facet state,
validated defaults, reset behavior, and a typed change event. `WorkspaceApp`
retains canonical filtering, linked-reference projection, result-card
rendering, and reference navigation.

This checkpoint reduces `src/client/app.ts` from 9,635 to 9,567 lines (-68).
The component adds 202 lines. Component tests cover dynamic types, counts,
ordinary and query-preserving resets, all seven filter values, typed change
events, and invalid-value fallbacks. Focused browser workflows pass interactive
tag, linkage, and query filtering; exact-PDF duplicate reveal; and legacy
BibTeX Library search. The component records 91.89% statement and 94.28% line
coverage.

Full native CI passes all 1,286 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 721,355 B raw
/ 199,494 B gzip to 724,344 B raw / 200,038 B gzip (+2,989 B raw / +544 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Model Provider Settings

Local-model preferences now use a bounded `ModelProviderSettings` component
instead of six element references, duplicate preference listeners and status
synchronization, coordinator-local stored-value validation, and imperative
model-option rendering. The component owns connection, endpoint, model, and
reasoning values, discovery progress, and typed change and discovery intents.
`WorkspaceApp` retains browser-local persistence, provider discovery, request
construction, generation workflows, and assistant status policy.

This checkpoint reduces `src/client/app.ts` from 9,567 to 9,485 lines (-82).
The component adds 218 lines. Component tests cover saved values, dynamic and
deduplicated model choices, connection defaults, endpoint and reasoning
changes, status-bearing change events, discovery intent, busy state, and
light-DOM ownership. Focused browser workflows pass companion selection and
persistence, live model discovery and selection, and evidence-grounded
generation with the established `none` reasoning default. The component
records 85.48% statement and 89.28% line coverage.

Full native CI passes all 1,288 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 724,344 B raw
/ 200,038 B gzip to 727,427 B raw / 200,522 B gzip (+3,083 B raw / +484 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Claim Dialog

Claim creation and editing now use a bounded `ClaimDialog` instead of eight
element references, one coordinator field, imperative evidence-option
rendering, DOM-based selection collection, and modal configuration. The
component owns proposition and note values, evidence relation and annotation
selection, modal lifecycle, and a typed save intent. `WorkspaceApp` retains
evidence prerequisites, API mutation, refreshes, and toast policy.

This checkpoint reduces `src/client/app.ts` from 9,485 to 9,435 lines (-50).
The component adds 196 lines. Component tests cover create and edit
presentation, annotation comment and quote fallbacks, proposition and note
changes, relation validation, evidence selection and removal, light-DOM
ownership, and typed create-save intent. The focused browser workflow passes
claim creation, editing, evidence replacement, model grounding, and reviewed
prose generation. The component records 79.16% statement and 79.54% line
coverage.

Full native CI passes all 1,290 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 727,427 B raw
/ 200,522 B gzip to 730,164 B raw / 200,927 B gzip (+2,737 B raw / +405 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Library PDF Upload Status

PDF batch presentation now uses a bounded `LibraryPdfUploadStatus` instead of
imperative progress, outcome-row, error, duplicate-action, and retry rendering.
The component owns queue progress, per-file state, duplicate reveal actions,
retry availability, busy and error presentation, and typed retry and reveal
intents. `WorkspaceApp` retains file and drop input, queue execution, upload
transport, failed-file ownership, Library refreshes, and toast policy.

This checkpoint reduces `src/client/app.ts` from 9,435 to 9,387 lines (-48).
The component adds 122 lines. Component tests cover initial, queued, uploading,
added, duplicate, failed, retry, busy, error, and typed reveal states. Focused
browser workflows pass bounded partial-success intake, failed-file retry,
exact-PDF duplicate reconciliation, archived-source restoration, and Library
focus. The component records 91.48% statement and 92.1% line coverage.

Full native CI passes all 1,292 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 730,164 B raw
/ 200,927 B gzip to 731,333 B raw / 201,164 B gzip (+1,169 B raw / +237 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Web Source Panels

Website intake and readable-text snapshot comparison now use bounded
`WebSourceCapture` and `WebSnapshotComparisonPanel` components instead of three
element references, coordinator-owned submit and reset state, and imperative
comparison heading and diff-hunk rendering. The components own the local URL
value, typed capture intent, reset behavior, and comparison presentation.
`WorkspaceApp` retains capture and comparison requests, Valibot response
validation, Library refreshes, and toast policy.

This checkpoint reduces `src/client/app.ts` from 9,387 to 9,367 lines (-20).
The components add 129 lines. Component tests cover light-DOM ownership, empty,
identical, changed, and truncated comparison presentation, URL changes, typed
capture intent, and reset behavior. The full browser shell suite remains green.
The components record 96.42% statement and 100% line coverage.

Full native CI passes all 1,295 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 731,333 B raw
/ 201,164 B gzip to 732,833 B raw / 201,394 B gzip (+1,500 B raw / +230 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Project Annotation Form

Project-PDF annotation editing now uses a bounded `ProjectAnnotationForm`
instead of eight element references, imperative PDF-option and captured-field
updates, coordinator-owned selection status rendering, and submitter
detection. The component owns visible-PDF choices, captured page and quotation
context, optional note input, status copy, and typed save and link intents.
`WorkspaceApp` retains highlight geometry and persistence, annotation identity,
manuscript selection and linking, refreshes, and toast policy.

This checkpoint reduces `src/client/app.ts` from 9,367 to 9,336 lines (-31).
The component adds 193 lines. Component tests cover empty and populated PDF
choices, current-PDF selection and fallback, captured and saved annotation
values, local field changes, status presentation, and typed save and link
intents. Focused browser workflows pass automatic highlight save, extension,
undo, erasure, deletion, and evidence movement into reviewed model prose. The
component records 100% statement and line coverage.

Full native CI passes all 1,298 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 732,833 B raw
/ 201,394 B gzip to 735,432 B raw / 201,905 B gzip (+2,599 B raw / +511 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Consolidation: Manuscript Comments

The existing `ManuscriptCommentList` now owns the selected-passage comment
composer as well as comment history. This removes three composer element
references, coordinator-owned submit binding, body collection, reset, and saved
status updates without introducing another custom element. The panel owns body
and status state plus typed create, open, re-anchor, and resolve intents.
`WorkspaceApp` retains manuscript selection and revision checks, mutations,
refreshes, navigation, and toast policy.

This checkpoint reduces `src/client/app.ts` from 9,336 to 9,335 lines (-1) and
adds 39 lines to the existing component. Component tests now cover comment body
capture, typed creation, saved reset and status alongside empty, open, stale,
resolved, navigation, re-anchor, and resolve states. The focused two-writer
browser workflow passes comment creation, re-anchoring, navigation, and
resolution. The consolidated panel records 90.62% statement and 92.59% line
coverage.

Full native CI passes all 1,299 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 735,432 B raw
/ 201,905 B gzip to 736,299 B raw / 202,063 B gzip (+867 B raw / +158 B gzip).
Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Consolidation: Citation Assertions

The existing `CitationNetworkPanel` now owns manual assertion intake alongside
the citation graph and review workflow. This removes four assertion-form element
references, coordinator-owned submit binding, imperative source-option
rendering, value collection, and polarity normalization without introducing
another custom element. The panel owns reference choices and a typed manual
record intent. `WorkspaceApp` retains validation, provenance-bearing mutation,
network requests and refreshes, prompts, and toast policy.

This checkpoint reduces `src/client/app.ts` from 9,335 to 9,311 lines (-24) and
adds 77 lines to the existing component. Component tests now cover reference
replacement and selection fallback, source and polarity changes, and the typed
manual assertion alongside loading, network, review, expansion, and candidate
states. The focused browser workflow passes manual assertion recording and
review in the accessible shared network. The consolidated panel records 95.69%
statement and 97.43% line coverage.

Full native CI passes all 1,300 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 736,299 B raw
/ 202,063 B gzip to 737,836 B raw / 202,326 B gzip (+1,537 B raw / +263 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Consolidation: New Project Composer

The existing `ProjectStartingPointBrowser` now owns the complete new-project
form: title, starting-point choices and preview, loading and error status,
creation readiness, and cancel and import actions. This removes seven element
references and their coordinator-owned form and button bindings. The component
emits typed create, cancel, GitHub import, LaTeX import, project-preview, and
template-delete intents. `WorkspaceApp` retains dialog focus management,
template and project requests, deletion, project and import workflows,
navigation, and toast policy.

This checkpoint reduces `src/client/app.ts` from 9,311 to 9,290 lines (-21) and
adds 89 lines to the existing component. Component tests cover empty, template,
and project choices, title and creation intents, cancel and import actions,
loading and error presentation, template deletion, and project-source
acceptance and rejection. The focused browser workflow passes built-in,
promoted personal, and existing-project starting points together with dialog
focus and import behavior. The consolidated component records 81.73% statement
and 83.65% line coverage.

Full native CI passes all 1,303 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 737,836 B raw
/ 202,326 B gzip to 739,424 B raw / 202,590 B gzip (+1,588 B raw / +264 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Library PDF Annotation Forms

A bounded `LibraryPdfAnnotationForms` now owns private-highlight, page-note, and
selected-markup composer values and visibility. This replaces seventeen raw
element references, three submit bindings, cancel and markup-action bindings,
imperative form visibility, and DOM-based value collection with one typed action
stream. `WorkspaceApp` retains the PDF annotation state machine, captured
selection and drawing geometry, active resource identity, mutations, refreshes,
inspector policy, and toasts.

This checkpoint reduces `src/client/app.ts` from 9,290 to 9,235 lines (-55).
The component adds 295 lines. Component tests cover light-DOM ownership,
highlight, note, and markup visibility, current field values, typed save and
drawing-style intents, and every cancellation and selected-markup action.
Focused browser workflows pass standalone private-PDF annotation and export,
linked-PDF sharing, highlight extension and note editing, selected markup, and
drawing-style updates. The component records 82.6% statement and 85.93% line
coverage.

Full native CI passes all 1,306 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 739,424 B raw
/ 202,590 B gzip to 742,734 B raw / 203,460 B gzip (+3,310 B raw / +870 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Consolidation: GitHub Import Submission

The existing `GitHubImportPanel` now owns its form boundary and preview
submission in addition to picker values, readiness, preview status, and cancel
and confirmation actions. This removes the last coordinator-owned
`HTMLFormElement`, its submit binding, and event cancellation in favor of a
typed preview intent. Connection, installation, repository, branch, preview,
and project-creation requests remain in `WorkspaceApp`.

This checkpoint reduces `src/client/app.ts` from 9,235 to 9,233 lines (-2) and
adds 15 lines to the existing component. New component tests cover light-DOM
form ownership, connected and disconnected picker lifecycles, selected account,
repository, and branch projection, preview and creation states, long preview
rendering, and typed preview, cancel, and confirmation intents. The focused
GitHub connection-gating and import workflow passes. The component records
81.73% statement and 87.61% line coverage, up from no direct unit coverage.

Full native CI passes all 1,309 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact changes from 742,734 B
raw / 203,460 B gzip to 742,994 B raw / 203,420 B gzip (+260 B raw / -40 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Library PDF Annotation Toolbar

A bounded `LibraryPdfAnnotationToolbar` now owns active-tool presentation,
drawing color and width, undo and export availability, annotation count, and
inspector-expanded state. This replaces twelve raw element references, tool,
input, undo, export, and inspector bindings, and imperative toolbar updates with
one typed action stream. `WorkspaceApp` retains PDF gestures, the annotation
state machine, drawing persistence, annotated export, inspector policy, and
toasts.

This checkpoint reduces `src/client/app.ts` from 9,233 to 9,202 lines (-31).
The component adds 192 lines. Component tests cover light-DOM ownership, drawing
style updates, empty and populated availability, inspector and active-tool
state, all four tool intents, undo, export, and inspector actions. Focused
browser workflows pass standalone and linked private-PDF annotation, tool
switching, drawing, undo, highlight editing, inspector focus, and annotated
export. The component records 75.67% statement and 80% line coverage.

Full native CI passes all 1,312 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 742,994 B raw
/ 203,420 B gzip to 749,873 B raw / 205,513 B gzip (+6,879 B raw / +2,093 B
gzip). This includes Lit's static icon-rendering directive and the toolbar
template. Direct and unique production package counts remain unchanged at 18
and 150.

## Continued Lit Extraction: Unidentified PDF Queue

A bounded `UnidentifiedPdfList` now owns the compatibility queue for PDF
artifacts that are not yet linked to a reference. This replaces two raw element
references, imperative section, count, empty-state, card, and reference-option
rendering, and per-card event binding with one typed identification intent.
`WorkspaceApp` retains identification mutations, library refreshes, and toasts.

This checkpoint reduces `src/client/app.ts` from 9,202 to 9,181 lines (-21).
The component adds 117 lines. Component tests cover empty and populated
projection, selected-reference identification, and stale-selection pruning.
The focused linked-reference PDF browser workflow passes. The component records
82.75% statement and 84% line coverage.

Full native CI passes all 1,315 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 749,873 B raw
/ 205,513 B gzip to 751,362 B raw / 205,781 B gzip (+1,489 B raw / +268 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Library Reference Summaries

A bounded `LibraryReferenceSummary` now owns each reference result's title,
compact metadata, PDF action, and project-link presentation. This replaces two
imperative render helpers and their per-card PDF, link, and unlink handlers with
one delegated typed action stream. `WorkspaceApp` retains result-card assembly,
PDF presentation, project-link mutations, metadata editing and refinement,
Library refreshes, and toasts.

This checkpoint reduces `src/client/app.ts` from 9,181 to 9,146 lines (-35).
The component adds 126 lines. Component tests cover light-DOM ownership,
standalone, provisional, PDF, unlinked-workspace, and linked-workspace
projection, plus all three typed action variants. Focused browser workflows
pass linked-reference PDF sharing and provider metadata refinement. The
component records 72.72% statement and 75% line coverage.

Full native CI passes all 1,317 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 751,362 B raw
/ 205,781 B gzip to 752,814 B raw / 205,980 B gzip (+1,452 B raw / +199 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Library Reference Personal Fields

A bounded `LibraryReferencePersonalFields` now owns tags, collections,
archive-state presentation, reading state, and private-note composition. This
replaces six imperative form and select helpers, per-card handlers, and
coordinator DOM value collection with one delegated typed action stream.
`WorkspaceApp` retains persistence, archive confirmation, Library refreshes,
and toasts.

This checkpoint reduces `src/client/app.ts` from 9,146 to 9,067 lines (-79).
The component adds 232 lines. Component tests cover empty and populated
light-DOM state, organization input ownership, and all five action variants.
The focused linked-reference browser workflow passes tags, filtering, private
notes, project sharing, and accessible field contracts. The component records
68.18% statement and 69.76% line coverage.

Full native CI passes all 1,319 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 752,814 B raw
/ 205,980 B gzip to 755,538 B raw / 206,407 B gzip (+2,724 B raw / +427 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Library Metadata Editor

A bounded `LibraryReferenceMetadataEditor` now owns manual bibliographic
values, refinement progress, inline PDF suggestions, grouped provider matches,
work and field selections, and application payload projection. This removes
the coordinator's metadata-field and suggestion maps, refinement panel target,
eight imperative render helpers, and DOM-based selection collection.
`WorkspaceApp` retains PDF extraction, provider requests, the XState refinement
workflow, persistence, Library refreshes, and toasts.

This checkpoint reduces `src/client/app.ts` from 9,067 to 8,777 lines (-290).
The component adds 437 lines. Component tests cover hidden, progress, review,
manual save, refinement, PDF application, and provider application states.
Focused browser workflows pass local PDF metadata review, mixed-provider field
selection, cached preview presentation, and DOI import review. The component
records 74.37% statement and 78.67% line coverage.

Full native CI passes all 1,321 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 755,538 B raw
/ 206,407 B gzip to 759,750 B raw / 206,892 B gzip (+4,212 B raw / +485 B
gzip). The coordinator waits for reference-card component updates before
restoring Library scroll state. Direct and unique production package counts
remain unchanged at 18 and 150.

## Continued Lit Extraction: Library Reference PDF Rows

A bounded `LibraryReferencePdfRows` now owns attached-PDF presentation,
signed-in member access context, rights choices, and primary-versus-secondary
refinement actions. This replaces two imperative render helpers and their
per-artifact open, rights, and refinement handlers with one delegated typed
action stream. `WorkspaceApp` retains PDF presentation, rights persistence,
extraction, refinement workflow, Library refreshes, and toasts.

This checkpoint reduces `src/client/app.ts` from 8,777 to 8,742 lines (-35).
The component adds 93 lines. Component tests cover empty, linked,
multi-artifact, open, validated-rights, and secondary-refinement states.
Focused browser workflows pass linked-PDF access, opening, Library scroll
restoration, and provider refinement. The component records 78.57% statement
and 80% line coverage.

Full native CI passes all 1,323 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. The browser application artifact grows from 759,750 B raw
/ 206,892 B gzip to 761,155 B raw / 207,102 B gzip (+1,405 B raw / +210 B
gzip). Direct and unique production package counts remain unchanged at 18 and 150.

## Continued Lit Extraction: Library Reference Research Rows

A bounded `LibraryReferenceResearchRows` now composes attached PDFs with
private notes, highlights, and immutable web captures. It owns research share
state, capture diagnostics and downloads, prior-version comparison controls,
project-pin availability, and recapture presentation. This replaces six
imperative render helpers and their per-row handlers with one delegated typed
action stream. `WorkspaceApp` retains persistence, web requests, project-pin
mutations, Library refreshes, and toasts.

This checkpoint reduces `src/client/app.ts` from 8,742 to 8,635 lines (-107).
The component adds 183 lines. Component tests cover empty, populated, linked,
shared, complete, incomplete, valid-timestamp, invalid-timestamp, PDF-composed,
and all five action variants. The component records 77.41% statement and
78.57% line coverage. The focused linked-reference browser workflow passes PDF
access, note sharing, accessible fields, filtering, and deterministic Library
scroll restoration.

The browser application artifact grows from 761,155 B raw / 207,102 B gzip to
763,230 B raw / 207,491 B gzip (+2,075 B raw / +389 B gzip). Direct and unique
production package counts remain unchanged at 18 and 150. Full native CI
passes all 1,325 unit/coverage tests, 120 Workers-runtime tests, and 74 browser
tests.

## Continued Lit Extraction: Editor Insert Menu

A bounded `EditorInsertMenu` now owns the static scholarly-syntax choices,
relative include-file option rendering, include empty state, native titles,
and local menu closing. This replaces two imperative include-list helpers,
DOM-target inspection, and coordinator menu-state mutations with typed syntax
and include-file intents. `WorkspaceApp` retains collaborative passage and
caret resolution, Yjs edits, and notifications.

This checkpoint reduces `src/client/app.ts` from 8,635 to 8,596 lines (-39).
The component adds 100 lines. Component tests cover fallback, empty,
single-file, nested relative-file, syntax, and include intent states. It records
73.07% statement and 81.81% line coverage. The focused compact-editor browser
workflow passes layout, include-label geometry, scholarly-syntax insertion,
relative project-file insertion, and menu closing.

The browser application artifact grows from 763,230 B raw / 207,491 B gzip to
764,185 B raw / 207,627 B gzip (+955 B raw / +136 B gzip). Direct and unique
production package counts remain unchanged at 18 and 150. Full native CI
passes all 1,327 unit/coverage tests, 120 Workers-runtime tests, and 74 browser
tests.

## Coordinator Extraction: Workspace Layout Manager

A bounded `WorkspaceLayoutManager` now owns project-rail collapse and width,
authoring/context pane width, pointer capture and cancellation, keyboard
resizing and reset, responsive bounds, ARIA values, context-specific local
storage, and PDF resize notification. This removes eleven layout and persistence
helpers from `WorkspaceApp`; the coordinator retains URL-backed layout choice,
active context identity, and PDF-only resource opening.

This checkpoint reduces `src/client/app.ts` from 8,596 to 8,397 lines (-199).
The manager adds 235 lines. Unit tests cover stored collapse state, focus
transfer, responsive rail bounds, pointer persistence and cancellation,
keyboard resizing and reset, context-specific pane widths, and PDF resize
notifications. It records 92.3% statement, 100% function, and 97.52% line
coverage. Focused browser workflows pass rail collapse/restoration, pointer and
keyboard resizing, responsive clamping, context switching, pane persistence,
and native reset behavior.

The browser application artifact grows from 764,185 B raw / 207,627 B gzip to
764,696 B raw / 207,939 B gzip (+511 B raw / +312 B gzip). Direct and unique
production package counts remain unchanged at 18 and 150. Full native CI
passes all 1,330 unit/coverage tests, 120 Workers-runtime tests, and 74 browser
tests.

## Continued Lit Extraction: Library PDF Annotation List

A bounded `LibraryPdfAnnotationList` now owns the private reader's saved text
highlight and PDF-markup cards, empty state, comments, page and markup labels,
project citation and research-share availability, and action labels. It emits
one typed stream for navigation, editing, citation, sharing, revocation, and
deletion. `WorkspaceApp` retains PDF navigation, annotation mutations, project
citation and research-share workflows, refreshes, and notifications.

This checkpoint reduces `src/client/app.ts` from 8,397 to 8,347 lines (-50).
The component adds 153 lines. Component tests cover empty, workspace and
private modes, linked and unlinked references, shared and unshared highlights,
comments, notes, drawings, missing-artifact behavior, and all eight action
variants. It records 66.66% statement and line coverage. Focused browser
workflows pass private PDF import, annotation and export plus linked-reference
member access and research sharing.

The browser application artifact grows from 764,696 B raw / 207,939 B gzip to
766,768 B raw / 208,428 B gzip (+2,072 B raw / +489 B gzip). Direct and unique
production package counts remain unchanged at 18 and 150. Full native CI
passes all 1,332 unit/coverage tests, 120 Workers-runtime tests, and 74 browser
tests.

## Continued Lit Extraction: Library Reference List

A bounded `LibraryReferenceList` now owns filtered result and empty-state
rendering, reference-card and details composition, persistent expansion state,
nested component configuration and update settlement, and addressed-card focus.
Nested summary, metadata, personal-field, PDF, and research-row actions continue
to bubble to `WorkspaceApp`, which retains canonical filtering, mutations,
requests, refreshes, and notification policy.

This checkpoint reduces `src/client/app.ts` from 8,347 to 8,229 lines (-118).
The component adds 158 lines. Its isolated test covers loading, empty-Library,
filtered-empty, and populated workspace presentation; it records 23.88%
statement and 25.92% line coverage because DOM composition, update settlement,
and focus require the real browser boundary. Focused browser workflows pass
addressed-card focus, nested linked-PDF sharing, archived duplicate reveal, and
metadata refinement.

The browser application artifact grows from 766,768 B raw / 208,428 B gzip to
767,765 B raw / 208,571 B gzip (+997 B raw / +143 B gzip). Direct and unique
production package counts remain unchanged at 18 and 150. Full native CI
passes all 1,333 unit/coverage tests, 120 Workers-runtime tests, and 74 browser
tests.

## Continued Lit Extraction: Source Completion

A bounded `SourceCompletion` now owns citation and include option markup,
optional action labels, pointer focus preservation, hover and keyboard
selection, active-descendant state, selected-option scrolling, dismissal, and
typed acceptance intents. `WorkspaceApp` retains completion-context detection,
candidate ranking, private-Library linking, Yjs edits, caret restoration, and
menu positioning.

This checkpoint reduces `src/client/app.ts` from 8,229 to 8,132 lines (-97).
The component adds 119 lines. Component tests cover empty and action-labelled
presentation, show and hide ARIA state, keyboard movement, acceptance,
dismissal, composition gating, and both action variants. It records 77.55%
statement and 80.43% line coverage. The focused browser workflow passes
relative include suggestions, listbox presentation, option selection, and
collaborative insertion.

The browser application artifact grows from 767,765 B raw / 208,571 B gzip to
768,037 B raw / 208,636 B gzip (+272 B raw / +65 B gzip). Direct and unique
production package counts remain unchanged at 18 and 150. Full native CI
passes all 1,336 unit/coverage tests, 120 Workers-runtime tests, and 74 browser
tests.

## Continued Lit Extraction: Library PDF Markup Layer

A bounded `LibraryPdfMarkupLayer` now owns saved and draft drawing SVG, note
pins, selected state, open note cards, live draft geometry updates, note
movement, focus restoration, and a typed note-card close intent.
`WorkspaceApp` retains pointer capture, gesture and annotation-machine state,
shape recognition, normalized geometry, persistence, and workflow transitions.

This checkpoint reduces `src/client/app.ts` from 8,132 to 8,055 lines (-77).
The component adds 159 lines. Component tests cover empty, saved and draft
drawings, note drafts, selected notes, open cards, multiple tools, and the typed
close intent. It records 57.14% statement and 62.06% line coverage. The focused
private-PDF browser workflow passes drawing, note placement and movement,
note-card focus, deletion, highlight import, and annotated export.

The browser application artifact grows from 768,037 B raw / 208,636 B gzip to
768,775 B raw / 208,825 B gzip (+738 B raw / +189 B gzip). Direct and unique
production package counts remain unchanged at 18 and 150. Full native CI
passes all 1,338 unit/coverage tests, 120 Workers-runtime tests, and 74 browser
tests.

## Continued Lit Extraction: Library PDF Project Use

A bounded `LibraryPdfProjectUse` now owns unidentified, unlinked, and linked
private-PDF presentation, member-versus-public capability copy, citation
preview, and a typed reference-link intent. `WorkspaceApp` retains canonical
reference and project-link lookup, the linking mutation, refreshes, and
notification policy.

This checkpoint reduces `src/client/app.ts` from 8,055 to 8,004 lines (-51) and
removes four single-use DOM helpers. The component adds 82 lines. Component
tests cover fallback, unidentified, unlinked, linked, citation-alias, and typed
link-intent states. It records 81.81% statement and 84.21% line coverage. The
focused linked-reference browser workflow passes the unlinked-to-linked
transition, member access, public-link exclusion, and explicit research
sharing.

The browser application artifact grows from 768,775 B raw / 208,825 B gzip to
769,285 B raw / 208,855 B gzip (+510 B raw / +30 B gzip). Styles grow by 63 B
raw / 15 B gzip. Direct and unique production package counts remain unchanged
at 18 and 150. Full native CI passes all 1,340 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Collaborator Selection List

A bounded `CollaboratorSelectionList` now owns current-revision and current-file
filtering, remote caret and range presentation, accessible source excerpts, and
missing-file fallbacks. It also supplies the filtered remote ranges used by the
editor overlay so list and highlight eligibility cannot drift. `WorkspaceApp`
retains local-author selection, collaboration transport, revision authority,
and editor-highlight placement.

This checkpoint reduces `src/client/app.ts` from 8,004 to 7,994 lines (-10).
The component adds 69 lines. Component tests cover fallback and empty states,
stale revisions, ranges and excerpts, carets, missing files, and overlay-range
projection. It records 85.18% statement and 91.3% line coverage. Focused browser
workflows pass two-writer source convergence and focused-caret preservation
during remote insertion.

The browser application artifact grows from 769,285 B raw / 208,855 B gzip to
769,814 B raw / 208,949 B gzip (+529 B raw / +94 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,362 B raw / 23,360 B
gzip and 18 and 150. Full native CI passes all 1,341 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Application Toast

A bounded `AppToast` now owns transient and persistent message rendering,
replacement-timer cancellation, one-shot action availability, modal
reparenting, popover visibility, and typed action and dismissal intents.
`WorkspaceApp` retains action effects, deferred-deletion authority, offline
update persistence, and notification policy.

This checkpoint reduces `src/client/app.ts` from 7,994 to 7,967 lines (-27).
The component adds 100 lines. Component tests cover fallback and action
presentation, one-shot action intent, transient dismissal, and replacement
timer cancellation. It records 71.15% statement and 73.17% line coverage.
Focused browser workflows pass persistent update recovery in both Workspace and
Library plus timed image-deletion Undo.

The browser application artifact grows from 769,814 B raw / 208,949 B gzip to
770,529 B raw / 209,185 B gzip (+715 B raw / +236 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,362 B raw / 23,360 B
gzip and 18 and 150. Full native CI passes all 1,343 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Workspace Switcher

A bounded `WorkspaceSwitcher` now owns authorized project option rendering,
archived-current handling, selected state, focus entry, and a typed navigation
intent. `WorkspaceApp` retains catalog fetching and canonical route navigation.
This removes its final feature-level imperative `replaceChildren()` renderer;
the remaining manual DOM supports sanitized Markdown, high-frequency editor
highlighting, and browser download and clipboard fallbacks.

This checkpoint reduces `src/client/app.ts` from 7,967 to 7,961 lines (-6).
The component adds 67 lines. Component tests cover fallback, active, available,
and archived project presentation plus empty, current, and different-project
selection intents. It records 81.81% statement and 84.21% line coverage.
Focused browser workflows pass isolated-workspace navigation and access plus
narrow-phone switcher visibility.

The browser application artifact grows from 770,529 B raw / 209,185 B gzip to
771,477 B raw / 209,360 B gzip (+948 B raw / +175 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,362 B raw / 23,360 B
gzip and 18 and 150. Full native CI passes all 1,345 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Coordinator Extraction: Source Editor Adapter

A bounded `source-editor-adapter` now owns native textarea-to-Yjs
synchronization and history, syntax and collaborator-presence mirroring, scroll
alignment, completion geometry, Yjs-relative selection capture, and optional
Vim binding. `WorkspaceApp` retains document identity, collaboration workflow,
completion candidates, authoring targets, and navigation authority.

This checkpoint reduces `src/client/app.ts` from 7,961 to 7,698 lines (-263).
The adapter adds 261 lines. Four direct tests cover local and remote Yjs edits,
undo and redo, highlighting and scroll synchronization, teardown, collapsed and
ranged relative anchors, stored Vim mode and guarded edits, and completion
geometry. It records 94.47% statement and 99.37% line coverage. Focused browser
workflows pass Markdown highlighting, opt-in Vim editing, remote-caret
preservation, and include-completion positioning.

The browser application artifact shrinks from 771,477 B raw / 209,360 B gzip to
771,417 B raw / 209,280 B gzip (-60 B raw / -80 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,362 B raw / 23,360 B
gzip and 18 and 150. Full native CI passes all 1,349 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Research Diary Summary

A bounded `ResearchDiarySummary` now owns missing and existing diary
presentation, derived entry, open-question, and next-action counts, singular and
plural copy, and a typed open intent. `WorkspaceApp` retains file lookup,
creation, selection, and editor focus.

This checkpoint reduces `src/client/app.ts` from 7,698 to 7,687 lines (-11) and
removes three internal element references. The component adds 60 lines.
Component tests cover missing, singular, and plural presentation plus the typed
open intent; it records 80% statement and 85.71% line coverage. The focused
writing-workflow browser scenario passes diary creation, derived summary copy,
and the Start-to-Open transition alongside question and reviewer ledgers.

The browser application artifact grows from 771,417 B raw / 209,280 B gzip to
772,143 B raw / 209,350 B gzip (+726 B raw / +70 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,362 B raw / 23,360 B
gzip and 18 and 150. Full native CI passes all 1,351 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Assistant Workflow Status

A bounded `AssistantWorkflowStatus` now owns operation-specific phrasing
attribution and initial status copy, subsequent live status presentation, and
typed evidence and connection intents. `WorkspaceApp` retains evidence
navigation, settings authority, provider discovery and generation, and the
policy that selects subsequent status messages.

This checkpoint reduces `src/client/app.ts` from 7,687 to 7,678 lines (-9),
replaces four internal element references with one component reference, and
consolidates two native action bindings. The component adds 90 lines. Component
tests cover default, phrasing, claim, and general operation status plus typed
actions and the settings click-propagation boundary; it records 77.77%
statement and 82.35% line coverage. Five focused browser workflows pass provider
selection and discovery, stale-generation rejection, clarity drilling, and
evidence-backed revision.

The browser application artifact grows from 772,143 B raw / 209,350 B gzip to
774,297 B raw / 209,781 B gzip (+2,154 B raw / +431 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,362 B raw /
23,360 B gzip and 18 and 150. Full native CI passes all 1,353 unit/coverage
tests, 120 Workers-runtime tests, and 74 browser tests.

## Continued Lit Consolidation: Claim Creation

The existing `ClaimListPanel` now owns the **New claim** action and derives its
availability from the same annotation data used to render evidence links. Its
typed action stream includes the create intent; `WorkspaceApp` retains dialog
and mutation authority.

This checkpoint reduces `src/client/app.ts` from 7,678 to 7,675 lines (-3) and
removes one element reference, native binding, and separate availability
mutation. The focused claim browser workflow passes creation and atomic
replacement. The extended component remains at 93.61% statement and 94.28%
line coverage.

The browser application artifact grows from 774,297 B raw / 209,781 B gzip to
774,514 B raw / 209,824 B gzip (+217 B raw / +43 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,362 B raw / 23,360 B
gzip and 18 and 150. Full native CI passes all 1,353 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Workspace Rail Tabs

A bounded `WorkspaceRailTabs` now owns the four project-rail tab controls,
active-mode and ARIA selection presentation, the open-comment count, and a
typed navigation intent. `WorkspaceApp` retains panel visibility, guide
rendering, and route synchronization; the existing layout manager retains
collapse and resize authority.

This checkpoint reduces `src/client/app.ts` from 7,675 to 7,661 lines (-14),
replaces five internal element references and four native action bindings, and
removes four selection mutations plus DOM-derived active-mode lookup. Component
tests cover active mode, comment count, unchanged selection, and typed
navigation. Focused browser workflows pass rail switching and persistence plus
claim creation through the Research rail. The component records 85% statement
and 88.88% line coverage.

The browser application artifact grows from 774,514 B raw / 209,824 B gzip to
775,339 B raw / 210,098 B gzip (+825 B raw / +274 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,362 B raw /
23,360 B gzip and 18 and 150. Full native CI passes all 1,355 unit/coverage
tests, 120 Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Authoring Mode Tabs

A bounded `AuthoringModeTabs` now owns Write and Map active-state and ARIA
presentation plus a typed mode-change intent. `WorkspaceApp` retains editor and
map visibility, focus policy, and route synchronization.

This checkpoint reduces `src/client/app.ts` from 7,661 to 7,660 lines (-1),
replaces two internal element references and two native action bindings, and
removes two ARIA mutations plus DOM-derived active-mode lookup. Component tests
cover active state, unchanged selection, and typed navigation. The focused
workspace-view browser workflow passes Write/Map switching and route
persistence. The component records 81.25% statement and 85.71% line coverage.

The browser application artifact grows from 775,339 B raw / 210,098 B gzip to
776,157 B raw / 210,192 B gzip (+818 B raw / +94 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,362 B raw / 23,360 B
gzip and 18 and 150. Full native CI passes all 1,357 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Consolidation: Claims Collection

The existing `ClaimListPanel` now owns the complete Claims collection shell and
derives its count from the same claim data used for cards and actions.
`WorkspaceApp` retains evidence-selection state, dialogs, mutations, and
navigation authority.

This checkpoint reduces `src/client/app.ts` from 7,657 to 7,654 lines (-3) and
removes the separate claim-count reference and mutation. Focused browser
workflows pass claim creation and atomic replacement plus the complete
annotation-to-claim-to-reviewed-prose path.

The browser application artifact grows from 776,247 B raw / 210,227 B gzip to
776,365 B raw / 210,216 B gzip (+118 B raw / -11 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,362 B raw / 23,360 B
gzip and 18 and 150. Full native CI passes all 1,357 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Consolidation: Publication Collection

The existing `PublicationListPanel` now owns the complete References collection
shell and derives its count from the same publication data used for cards.
`WorkspaceApp` retains context navigation, Library navigation, and enrichment
authority.

This checkpoint reduces `src/client/app.ts` from 7,660 to 7,657 lines (-3) and
removes the separate publication-count reference and mutation. The focused
publication-context browser workflow passes collection expansion, Library
management, context restoration, and PDF linking.

The browser application artifact grows from 776,157 B raw / 210,192 B gzip to
776,247 B raw / 210,227 B gzip (+90 B raw / +35 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,362 B raw / 23,360 B
gzip and 18 and 150. Full native CI passes all 1,357 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Editor Status

A bounded `EditorStatus` now owns authoring-target text and tooltip plus online
and offline save-state presentation. `WorkspaceApp` retains target resolution,
collaboration and offline-save policy, and the status values those workflows
select.

This checkpoint reduces `src/client/app.ts` from 7,654 to 7,649 lines (-5) and
replaces two internal element references with one component reference.
Component coverage is 78.57% statements and 84.61% lines. Focused browser
workflows pass selection-target persistence and offline edit restoration and
synchronization.

The browser application artifact grows from 776,365 B raw / 210,216 B gzip to
776,869 B raw / 210,318 B gzip (+504 B raw / +102 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,362 B raw / 23,360 B
gzip and 18 and 150. Full native CI passes all 1,358 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Project History Trigger

A bounded `ProjectHistoryTrigger` now owns the current revision badge and emits
a typed open intent. `WorkspaceApp` retains revision authority, history loading,
and dialog policy.

This checkpoint reduces `src/client/app.ts` from 7,649 to 7,648 lines (-1),
replaces two internal element references with one component reference, and
removes one native action binding and revision-text mutation. Component coverage
is 76.92% statements and 83.33% lines. Focused browser workflows pass compact
toolbar layout and the complete compare, milestone, restore, and branch flow.

The browser application artifact grows from 776,869 B raw / 210,318 B gzip to
777,474 B raw / 210,454 B gzip (+605 B raw / +136 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,362 B raw / 23,360 B
gzip and 18 and 150. Full native CI passes all 1,359 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Connection Status

A bounded `ConnectionStatus` now owns the synchronized connection label and dot
tone for workspace collaboration and private-Library presentation.
`WorkspaceApp` retains collaboration-state interpretation and the policy that
selects each label and connected value.

This checkpoint reduces `src/client/app.ts` from 7,648 to 7,646 lines (-2) and
replaces two internal element references with one component reference. Component
coverage is 78.57% statements and 84.61% lines. Focused browser workflows pass
private-Library presentation and offline edit restoration and synchronization.

The browser application artifact grows from 777,474 B raw / 210,454 B gzip to
777,986 B raw / 210,515 B gzip (+512 B raw / +61 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,362 B raw / 23,360 B
gzip and 18 and 150. Full native CI passes all 1,360 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Application Version Control

A bounded `ApplicationVersionControl` now owns build-version presentation,
Clipboard API copying, and the installed-PWA textarea fallback. `WorkspaceApp`
supplies the active version and retains toast policy through one typed notice.

This checkpoint reduces `src/client/app.ts` from 7,639 to 7,617 lines (-22),
replaces two internal element references with one component reference, and
removes the coordinator-level clipboard helper. Component coverage is 90.62%
statements and 93.1% lines across the Clipboard API, textarea fallback, and
unavailable-clipboard paths. Focused browser workflows pass version copying and
activated-update version behavior.

The browser application artifact grows from 779,487 B raw / 210,918 B gzip to
780,275 B raw / 211,073 B gzip (+788 B raw / +155 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,362 B raw / 23,360 B
gzip and 18 and 150. Full native CI passes all 1,362 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Workspace Navigation Controls

A bounded `PreviewSyncControls` now owns the two directional actions and their
Preview-context visibility while emitting one typed synchronization stream. A
bounded `WorkspaceSurfaceSwitcher` owns responsive Authoring/Context actions and
ARIA presentation. `WorkspaceApp` retains source-map resolution, caret and
scroll policy, pane visibility, and route synchronization.

This checkpoint reduces `src/client/app.ts` from 7,617 to 7,616 lines (-1),
replaces five internal element references with two component references, and
removes four native action bindings, two ARIA mutations, and one visibility
mutation. Preview-sync coverage is 76.92% statements and 81.81% lines; surface
switcher coverage is 81.25% statements and 85.71% lines. Focused browser
workflows pass compact desktop and phone navigation plus both synchronization
directions and centered-passage behavior.

The browser application artifact grows from 780,275 B raw / 211,073 B gzip to
782,100 B raw / 211,345 B gzip (+1,825 B raw / +272 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,362 B raw / 23,360
B gzip and 18 and 150. Full native CI passes all 1,364 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Vim Mode Control

A bounded `VimModeControl` now owns browser-local enablement, toggle and mode
presentation, modal keyboard behavior, pointer-selection transitions, and
editor-listener teardown. `WorkspaceApp` supplies only the source textarea and
its visual shell; `source-editor-adapter` returns to Yjs synchronization,
history, highlighting, selection, and completion geometry.

This checkpoint reduces `src/client/app.ts` from 7,646 to 7,639 lines (-7),
replaces two internal element references with one component reference, and
removes 66 Vim-specific lines from `source-editor-adapter`. The component records
89.7% statement and 96.49% line coverage. Focused browser workflows pass stored
appearance preferences and opt-in modal editing.

The browser application artifact grows from 777,986 B raw / 210,515 B gzip to
779,487 B raw / 210,918 B gzip (+1,501 B raw / +403 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,362 B raw / 23,360
B gzip and 18 and 150. Full native CI passes all 1,360 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Project Map Workspace

A composed `ProjectMapWorkspace` now owns the Evidence map shell, resource and
link totals, search-versus-overview presentation, graph fan-out to the map and
connection panels, mode visibility, focus entry, and one typed resource-selection
stream. `WorkspaceApp` retains authorized search, response validation, graph
acquisition, resource navigation, editor visibility, and URL policy.

This checkpoint reduces `src/client/app.ts` from 7,616 to 7,589 lines (-27),
replaces six internal element references with one component reference, and
consolidates four child event subscriptions into two domain events. Focused
browser coverage passes graph layout and emphasis, responsive relayout, search,
connection navigation, and return-to-source behavior. Component coverage is
90.69% statements and 91.89% lines.

The browser application artifact grows from 782,100 B raw / 211,345 B gzip to
784,626 B raw / 211,697 B gzip (+2,526 B raw / +352 B gzip). Explicit block-level
container behavior grows styles from 135,362 B raw / 23,360 B gzip to 135,376 B
raw / 23,364 B gzip (+14 B raw / +4 B gzip). Direct and unique production
package counts remain unchanged at 18 and 150. Full native CI passes all 1,367
unit/coverage tests, 120 Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Project Export Dialog

A bounded `ProjectExportDialog` now progressively enhances the server-rendered
export content, owns modal open and close lifecycle, and synchronizes its nested
publication statistics panel. `WorkspaceApp` retains the two spatially separate
open triggers and the canonical word-count projection.

This checkpoint reduces `src/client/app.ts` from 7,589 to 7,584 lines (-5),
replaces separate dialog, close-action, and statistics-panel references with one
component reference, and removes the coordinator's close binding. The focused
browser workflow passes composed word-count presentation and modal opening.
Component coverage is 75% statements and 71.42% lines; the remaining uncovered
lines are native custom-element connection and disconnection hooks exercised by
the browser workflow.

The browser application artifact grows from 784,626 B raw / 211,697 B gzip to
785,079 B raw / 211,723 B gzip (+453 B raw / +26 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,376 B raw / 23,364 B
gzip and 18 and 150. Full native CI passes all 1,369 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Project History Dialog

A composed `ProjectHistoryDialog` now owns revision-modal lifecycle, busy state,
panel-close handling, and delegation of loading, timeline, error, inspection,
and comparison presentation to the existing history panel. `WorkspaceApp`
retains the revision XState workflow, authorized requests, mutations,
navigation, and failure policy.

This checkpoint reduces `src/client/app.ts` from 7,584 to 7,582 lines (-2),
replaces separate dialog and panel references with one component reference, and
consolidates panel-close and native-dialog-close coordination. The focused
browser workflow passes timeline loading, inspection, comparison, milestone,
restore, branch, busy, and close behavior. Component coverage is 70.37%
statements and 69.23% lines; browser coverage owns the custom-element lifecycle
and typed revision/detail delegation not available in the DOM-less unit harness.

The browser application artifact grows from 785,079 B raw / 211,723 B gzip to
785,998 B raw / 211,930 B gzip (+919 B raw / +207 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,376 B raw / 23,364 B
gzip and 18 and 150. Full native CI passes all 1,372 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Citation Network Workspace

A composed `CitationNetworkWorkspace` now owns Reference trail visibility,
current-project filter state and ARIA presentation, close behavior, reference
synchronization, and candidate-save delegation to the existing network panel.
`WorkspaceApp` retains authorized requests, validation, review prompts,
mutations, refreshes, and notification policy.

This checkpoint reduces `src/client/app.ts` from 7,582 to 7,570 lines (-12),
replaces four shell and panel references plus one coordinator filter field with
one component reference, and removes native filter and close bindings. The
focused browser workflow passes opening, manual assertions, review, project
filtering, graph presentation, Crossref expansion, candidate saving, and close
behavior. Component coverage is 85.18% statements and 88% lines.

The browser application artifact grows from 785,998 B raw / 211,930 B gzip to
787,700 B raw / 212,289 B gzip (+1,702 B raw / +359 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,376 B raw / 23,364
B gzip and 18 and 150. Full native CI passes all 1,374 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Preview Navigation Control

A bounded `PreviewNavigationControl` now owns browser-local top-navigation
visibility, stored restoration, toggle and restore labels, ARIA and title
presentation, Preview-context availability, and focus handoff. `WorkspaceApp`
supplies only whether Preview is the active workspace context.

This checkpoint reduces `src/client/app.ts` from 7,570 to 7,529 lines (-41),
replaces three internal element references with one component reference, and
removes two native bindings plus the coordinator's persistence and presentation
helpers. The focused browser workflow passes workspace and Library visibility,
stored state, accessible copy, and focus restoration across compact layouts.
Component coverage is 83.33% statements and 80.48% lines.

The browser application artifact grows from 787,700 B raw / 212,289 B gzip to
788,448 B raw / 212,575 B gzip (+748 B raw / +286 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,376 B raw / 23,364 B
gzip and 18 and 150. Full native CI passes all 1,376 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Extraction: Context Tab Strip

A composed `ContextTabStrip` now owns fixed research-tab presentation, typed
primary actions, roving keyboard focus, programmatic focus handoff, and
delegation to the existing dynamic resource-tab component. `WorkspaceApp`
retains canonical active-context state, authorized Library loading, resource
closure, route synchronization, and panel presentation.

This checkpoint reduces `src/client/app.ts` from 7,529 to 7,480 lines (-49),
replaces the tablist, three fixed-tab, and dynamic-tab component references with
one component reference, and removes three native primary bindings plus the
coordinator's fixed ARIA renderer and keyboard handler. Focused browser coverage
passes fixed-tab selection and keyboard navigation plus resource-keyed tab
opening, activation, closure, and focus restoration. Component coverage is
100% statements and lines.

The browser application artifact grows from 788,448 B raw / 212,575 B gzip to
789,012 B raw / 212,660 B gzip (+564 B raw / +85 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,376 B raw / 23,364 B
gzip and 18 and 150. Full native CI passes all 1,381 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Coordinator Reduction: PDF Context Opening

The three workspace, private-Library, and project-reference PDF entry paths now
share one context preparation sequence for scroll capture, tab activation,
location restoration, rendering, responsive surface selection, and focus.
Route-history policy and asynchronous PDF loading remain explicit in each
caller because their standalone-Library and workspace behavior differs.

This checkpoint removes the duplicated orchestration flagged by the code-health
audit and reduces `src/client/app.ts` from 7,480 to 7,478 lines (-2). The focused
browser workflows pass resource-keyed PDF opening, standalone Library routes,
project-reference opening, annotation focus, and back/forward restoration.

The browser application artifact shrinks from 789,012 B raw / 212,660 B gzip to
788,731 B raw / 212,648 B gzip (-281 B raw / -12 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,376 B raw / 23,364 B
gzip and 18 and 150. Full native CI passes all 1,381 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Composition: Context Tab Overview

The existing `ContextTabStrip` now composes both the scrollable fixed and
resource tabs and the non-scrolling overflow overview from one active-context
projection. It delegates the two dynamic presentations to their existing Lit
children and centralizes their typed event boundary. `WorkspaceApp` retains
active-context state, title resolution, authorized Library loading, resource
closure, route synchronization, and panel presentation.

This checkpoint reduces `src/client/app.ts` from 7,478 to 7,466 lines (-12),
removes the separate overview component reference and coordinator renderer, and
keeps the semantic tablist separate from the overflow menu. Focused browser
coverage passes fixed-tab keyboard selection, resource opening and closure,
overflow activation, focus restoration, and standalone Library presentation.
Component coverage remains 100% statements and lines.

The browser application artifact changes from 788,731 B raw / 212,648 B gzip to
788,927 B raw / 212,646 B gzip (+196 B raw / -2 B gzip). Explicit display-only
host styling grows from 135,376 B raw / 23,364 B gzip to 135,411 B raw / 23,373
B gzip (+35 B raw / +9 B gzip). Direct and unique production package counts
remain unchanged at 18 and 150. Full native CI passes all 1,381 unit/coverage
tests, 120 Workers-runtime tests, and 74 browser tests.

## Continued Coordinator Reduction: Workspace Layout Controls

`WorkspaceLayoutManager` now resolves its four bounded rail and pane controls
beneath the workspace root. `WorkspaceApp` supplies only that root, the
context-specific pane key, and the PDF resize hook; it no longer exposes
manager-internal controls through its global element registry.

This checkpoint reduces `src/client/app.ts` from 7,466 to 7,449 lines (-17),
removes four coordinator-only element references, and adds explicit failure for
an incomplete layout shell. Focused unit and browser coverage passes rail
collapse, pointer and keyboard resizing, persistence, responsive restoration,
pane resizing, focus transfer, and missing-control detection.

The browser application artifact changes from 788,927 B raw / 212,646 B gzip to
788,880 B raw / 212,687 B gzip (-47 B raw / +41 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,411 B raw / 23,373 B
gzip and 18 and 150. Full native CI passes all 1,383 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Ownership: Workspace Rail Panels

The existing `WorkspaceRailTabs` now derives the four panels it controls from
the tab contract and updates panel visibility together with selected-tab
presentation. `WorkspaceApp` retains route synchronization, responsive rail
layout, and the Writing guide's derived rendering, but no longer registers or
mutates the four panel elements independently.

This checkpoint reduces `src/client/app.ts` from 7,449 to 7,433 lines (-16) and
removes four coordinator-only element references. Focused unit coverage verifies
the complete panel-visibility projection, and focused browser coverage passes
real Files, Research, and Writing guide switches.

The browser application artifact shrinks from 788,880 B raw / 212,687 B gzip to
788,646 B raw / 212,670 B gzip (-234 B raw / -17 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,411 B raw / 23,373 B
gzip and 18 and 150. Full native CI passes all 1,383 unit/coverage tests, 120
Workers-runtime tests, and 74 browser tests.

## Continued Lit Ownership: New Project Dialog Lifecycle

The existing `ProjectStartingPointBrowser` now owns its native parent dialog's
open, close, focus-containment, listener-teardown, and return-focus lifecycle
alongside its existing starting-point presentation. `WorkspaceApp` retains
authorized template and project-preview requests, deferred deletion, creation,
import workflows, navigation, and error policy.

This checkpoint reduces `src/client/app.ts` from 7,433 to 7,408 lines (-25),
removes the separate dialog reference, and deletes the coordinator's native
keydown and close bindings. Focused browser coverage passes forward focus wrap,
Escape restoration, loading, cancellation, reopening, template selection,
project preview, and creation.

The browser application artifact changes from 788,646 B raw / 212,670 B gzip
to 789,386 B raw / 213,011 B gzip (+740 B raw / +341 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150. Full native CI passes all 1,385 unit/coverage
tests, 120 Workers-runtime tests, and 74 browser tests.

## Continued Lit Composition: GitHub Import

`GitHubImportPanel` now composes account connection presentation with the
repository picker, preview, confirmation, and native dialog lifecycle. The
standalone connection component and its application-level reference are gone;
`WorkspaceApp` retains authenticated requests, response validation, preview
identity, and project creation.

This checkpoint reduces `src/client/app.ts` from 7,376 to 7,372 lines (-4),
deletes the 74-line connection component, removes two coordinator references,
and consolidates four typed import intents on one Lit boundary. Focused unit
coverage passes connection, picker, preview, confirmation, disconnect, and
dialog lifecycle behavior, while focused browser coverage passes the guarded
GitHub connection/import flow.

The browser application artifact changes from 789,338 B raw / 213,050 B gzip
to 789,139 B raw / 213,062 B gzip (-199 B raw / +12 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150. Full native CI passes all 1,386 unit/coverage
tests, 120 Workers-runtime tests, and 74 browser tests.

## Continued Lit Ownership: LaTeX Import Dialog

The existing `LatexImportPanel` now owns reset, native modal opening and
closing, and initial title focus alongside its archive, preview, diagnostic,
and confirmation state. `WorkspaceApp` retains authenticated conversion and
creation requests, response validation, and navigation.

This checkpoint reduces `src/client/app.ts` from 7,372 to 7,368 lines (-4) and
removes the separate dialog reference plus split reset/open/focus coordination.
Focused unit and browser coverage passes modal opening, initial focus,
cancellation, and reopening through the New project workflow.

The browser application artifact changes from 789,139 B raw / 213,062 B gzip
to 789,241 B raw / 212,982 B gzip (+102 B raw / -80 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,387 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Coordinator Reduction: PDF Viewer Shell

`PdfEvidenceViewer` now resolves its bounded canvas, page, link, text,
highlight, status, and dual page-control elements from the document shell.
`WorkspaceApp` supplies only typed selection, highlight, page-change, and
private-highlight hooks; the two shared status/text-layer references remain in
the coordinator only because separate workflows still use them.

This checkpoint reduces `src/client/app.ts` from 7,408 to 7,376 lines (-32),
removes nine viewer-only element references, and replaces the large constructor
object with one document-scoped factory. Focused browser coverage passes the
standalone private-PDF import, page rendering, selection, annotation, and export
workflow.

The browser application artifact changes from 789,386 B raw / 213,011 B gzip
to 789,338 B raw / 213,050 B gzip (-48 B raw / +39 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150. Full native CI passes all 1,385 unit/coverage
tests, 120 Workers-runtime tests, and 74 browser tests.

## Continued Lit Ownership: Catalog and Sharing Dialogs

The existing `WorkspaceCatalogPanel` and `WorkspaceSharingPanel` now own their
native parent dialogs' opening and closing. The catalog panel also owns its
open-time filter reset and focus. `WorkspaceApp` retains catalog fetching,
navigation, membership and capability-link requests, authorization outcomes,
and toast policy.

This checkpoint reduces `src/client/app.ts` from 7,368 to 7,360 lines (-8),
removes two separate dialog references, and deletes both synthetic close-event
bridges. Focused unit coverage passes each native dialog lifecycle, while the
existing browser coverage passes project catalog and sharing opening, closing,
and reopening.

The browser application artifact changes from 789,241 B raw / 212,982 B gzip
to 789,120 B raw / 212,922 B gzip (-121 B raw / -60 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,389 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Contract: Project-File Save Mode

`ProjectFileDialog` now emits its owned operation mode together with the
submitted path. `WorkspaceApp` no longer mirrors that mode in a coordinator
field and consumes one stable typed intent for create, create-and-include,
rename, folder-create, and folder-rename operations.

This checkpoint reduces `src/client/app.ts` from 7,360 to 7,357 lines (-3) and
removes duplicated mutable mode state. Focused unit coverage verifies that the
dialog emits its configured mode with the trimmed path.

The browser application artifact changes from 789,120 B raw / 212,922 B gzip
to 789,109 B raw / 212,926 B gzip (-11 B raw / +4 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,389 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Model Preferences Entry

`ModelProviderSettings` now opens its enclosing preferences menu and focuses
the connection selector when Writing assistant requests connection settings.
`WorkspaceApp` no longer addresses the outer preferences shell separately.

This checkpoint reduces `src/client/app.ts` from 7,357 to 7,352 lines (-5),
removes the preferences-menu reference, and consolidates split open/focus
coordination. Focused unit and browser coverage verifies menu opening and
connection focus through Writing assistant.

The browser application artifact changes from 789,109 B raw / 212,926 B gzip
to 789,183 B raw / 212,957 B gzip (+74 B raw / +31 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,390 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Composition: Project-File Actions

Two `ProjectFileActions` instances now own the project rail and editor-menu
commands, entry-file delete availability, and one typed action protocol.
`WorkspaceApp` retains active-file identity, resource checks, dialogs, upload
selection, persistence, deferred deletion, selection, refresh, and toast policy.

This checkpoint reduces `src/client/app.ts` from 7,352 to 7,343 lines (-9),
replaces seven raw button references and direct bindings with two component
references, and removes coordinator-owned delete-button presentation. Focused
unit and browser coverage passes both variants, every typed intent, the
entry-file guard, and the complete create/include/folder/rename/delete workflow.

The browser application artifact changes from 789,183 B raw / 212,957 B gzip
to 790,598 B raw / 213,321 B gzip (+1,415 B raw / +364 B gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,392 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Research Context Panels

`ContextTabStrip` now derives all controlled research-panel visibility from the
same canonical active-tab input it uses for fixed, resource, and overview tab
presentation. It also owns active resource labelling, PDF-mode data attributes,
and PDF-control visibility. `WorkspaceApp` retains canonical context state,
authorized content loading, content rendering, routing, and scroll restoration.

This checkpoint reduces `src/client/app.ts` from 7,343 to 7,308 lines (-35),
removes seven raw panel/control references, and deletes the separate visibility
and resource-labelling coordination. Focused unit and browser coverage passes
fixed, publication, candidate, workspace-PDF, and private-library-PDF context
transitions.

The browser application artifact changes from 790,598 B raw / 213,321 B gzip
to 790,644 B raw / 213,368 B gzip (+46 B raw / +47 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,393 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Fixed Context Scroll

`ContextTabStrip` now resolves the Preview, Library, and Writing-assistant
scroll containers controlled by its permanent tabs and owns their scroll
capture and restoration. `WorkspaceApp` retains canonical tab state and the
resource-specific publication, candidate, and PDF scroll contracts.

This checkpoint reduces `src/client/app.ts` from 7,308 to 7,279 lines (-29),
removes two scroll-element references, and deletes the coordinator's fixed-tab
scroll selector and restorer table. Focused unit and browser coverage passes
Preview and Library scroll retention plus resource-key rejection.

The browser application artifact changes from 790,644 B raw / 213,368 B gzip
to 790,503 B raw / 213,336 B gzip (-141 B raw / -32 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,394 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Composition: Project Annotation Tools

`ProjectAnnotationForm` now owns the complete project-PDF annotation composer,
including publication-intake composition, composer visibility, citation
availability and copy, paint/eraser presentation, undo availability, capture
status, and annotation fields. `WorkspaceApp` retains canonical PDF selection,
highlight geometry and persistence, manuscript insertion and linking, refreshes,
and notification policy.

This checkpoint reduces `src/client/app.ts` from 7,279 to 7,271 lines (-8),
removes five raw element references and four direct bindings, and replaces them
with one typed component action protocol. Focused unit and browser coverage
passes tool, undo, and citation intents, resource-context switching, and the
complete paint, extend, undo, erase, and delete lifecycle.

The browser application artifact changes from 790,503 B raw / 213,336 B gzip
to 792,712 B raw / 213,766 B gzip (+2,209 B raw / +430 B gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,395 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Composition: Private-PDF Inspector

`LibraryPdfInspector` now owns the private-PDF inspector shell, active-artifact
identity, visibility, status, expansion, annotation-details opening, nested
annotation component composition, and one typed close intent. `WorkspaceApp`
retains PDF gestures, annotation state, persistence, close-time draft policy,
refreshes, and focus restoration.

This checkpoint reduces `src/client/app.ts` from 7,271 to 7,268 lines (-3),
replaces four raw shell references with one component reference, and removes a
direct close binding plus repeated dataset, status, visibility, and details
mutations. Focused unit and browser coverage passes shell state, close intent,
project-context switching, and the complete project-free private-PDF annotate
and export workflow.

The browser application artifact changes from 792,712 B raw / 213,766 B gzip
to 795,095 B raw / 214,163 B gzip (+2,383 B raw / +397 B gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,397 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Library PDF Intake

`LibraryPdfUploadControl` now owns file selection, drag-and-drop acceptance,
drag and busy presentation, input reset and disabling, and typed file and
busy-drop intents. `WorkspaceApp` retains ordered batch execution, upload
transport, failed-file retry ownership, Library refreshes, duplicate handling,
and notification policy.

This checkpoint reduces `src/client/app.ts` from 7,268 to 7,248 lines (-20),
replaces two raw element references with one component reference, removes four
native file and drag listeners, and deletes duplicated upload-busy state.
Focused unit and browser coverage passes empty and populated selection, busy
presentation, partial batch success, retry, exact duplicate detection, and
archived-reference reveal.

The browser application artifact changes from 795,095 B raw / 214,163 B gzip
to 796,464 B raw / 214,497 B gzip (+1,369 B raw / +334 B gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,399 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Composition: Library Tools

`LibraryToolsMenu` now owns portable-archive file selection and reset, Library
export links, citation-network and archived-reference controls,
archived-state presentation, and typed restore, navigation, and filter intents.
`WorkspaceApp` retains archive transport, citation-network loading, canonical
filter state, Library refreshes, and notification policy.

This checkpoint reduces `src/client/app.ts` from 7,248 to 7,245 lines (-3),
replaces three raw controls with one component reference, removes three native
bindings, and deletes archive-file DOM reads and scattered archived-button
mutations. Focused unit and browser coverage passes filter toggling, archived
duplicate reveal, portable metadata restore, and citation-network review.

The browser application artifact changes from 796,464 B raw / 214,497 B gzip
to 797,955 B raw / 214,842 B gzip (+1,491 B raw / +345 B gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,401 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Authoring Mode Surfaces

`AuthoringModeTabs` now owns the editor shell, write-only toolbar, and composed
map workspace visibility alongside Write/Map selection and ARIA presentation.
`WorkspaceApp` retains canonical route state and editor focus policy.

This checkpoint reduces `src/client/app.ts` from 7,231 to 7,226 lines (-5),
removes the write-action element reference and three coordinator-owned
visibility mutations. Focused unit and browser coverage passes both controlled
surface states, map layout refresh and focus entry, resource rendering, and the
return-to-Write workflow.

The browser application artifact changes from 797,884 B raw / 214,806 B gzip
to 797,956 B raw / 214,835 B gzip (+72 B raw / +29 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,402 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project Export Entry

`ProjectExportDialog` now owns both spatially separate export triggers and the
live word-count badge in addition to modal lifecycle, close handling, and its
nested statistics panel. `WorkspaceApp` supplies only the canonical
`PublicationWordStatistics` projection.

This checkpoint reduces `src/client/app.ts` from 7,245 to 7,231 lines (-14),
removes two raw trigger references, two direct bindings, the coordinator's
open helper, and word-count badge mutation. Focused unit and browser coverage
passes external trigger delegation, modal lifecycle, composed word-count
presentation, statistics rendering, and export-link availability.

The browser application artifact changes from 797,955 B raw / 214,842 B gzip
to 797,884 B raw / 214,806 B gzip (-71 B raw / -36 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,401 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Source Citation Action

`SourceCitationControl` now derives citation context from the active source
caret once, owns the contextual action's availability, and emits one typed
resolved-citation intent. `WorkspaceApp` retains publication lookup,
grouped-citation policy, PDF-locator navigation, and notification policy.

This checkpoint reduces `src/client/app.ts` from 7,226 to 7,216 lines (-10),
replaces one raw button reference and direct click binding, and removes
duplicated citation parsing plus scattered disabled and visibility mutations.
Focused unit and browser coverage passes citation and non-citation caret state,
locator propagation, toolbar fit, and citation navigation.

The browser application artifact changes from 797,956 B raw / 214,835 B gzip
to 798,490 B raw / 214,795 B gzip (+534 B raw / -40 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,404 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued PDF Viewer Encapsulation: Status

`PdfEvidenceViewer` now owns its complete loading, rendering, selection, mode,
and failure status presentation. `WorkspaceApp` retains active-tab stale-load
protection and reports only the active load failure through the viewer API.

This checkpoint reduces `src/client/app.ts` from 7,216 to 7,214 lines (-2),
removes the last raw PDF-status element reference, and leaves the separate text
layer reference only for annotation-tool pointer routing. Focused private and
project PDF browser workflows pass status, rendering, selection, annotation,
and resource-context behavior.

The browser application artifact changes from 798,490 B raw / 214,795 B gzip
to 798,475 B raw / 214,784 B gzip (-15 B raw / -11 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,404 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Completed PDF Viewer Shell Encapsulation

`PdfEvidenceViewer` now also owns text-selection pointer routing for annotation
tool changes. `WorkspaceApp` supplies only the selected tool state through the
viewer API and no longer retains any raw viewer-internal element references.

This checkpoint reduces `src/client/app.ts` from 7,214 to 7,212 lines (-2) and
removes the final raw text-layer reference. Focused browser coverage passes the
paint, extend, undo, erase, and delete lifecycle while switching among text,
drawing, erasing, and selection tools.

The browser application artifact changes from 798,475 B raw / 214,784 B gzip
to 798,483 B raw / 214,778 B gzip (+8 B raw / -6 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,411 B raw / 23,373 B
gzip and 18 and 150.

Full native CI passes all 1,404 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Preview Encapsulation: DOM Adapter

`PreviewDocument` now owns direct article and viewport mechanics: rendered and
fallback content assignment, source-span lookup, viewport centering, transient
sync emphasis, project-image lookup, scroll reset, and anchor navigation.
`WorkspaceApp` retains Markdown rendering, source-map translation, project
authorization, citation behavior, source selection, and routing.

This checkpoint reduces `src/client/app.ts` from 7,212 to 7,166 lines (-46),
removes both raw Preview element references and the coordinator's transient
highlight timer, and deletes four DOM-query and geometry helpers. Focused unit
and browser coverage passes content ownership, nearest-span selection,
centering, transient emphasis, clicks, anchor and image lookup, live Markdown
rendering, bidirectional source sync, and authorized project images.

The browser application artifact changes from 798,483 B raw / 214,778 B gzip
to 798,937 B raw / 215,080 B gzip (+454 B raw / +302 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,407 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Action Menus

`ActionMenuController` now owns document-level outside-action dismissal,
settings-menu containment, Escape ordering, summary-focus restoration, and
listener teardown for the server-rendered native `details` menus.
`WorkspaceApp` no longer coordinates global menu presentation.

This checkpoint reduces `src/client/app.ts` from 7,157 to 7,139 lines (-18)
and removes two document listeners plus repeated open-menu queries from the
coordinator. Focused unit and browser coverage passes internal and external
clicks, selected actions, settings persistence, Escape ordering, focus return,
appearance selection, and editor action-popover behavior.

The browser application artifact changes from 798,805 B raw / 215,044 B gzip
to 799,411 B raw / 215,061 B gzip (+606 B raw / +17 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,410 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Completed Lit Candidate Availability Ownership

`CandidateReviewPanel` now owns live Apply availability updates when document
stability or assistant decision state changes, while preserving its current
candidate, failure, and scroll presentation. `WorkspaceApp` retains canonical
candidate applicability and workflow state.

This checkpoint reduces `src/client/app.ts` from 7,166 to 7,157 lines (-9) and
removes the stale document-wide query for legacy candidate Apply buttons that
the Lit panel no longer renders. Focused unit and browser coverage passes live
availability changes, stale-candidate rejection, and reviewed evidence-backed
candidate decisions.

The browser application artifact changes from 798,937 B raw / 215,080 B gzip
to 798,805 B raw / 215,044 B gzip (-132 B raw / -36 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,407 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Passage Resolution

`ClaimListPanel` and `ProjectEvidencePanel` now own live passage-resolution
updates for the links they render. `WorkspaceApp` supplies refreshed typed link
data after Preview composition and no longer scans the document or mutates
button labels, availability, or data attributes outside those components.

This checkpoint reduces `src/client/app.ts` from 7,139 to 7,129 lines (-10)
and removes the coordinator's last selector dependency on passage-action
markup. Focused unit and browser coverage passes refreshed claim and annotation
passage navigation, changed-match presentation, and stale-link availability.

The browser application artifact changes from 799,411 B raw / 215,061 B gzip
to 799,325 B raw / 214,992 B gzip (-86 B raw / -69 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,410 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project Quick Open

`ProjectTreePanel` now owns workspace-only Cmd/Ctrl+P detection, open-dialog
suppression, the document listener lifecycle, and a typed quick-open intent.
`WorkspaceApp` retains rail and layout coordination, then asks the visible
panel to focus its filter. The follow-up also removes obsolete anchor-link DOM
identity attributes after passage resolution became typed panel data.

This checkpoint reduces `src/client/app.ts` from 7,129 to 7,116 lines (-13)
and removes its remaining global keyboard listener. Focused unit and browser
coverage passes project-tree rendering and the collapsed-rail quick-open flow.

The browser application artifact changes from 799,325 B raw / 214,992 B gzip
to 799,504 B raw / 215,054 B gzip (+179 B raw / +62 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,411 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Grounding Choice Focus

`ProjectEvidencePanel` and `ClaimListPanel` now own opening, scrolling, and
focusing their first available model-grounding choice through one shared DOM
primitive. `WorkspaceApp` retains Research-rail selection, panel priority,
workflow status, and empty-evidence notification policy without querying panel
markup.

This checkpoint reduces `src/client/app.ts` from 7,116 to 7,111 lines (-5)
and removes its last document-wide model-evidence query. Focused unit and
browser coverage passes positive and empty focus discovery, collection opening,
focus placement, and the concurrent-edit rejection workflow.

The browser application artifact changes from 799,504 B raw / 215,054 B gzip
to 799,651 B raw / 215,110 B gzip (+147 B raw / +56 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,412 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Markup Geometry

`LibraryPdfMarkupLayer` now owns clamped pointer normalization against its page
bounds and the active-tool and drawing data attributes used by its interaction
styles. `WorkspaceApp` retains pointer capture, annotation state transitions,
shape recognition, persistence, and inspector policy without calculating the
layer's local coordinates or mutating its attributes.

This checkpoint reduces `src/client/app.ts` from 7,111 to 7,101 lines (-10)
and removes its duplicated markup-bound geometry helper. Focused unit and
browser coverage passes centered, clamped, and unavailable geometry, tool and
drawing state, plus the complete PDF annotation interaction lifecycle.

The browser application artifact changes from 799,651 B raw / 215,110 B gzip
to 799,775 B raw / 215,172 B gzip (+124 B raw / +62 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,413 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Drawing Samples

`LibraryPdfMarkupLayer` now owns expansion of coalesced pointer samples into
clamped page points, rejection of near-duplicate additions, and assembly of the
next draft geometry. `WorkspaceApp` retains Safari scroll cancellation,
annotation-machine updates, recognition scheduling, and persistence.

This checkpoint reduces `src/client/app.ts` from 7,087 to 7,078 lines (-9)
and removes its local sample loop and distance filtering. Focused unit and
browser coverage passes coalesced samples, duplicate rejection, a real mouse
stroke, shape recognition, private persistence, rendering, and annotated
export.

The browser application artifact changes from 799,932 B raw / 215,491 B gzip
to 800,029 B raw / 215,499 B gzip (+97 B raw / +8 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,413 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Shape Geometry

`LibraryPdfMarkupLayer` now owns the rendered-bound conversions required to
recognize normalized strokes in pixel space and return snapped or adjusted
shapes to normalized page coordinates. `WorkspaceApp` retains gesture and
recognized-shape state, the recognition delay, workflow transitions,
persistence, and inspector messaging.

This checkpoint reduces `src/client/app.ts` from 7,101 to 7,087 lines (-14),
removes its shape-normalization helper, and removes its direct dependency on
the recognition and manipulation functions. Focused unit and browser coverage
passes recognition, adjustment, unavailable bounds, a real held line gesture,
private persistence, rendering, and annotated export.

The browser application artifact changes from 799,775 B raw / 215,172 B gzip
to 799,932 B raw / 215,491 B gzip (+157 B raw / +319 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,413 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Shape Recognition Timing

`LibraryPdfMarkupLayer` now owns the delayed shape-recognition timer, live
snapped-draft update, cancellation, and disconnect cleanup. It emits a typed
recognition intent after applying its rendered-bound geometry.
`WorkspaceApp` retains stale-pointer protection, recognized-shape gesture
state, annotation-machine transitions, persistence, and inspector messaging.

This checkpoint reduces `src/client/app.ts` from 7,078 to 7,074 lines (-4)
and removes its component-local timer field and scheduling method. Focused unit
coverage passes the delay, recognition event, and cancellation contract; the
real held-pointer private-PDF browser flow passes recognition, persistence,
rendering, and annotated export.

The browser application artifact changes from 800,029 B raw / 215,499 B gzip
to 800,454 B raw / 215,695 B gzip (+425 B raw / +196 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,414 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Shape Manipulation

`LibraryPdfMarkupLayer` now keeps recognized pixel-space shape state private,
handles subsequent pointer movement, updates the live draft, and emits typed
normalized adjustment intents. `WorkspaceApp` no longer imports the recognition
model or stores and routes a component-internal shape; it retains pointer and
workflow validation, annotation-machine transitions, persistence, and inspector
messaging.

This checkpoint reduces `src/client/app.ts` from 7,074 to 7,063 lines (-11).
Focused unit coverage passes recognized and inactive adjustment behavior, while
the real held-pointer private-PDF browser flow passes recognition, adjustment,
persistence, rendering, and annotated export.

The browser application artifact changes from 800,454 B raw / 215,695 B gzip
to 800,734 B raw / 215,735 B gzip (+280 B raw / +40 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,414 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Markup Hit-Testing

`LibraryPdfMarkupLayer` now resolves note-pin and drawing-stroke pointer targets
to typed kind and identifier data. `WorkspaceApp` no longer queries component
selectors or reads markup IDs from the layer's light DOM; it retains tool
validation, annotation-machine transitions, pointer capture, and persistence.
Draft note pins remain consumed without starting a second page placement.

This checkpoint reduces `src/client/app.ts` from 7,063 to 7,061 lines (-2).
Focused unit coverage passes saved-note, draft-note, drawing, and empty target
resolution, while the private-PDF browser workflow passes note placement and
movement, drawing selection, persistence, rendering, and annotated export.

The browser application artifact changes from 800,734 B raw / 215,735 B gzip
to 800,894 B raw / 215,757 B gzip (+160 B raw / +22 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,415 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Tool Guidance

`LibraryPdfAnnotationToolbar` now owns the exact guidance copy associated with
its Select, Text, Note, and Draw tools. `WorkspaceApp` retains tool workflow,
PDF viewer configuration, inspector visibility, and the decision to present
the returned guidance.

This checkpoint reduces `src/client/app.ts` from 7,061 to 7,054 lines (-7).
Focused unit coverage passes all four tool messages, and the private-PDF browser
workflow passes tool switching, note and drawing interaction, persistence, and
annotated export.

The browser application artifact changes from 800,894 B raw / 215,757 B gzip
to 800,885 B raw / 215,763 B gzip (-9 B raw / +6 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,411 B raw / 23,373 B
gzip and 18 and 150.

Full native CI passes all 1,415 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Pointer Interpretation

`LibraryPdfMarkupLayer` now combines its active tool, local hit-testing, and
page-relative geometry into typed pointer-down actions for note targets,
drawing targets, note placement, drawing starts, and touch-only drawing
rejection. `WorkspaceApp` retains pointer capture, annotation-machine
transitions, selection, persistence, inspector messaging, and notifications.

This checkpoint reduces `src/client/app.ts` from 7,054 to 7,051 lines (-3).
Focused unit coverage passes every tool and target branch, and the private-PDF
browser workflow passes tool switching, touch-compatible interaction, note and
drawing behavior, persistence, rendering, and annotated export.

The browser application artifact changes from 800,885 B raw / 215,763 B gzip
to 801,333 B raw / 215,914 B gzip (+448 B raw / +151 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,415 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Pointer Activation

`LibraryPdfMarkupLayer` now performs the local mechanics associated with its
typed pointer actions: drawing-selection default suppression, note and drawing
pointer capture, stale-shape cancellation, and active-drawing presentation.
`WorkspaceApp` retains annotation-machine transitions, selection, rerendering,
persistence, inspector messaging, and notifications. The resulting dispatcher
also absorbs three one-call start helpers.

This checkpoint reduces `src/client/app.ts` from 7,051 to 7,037 lines (-14).
Focused unit coverage passes capture and suppression behavior, and the
private-PDF browser workflow passes selection, note dragging, drawing start and
recognition, persistence, rendering, and annotated export.

The browser application artifact changes from 801,333 B raw / 215,914 B gzip
to 801,290 B raw / 215,903 B gzip (-43 B raw / -11 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,415 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Drawing Continuation

`LibraryPdfMarkupLayer` now owns the full local continuation step for an
unrecognized drawing: Safari scroll suppression, coalesced-sample expansion,
near-duplicate rejection, live draft updates, and recognition scheduling. It
returns only new normalized points to `WorkspaceApp`, which retains the
annotation-machine transition and persistence.

This checkpoint reduces `src/client/app.ts` from 7,037 to 7,027 lines (-10)
and removes its one-use drawing-append helper. Focused unit coverage passes the
local continuation contract, and the private-PDF browser workflow passes held
mouse drawing, recognition, persistence, rendering, and annotated export.

The browser application artifact changes from 801,290 B raw / 215,903 B gzip
to 801,313 B raw / 215,902 B gzip (+23 B raw / -1 B gzip). Styles and direct and
unique production package counts remain unchanged at 135,411 B raw / 23,373 B
gzip and 18 and 150.

Full native CI passes all 1,415 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Interaction Cleanup

`LibraryPdfMarkupLayer.setInteraction` now treats every inactive interaction as
a recognition-cleanup boundary. Tool changes and pointer cancellation no longer
require coordinator-owned timer or shape cleanup, while the separate composer
reset can still cancel recognition directly before changing other UI state.

This checkpoint reduces `src/client/app.ts` from 7,027 to 7,021 lines (-6) and
removes its shape-recognition cleanup wrapper. Focused unit and private-PDF
browser coverage passes tool changes, cancellation, drawing recognition,
persistence, rendering, and annotated export.

The browser application artifact changes from 801,313 B raw / 215,902 B gzip
to 801,295 B raw / 215,875 B gzip (-18 B raw / -27 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,415 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Note Dragging

`LibraryPdfMarkupLayer` now owns note-drag start coordinates, the movement
threshold, normalized preview geometry, native-default suppression, and the
transient pin update. The PDF annotation machine retains only the active note
and pointer identity, while `WorkspaceApp` retains workflow transitions, final
position persistence, rerendering, and notifications.

This checkpoint reduces `src/client/app.ts` from 7,021 to 7,014 lines (-7) and
the PDF annotation machine from 304 to 289 lines (-15). Focused unit coverage
passes stationary, moved, mismatched-pointer, completion, and cancellation
behavior. The private-PDF browser flow now performs a real note drag and passes
persistence before drawing, recognition, rendering, and annotated export.

The browser application artifact changes from 801,295 B raw / 215,875 B gzip
to 801,417 B raw / 215,992 B gzip (+122 B raw / +117 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,415 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Note Placement

`LibraryPdfMarkupLayer` now owns prospective note-placement start geometry, the
eight-pixel stationary-press threshold, pointer identity, completion, and
cancellation. It reports a normalized point only after a stationary release.
The PDF annotation machine no longer models `pressingNote`, its transient
context, guards, actions, or pointer events; `WorkspaceApp` sends `PLACE_NOTE`
only when the layer completes a valid press.

This checkpoint reduces `src/client/app.ts` from 7,014 to 7,002 lines (-12), the
PDF annotation machine from 289 to 221 lines (-68), and the three runtime files
by 39 lines overall. Focused unit coverage passes stationary, moved,
mismatched-pointer, completion, and cancellation behavior. The private-PDF
browser flow passes note placement, editing, movement, drawing, recognition,
persistence, rendering, and annotated export.

The browser application artifact changes from 801,417 B raw / 215,992 B gzip
to 800,438 B raw / 215,744 B gzip (-979 B raw / -248 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,414 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Complete PDF Drawing Gestures

`LibraryPdfMarkupLayer` now owns the complete transient drawing gesture: active
pointer identity, normalized points, coalesced-sample expansion, duplicate
rejection, reactive draft rendering, recognition timing, snapped geometry,
shape manipulation, cancellation, and completion. It returns final points only
for coordinator-owned persistence. The PDF annotation machine no longer stores
drawing geometry or models drawing and shape-manipulation states, and
`WorkspaceApp` no longer mirrors draft geometry or routes incremental drawing
events.

This checkpoint reduces `src/client/app.ts` from 7,002 to 6,958 lines (-44), the
PDF annotation machine from 221 to 166 lines (-55), and the three runtime files
by 84 lines overall. Focused unit coverage passes active and mismatched pointers,
coalesced samples, duplicate rejection, recognition, adjustment, completion,
and cancellation. The private-PDF browser flow passes a real held-pointer stroke,
recognition, persistence, rendering, and annotated export.

The browser application artifact changes from 800,438 B raw / 215,744 B gzip
to 798,434 B raw / 215,245 B gzip (-2,004 B raw / -499 B gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,412 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Complete PDF Note Dragging

`LibraryPdfMarkupLayer` now owns note identity and pointer identity for the full
drag lifecycle in addition to its existing threshold, preview, completion, and
cancellation behavior. Its completion result gives `WorkspaceApp` everything
needed to toggle a stationary note or persist a moved note. The PDF annotation
machine no longer models `draggingNote`, note-drag context, pointer guards, or
drag lifecycle events, leaving it responsible for tool, selection, and note
composition or editing workflow only.

This checkpoint reduces `src/client/app.ts` from 6,958 to 6,938 lines (-20), the
PDF annotation machine from 166 to 133 lines (-33), and the three runtime files
by 52 lines overall. Focused unit coverage passes stationary and moved previews,
mismatched pointers, completion identity, and cancellation. The private-PDF
browser flow passes note selection, opening, editing, movement, and persistence
before drawing, recognition, rendering, and annotated export.

The browser application artifact changes from 798,434 B raw / 215,245 B gzip
to 797,474 B raw / 214,991 B gzip (-960 B raw / -254 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,412 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Source Completion Interaction

`SourceCompletion` now owns its editor keyboard and delayed-blur lifecycle in
addition to option presentation, selection, and ARIA state. It restores and
persists the browser-local citation suggestion scope and reports scope changes
as typed intents. `WorkspaceApp` retains candidate generation, private-Library
loading and linking, Yjs edits, caret restoration, and menu positioning.

This checkpoint reduces `src/client/app.ts` from 6,938 to 6,926 lines (-12).
The component grows from 119 to 170 lines to contain its reusable binding and
cleanup lifecycle, for 39 additional runtime lines overall. Focused unit
coverage passes persisted scope restoration, scope-change intents, keyboard
acceptance, and delayed dismissal. The include-completion browser flow passes
Enter and Tab acceptance through the bound editor lifecycle.

The browser application artifact changes from 797,474 B raw / 214,991 B gzip
to 798,193 B raw / 215,085 B gzip (+719 B raw / +94 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,413 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Complete PDF Annotation State

`LibraryPdfMarkupLayer` now owns the remaining private-PDF interaction state:
active tool, saved-highlight or markup selection, note composition or editing,
and the open note card. Note-card dismissal and focus restoration are local to
the layer. `WorkspaceApp` retains authorized persistence, refreshes, inspector
policy, and notifications, and the separate PDF annotation XState machine is
deleted.

This checkpoint reduces `src/client/app.ts` from 6,926 to 6,883 lines (-43),
deletes the 133-line annotation machine, and grows the markup layer from 467 to
538 lines (+71), for 105 fewer runtime lines overall. Focused component coverage
passes tool changes, guarded note placement, selection exclusivity, note
composition and editing, card toggling, pointer gestures, and shape recognition.
The private-PDF browser flow passes note placement, editing, movement, drawing,
recognition, persistence, rendering, and annotated export.

The browser application artifact changes from 798,193 B raw / 215,085 B gzip
to 796,823 B raw / 214,550 B gzip (-1,370 B raw / -535 B gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,408 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Starting-Point Catalog State

`ProjectStartingPointBrowser` now owns the fetched template catalog, optimistic
hidden-template IDs, and the derived visible-template view used by both its
starting-point list and the save-template replacement dialog. `WorkspaceApp`
retains validated requests, deferred deletion, durable mutations, project
creation, and import workflows without duplicating the component's array or
set.

This checkpoint reduces `src/client/app.ts` from 6,883 to 6,871 lines (-12)
and grows the starting-point component from 484 to 492 lines (+8), for four
fewer runtime lines overall. Focused component coverage passes hide, restore,
selection normalization, creation, project-source loading, and modal focus.
The browser workflow passes built-in, promoted personal, and existing-project
starting points plus template deletion and replacement.

The browser application artifact changes from 796,823 B raw / 214,550 B gzip
to 797,020 B raw / 214,591 B gzip (+197 B raw / +41 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,408 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: GitHub Preview Identity

`GitHubImportPanel` and `GitHubSyncReview` now own their opaque preview IDs and
confirmation working state. Enabled confirmation intents carry only the current
preview ID, and `WorkspaceSettingsPanel` preserves that detail while forwarding
nested sync-review events. `WorkspaceApp` retains requests, payload validation
and construction, project refresh, and navigation.

This checkpoint reduces `src/client/app.ts` from 6,871 to 6,858 lines (-13).
The import panel grows from 407 to 410 lines, the sync review from 364 to 374,
and the settings panel from 283 to 285, for two additional runtime lines
overall while deleting three duplicated coordinator identity fields. Focused
component coverage passes preview identity, guarded confirmation, and
progress/error/success lifecycle behavior. Four focused browser workflows pass
import, incoming pull, conflict resolution, and publish confirmation.

The browser application artifact changes from 797,020 B raw / 214,591 B gzip
to 796,904 B raw / 214,612 B gzip (-116 B raw / +21 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,410 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Residual Component State

`LibraryPdfUploadStatus` now owns the ephemeral failed-file retry selection and
emits it only from a guarded retry intent. `LibraryToolsMenu` is the canonical
owner of archived-reference visibility, which `WorkspaceApp` reads when loading
the Library. `ProjectExportDialog` retains the latest word-statistics projection
it already synchronizes across the badge and nested statistics panel.

This checkpoint reduces `src/client/app.ts` from 6,858 to 6,848 lines (-10),
grows the upload status from 122 to 125 lines and the tools menu from 86 to 90,
and removes three runtime lines overall. Focused component coverage passes
guarded failed-file retry details and archived-visibility reads. Three browser
workflows pass partial PDF retry, archived duplicate reveal, and live export
statistics.

The browser application artifact changes from 796,904 B raw / 214,612 B gzip
to 797,057 B raw / 214,636 B gzip (+153 B raw / +24 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,410 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Citation Network Snapshots

`CitationNetworkWorkspace` now owns the latest validated network and expansion
presentation snapshots it synchronizes into the nested graph/list panel.
`WorkspaceApp` retains authorized requests, validation, provenance-bearing
mutations, refresh sequencing, prompts, and notifications without caching a
second copy or rebuilding the component payload through a render helper.

This checkpoint reduces `src/client/app.ts` from 6,848 to 6,840 lines (-8) and
grows the citation-network workspace from 120 to 130 lines, for two additional
runtime lines overall while deleting two coordinator fields and one assembly
helper. Focused component coverage passes independent network and expansion
snapshot updates. The browser workflow passes manual assertions, review,
snowball expansion, candidate acceptance, provenance, and accessible graph/list
presentation.

The browser application artifact changes from 797,057 B raw / 214,636 B gzip
to 797,142 B raw / 214,626 B gzip (+85 B raw / -10 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,410 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Toast Action Lifecycle

`AppToast` now owns one-shot action callbacks and a pinned fallback notice in
addition to message rendering, timers, modal reparenting, and popover state.
This keeps an activated application update available after transient notices
without coordinator action or reminder fields. `WorkspaceApp` still supplies
authorized effects and retains deferred-deletion authority, offline persistence,
and notification policy.

This checkpoint reduces `src/client/app.ts` from 6,840 to 6,808 lines (-32) and
grows the toast component from 100 to 118 lines, for 14 fewer runtime lines
overall. Focused component coverage passes one-shot callback execution,
transient dismissal, and pinned-notice restoration. Four browser workflows pass
project deletion, template deletion and replacement, and application-update
retention in both workspace and Library modes.

The browser application artifact changes from 797,142 B raw / 214,626 B gzip
to 797,065 B raw / 214,599 B gzip (-77 B raw / -27 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,411 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Detection Identity

`PdfHighlightImportPanel` now owns the opaque artifact identity associated with
its current detection result and carries that identity with a guarded import
intent. Detection, error, reset, and cancel transitions clear the identity
locally. `WorkspaceApp` retains PDF inspection, duplicate filtering,
active-reader validation, mutation, refresh, and notification policy without a
second identity field.

This checkpoint reduces `src/client/app.ts` from 6,808 to 6,803 lines (-5) and
grows the import panel from 209 to 215 lines, for one additional runtime line
overall. Focused component coverage passes guarded result identity, reviewed
candidate values, cancellation, and stale-import suppression. The private-PDF
browser workflow passes native and flattened detection, reviewed import,
annotation editing, and export.

The browser application artifact changes from 797,065 B raw / 214,599 B gzip
to 797,102 B raw / 214,617 B gzip (+37 B raw / +18 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,411 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Preview Source Map

`PreviewSyncControls` now owns the current composition source map and resolves
both Preview-to-source and source-to-Preview offsets for the directional
intents it presents. `WorkspaceApp` retains active-file and editor-offset
selection, caret placement, scrolling, focus, and Preview document navigation
without caching the map or maintaining a separate offset helper.

This checkpoint reduces `src/client/app.ts` from 6,803 to 6,797 lines (-6) and
grows the synchronization control from 62 to 78 lines, for ten additional
runtime lines overall. Focused component coverage passes source-map updates and
both resolution directions. Two browser workflows pass clicked and centered
Preview-to-source navigation plus explicit and automatic source-to-Preview
synchronization.

The browser application artifact changes from 797,102 B raw / 214,617 B gzip
to 797,274 B raw / 214,638 B gzip (+172 B raw / +21 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,411 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Private Highlight Draft

`LibraryPdfAnnotationForms` now owns the complete private-highlight draft:
page, quotation, comment, captured rectangles, and optional editing identity.
Its typed save intent carries that reviewed draft to `WorkspaceApp`, which
retains active-resource validation, overlap policy, persistence, refreshes, and
notifications without caching geometry or editing state.

This checkpoint reduces `src/client/app.ts` from 6,797 to 6,787 lines (-10) and
grows the annotation forms from 295 to 307 lines, for two additional runtime
lines overall while deleting two coordinator fields. Focused component coverage
passes complete create and edit draft payloads plus composer cancellation. Two
browser workflows pass private-highlight creation, extension, note editing,
erasing, deletion, detected import, and annotated export.

The browser application artifact changes from 797,274 B raw / 214,638 B gzip
to 797,182 B raw / 214,623 B gzip (-92 B raw / -15 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,411 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Browser Shell Registry Deduplication

The browser shell now resolves all required native and Lit elements through one
typed `app-elements` registry. TypeScript infers the complete registry shape
from the constructors checked at startup, so `WorkspaceApp` no longer repeats
the same 86 entries in a manually synchronized interface or owns the lookup
helper. Theme preference lookup joins the same boundary.

This checkpoint reduces `src/client/app.ts` from 6,787 to 6,539 lines (-248).
The extracted 165-line registry replaces 266 removed registry, interface, and
import lines, reducing runtime source by 83 lines overall. Focused coverage
checks all 87 unique element identities through the inferred boundary and the
missing-or-wrong-constructor failure path.

The browser application artifact changes from 797,182 B raw / 214,623 B gzip
to 797,139 B raw / 214,746 B gzip (-43 B raw / +123 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,413 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Model Discovery Lifecycle

`ModelProviderSettings` now owns its browser-local model discovery request,
overlapping-request guard, busy presentation, normalized result selection, and
failure recovery. Its existing typed change stream reports starting and final
status to `WorkspaceApp`, which retains assistant-workflow availability,
browser-local preference persistence, generation requests, and status mirroring
without a second busy field or discovery method.

This checkpoint reduces `src/client/app.ts` from 6,539 to 6,511 lines (-28) and
grows the settings component from 225 to 247 lines, reducing runtime source by
six lines overall. Focused component coverage passes successful, overlapping,
failed, and coordinator-disabled discovery plus preference normalization and
presentation.

The browser application artifact changes from 797,139 B raw / 214,746 B gzip
to 796,767 B raw / 214,985 B gzip (-372 B raw / +239 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,416 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Complete Source-Completion Intent

`SourceCompletion` now emits the selected citation or include candidate together
with its replacement context instead of reporting only a row index. The
component already owns option ordering and keyboard or pointer selection, so
the complete typed intent removes two context fields, two candidate arrays, and
the completion-kind discriminator from `WorkspaceApp`. The coordinator retains
candidate generation, private-Library linking, Yjs mutation, caret restoration,
and menu placement.

This checkpoint reduces `src/client/app.ts` from 6,511 to 6,480 lines (-31) and
grows the completion component from 170 to 182 lines, reducing runtime source
by 19 lines overall. Focused component coverage passes pointer-independent typed
acceptance, keyboard selection, dismissal, scope persistence, and option
presentation.

The browser application artifact changes from 796,767 B raw / 214,985 B gzip
to 796,585 B raw / 214,960 B gzip (-182 B raw / -25 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,416 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Residual Simplification: Library Completion Loading

Library-scoped citation completion now relies on its existing single-flight
loading guard without a second request-generation counter. Because a request
cannot start while that guard is active, the counter could never distinguish
two in-flight loads; failures still clear the guard and remain retryable.

This checkpoint reduces `src/client/app.ts` from 6,480 to 6,477 lines (-3) and
removes one coordinator field. The browser application artifact changes from
796,585 B raw / 214,960 B gzip to 796,515 B raw / 214,918 B gzip (-70 B raw /
-42 B gzip). Styles and direct and unique production package counts remain
unchanged at 135,411 B raw / 23,373 B gzip and 18 and 150.

Full native CI passes all 1,416 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Shared Annotation Composer State

`ProjectAnnotationForm` now owns its active annotation identity, selected paint
or erase tool, and last undoable stroke. Save and undo events carry the complete
typed intent needed by `WorkspaceApp`, which retains PDF geometry, persistence,
manuscript linking, refreshes, and notification policy without duplicating the
form's local lifecycle.

This checkpoint reduces `src/client/app.ts` from 6,477 to 6,466 lines (-11) and
grows the annotation form from 298 to 317 lines, increasing runtime source by
eight lines overall while removing three coordinator fields. Focused component
coverage passes capture and edit identity, save and link intent, tool choice,
complete undo intent, citation, and presentation behavior.

The browser application artifact changes from 796,515 B raw / 214,918 B gzip
to 796,895 B raw / 214,967 B gzip (+380 B raw / +49 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,416 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Complete Project-File Save Intent

`ProjectFileDialog` now retains the stable file or folder target associated with
its active operation and emits that identity with the mode and submitted path.
`WorkspaceApp` no longer caches a duplicate folder target or reconstructs the
mutation target from ambient selection; it continues to own the live Yjs
include continuation and persistence.

This checkpoint reduces `src/client/app.ts` from 6,466 to 6,462 lines (-4) and
grows the project-file dialog from 142 to 144 lines, reducing runtime source by
two lines overall and removing one coordinator field. Focused component
coverage passes operation classification, complete trimmed save intent,
presentation, focus, reuse, and cancellation.

The browser application artifact changes from 796,895 B raw / 214,967 B gzip
to 796,941 B raw / 214,964 B gzip (+46 B raw / -3 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,416 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Complete Assistant Result Context

`AssistantResultPanel` now retains the captured passage, source revision,
evidence, provider continuation, or table target associated with the transient
result it presents. Table insertion, clarity continuation, and revision choice
events carry that complete typed context, so `WorkspaceApp` no longer stores a
parallel result discriminator or context cache. The panel also derives whether
a table replaces a selection from its target instead of storing a second flag.

This checkpoint reduces `src/client/app.ts` from 6,462 to 6,431 lines (-31) and
grows the assistant result panel from 305 to 343 lines, increasing runtime
source by seven lines overall while removing one coordinator field and four
coordinator-only context types. Focused coverage passes empty and guarded
actions, table and clarity presentation, complete table/clarity/revision
intents, transient result adaptation, and reference-save progress.

The browser application artifact changes from 796,941 B raw / 214,964 B gzip
to 796,773 B raw / 214,895 B gzip (-168 B raw / -69 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,416 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Assistant Evidence Selection

`AssistantWorkflowStatus` now owns browser-local annotation and claim selection,
valid-key reconciliation, readonly selection snapshots, and the existing count
or limit status copy associated with **Choose evidence**. `WorkspaceApp` still
resolves selected keys against canonical workspace snapshots and enforces
generation policy, but no longer stores or formats a parallel selection set.

This checkpoint reduces `src/client/app.ts` from 6,431 to 6,422 lines (-9) and
grows the workflow-status component from 90 to 110 lines, increasing runtime
source by eleven lines overall while removing one coordinator field. Focused
coverage passes invalid-key rejection, annotation and claim selection, readonly
selection exposure, reconciliation, deselection, limit status, operation copy,
and typed workflow actions.

The browser application artifact changes from 796,773 B raw / 214,895 B gzip
to 797,222 B raw / 214,811 B gzip (+449 B raw / -84 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,417 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: GitHub Picker Discovery

`GitHubImportPanel` now owns the read-only connection, installation, repository,
and branch discovery sequence that exists solely to populate its local picker.
The component validates existing Valibot-backed response contracts, sorts
repositories, presents loading and failure states, and ignores superseded
connection responses. `WorkspaceApp` retains import preview and creation,
account disconnection, project refresh, and navigation mutations.

This checkpoint reduces `src/client/app.ts` from 6,422 to 6,332 lines (-90) and
grows the GitHub import panel from 410 to 514 lines, increasing runtime source
by fourteen lines overall while removing one coordinator field, two event
bridges, and four coordinator request methods. Focused coverage passes connected
discovery, sorted picker population, disconnected and failed connection states,
superseded response rejection, preview and creation presentation, typed intents,
and native dialog lifecycle.

The browser application artifact changes from 797,222 B raw / 214,811 B gzip
to 797,112 B raw / 214,964 B gzip (-110 B raw / +153 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,420 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests. One PDF zoom scenario timed out once, then passed both in
isolation and in the complete rerun.

## Continued Lit Ownership: GitHub Sync Review Requests

`GitHubSyncReview` now owns the Pull and Publish preview and confirmation
requests, confirmation payloads, response validation, disconnect confirmation,
and success or error presentation that serve only its local review workflow.
It emits one completed-mutation event after a successful external change;
`WorkspaceApp` retains canonical project refresh and the cross-component sync
status refresh. `WorkspaceSettingsPanel` configures the nested review through
its Lit lifecycle instead of forwarding five intermediate intent events.

This checkpoint reduces `src/client/app.ts` from 6,332 to 6,257 lines (-75).
Across the app coordinator, detailed sync review, and settings panel, runtime
source falls from 6,991 to 6,965 lines (-26). Focused coverage passes request
payloads, existing Valibot-backed preview validation, failure presentation,
parent-child configuration timing, and completed mutation events. The four
GitHub browser scenarios also pass after explicitly preserving success feedback
through the subsequent read-only status refresh.

The browser application artifact changes from 797,112 B raw / 214,964 B gzip
to 796,643 B raw / 215,299 B gzip (-469 B raw / +335 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,421 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: GitHub Sync Status Refresh

`GitHubSyncMenu` now owns the bounded read-only project connection and status
requests that feed its primary toolbar presentation, including the refresh
interval, existing Valibot-backed connection validation, status validation,
failure presentation, and stale-request rejection. It emits one typed state
event for the settings mirror. `WorkspaceApp` retains online and active-review
pause policy, explicit refresh triggers, canonical project refresh, and preview
entry points, but no longer owns sync request counters or rendering adapters.

This checkpoint reduces `src/client/app.ts` from 6,257 to 6,219 lines (-38)
and grows the sync menu from 134 to 197 lines. Runtime source across those files
increases by 25 lines while removing two coordinator fields and five
coordinator-only request, validation, and presentation methods. Focused coverage
passes interval gating, connected and disconnected presentation, request
failure, and superseded-response rejection. All four GitHub browser scenarios
also pass.

The browser application artifact changes from 796,643 B raw / 215,299 B gzip
to 797,130 B raw / 215,382 B gzip (+487 B raw / +83 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,424 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Coordinator Reduction: Offline Save Queue

A reusable `DebouncedAsyncQueue` now owns the timer, monotonic version,
serialized promise chain, stale-completion guard, failure recovery, and flush
behavior used by offline workspace persistence. `WorkspaceApp` retains the
domain policy for when a project is eligible for an offline save, the snapshot
write itself, and the resulting editor, dataset, and toast presentation, but no
longer carries three independent scheduling fields or the queue algorithm.

This checkpoint reduces `src/client/app.ts` from 6,219 to 6,210 lines (-9),
grows the shared collaboration coordination module from 99 to 135 lines, and
increases runtime source by 27 lines while isolating a concurrency mechanism
behind one tested boundary. Focused coverage passes debounce replacement,
latest-version completion, serialized recovery after failure, active-work
flush, and pending-work cancellation.

The browser application artifact changes from 797,130 B raw / 215,382 B gzip
to 797,320 B raw / 215,470 B gzip (+190 B raw / +88 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,427 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: LaTeX Import Requests

`LatexImportPanel` now owns both authenticated phases of its local workflow:
bounded archive preview and reviewed project creation. It constructs each
request from the archive, selected root, preview digest, bibliography choice,
and title already held by the component; validates preview and created-workspace
responses through shared Valibot contracts; presents request failures; and
emits only cancel or completed-navigation actions. `WorkspaceApp` retains the
browser navigation authority.

This checkpoint reduces `src/client/app.ts` from 6,210 to 6,150 lines (-60)
and grows the LaTeX import panel from 309 to 340 lines. Including the seven-line
shared result contract, runtime source across those files increases by two
lines while removing four coordinator-only request and adaptation methods.
Focused coverage passes request URLs and archive bodies, reviewed confirmation
parameters, malformed preview and creation responses, local bounds, component
state transitions, and typed completed navigation.

The browser application artifact changes from 797,320 B raw / 215,470 B gzip
to 797,241 B raw / 215,470 B gzip (-79 B raw / unchanged gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,429 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: GitHub Import Mutations

`GitHubImportPanel` now owns the complete picker-local workflow: connection and
repository discovery, import preview, reviewed project creation, and account
disconnection. It constructs request payloads from the installation,
repository, branch, root, entry, preview identity, and title already held by the
component; validates created-workspace responses through a shared Valibot
contract; and presents request progress and failures locally. The application
coordinator receives only cancellation or the completed workspace href and
retains browser navigation.

This checkpoint reduces `src/client/app.ts` from 6,150 to 6,099 lines (-51)
and grows the GitHub import panel from 514 to 560 lines. Including the seven-line
shared result contract, runtime source across those files increases by two
lines while removing three coordinator-only request methods and two event
bridges. Focused coverage passes discovery, stale discovery rejection, import
payloads, reviewed creation, account disconnection and refresh, Valibot result
validation, dialog lifecycle, and typed cancellation and navigation.

The browser application artifact changes from 797,241 B raw / 215,470 B gzip
to 796,925 B raw / 215,353 B gzip (-316 B raw / -117 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,430 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project Starting-Point Requests

`ProjectStartingPointBrowser` now owns template-catalog loading,
existing-project preview loading, and project creation. It constructs creation
requests from the title and selected starting point already held locally,
validates catalog, preview, and created-workspace responses through the existing
domain guards, contains request failures in its status presentation, and emits
only import/cancel actions, template-delete intent, or the completed workspace
href. `WorkspaceApp` retains navigation, its shared deferred-deletion policy,
and template promotion.

This checkpoint reduces `src/client/app.ts` from 6,099 to 6,062 lines (-37)
and grows the starting-point browser from 489 to 535 lines. Runtime source
across those files increases by nine lines while removing two coordinator-only
request methods, the project-creation method, and one event bridge. Focused
coverage passes catalog loading and validation, built-in and existing-project
creation payloads, preview loading, contained request failures, local selection,
template deletion intent, and dialog lifecycle.

The browser application artifact changes from 796,925 B raw / 215,353 B gzip
to 797,264 B raw / 215,343 B gzip (+339 B raw / -10 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,432 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Workspace Sharing Requests

`WorkspaceSharingPanel` now owns collaborator listing and invitation plus the
read-only and edit capability-link status, creation, and revocation lifecycles.
It validates status and created-link responses through shared Valibot contracts,
renders forbidden and failed request states locally, refreshes affected state
after mutations, and emits only user-facing notices. `WorkspaceApp` retains the
global toast presentation used for those notices.

This checkpoint reduces `src/client/app.ts` from 6,062 to 5,964 lines (-98),
grows the sharing panel from 251 to 320 lines, and adds five lines to the shared
Valibot contract module. Runtime source across those files decreases by 24
lines while removing seven coordinator-only request methods and two intent
adapters. Focused coverage passes member and link refresh, owner-only status,
create and revoke requests, invitation payloads and refresh, malformed mutation
containment, Valibot result validation, presentation, and modal lifecycle.

The browser application artifact changes from 797,264 B raw / 215,343 B gzip
to 797,028 B raw / 215,599 B gzip (-236 B raw / +256 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,436 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Library Discovery Search

`LibraryDiscoverySearch` now owns its scholarly-provider request and response
validation together with the query, duplicate-submit guard, progress, result
count, and failure state it already held. It clears and emits validated result
lists through one typed event. `WorkspaceApp` only routes those results to the
sibling presentation component and retains the reference-import path shared
with assistant discovery.

This checkpoint reduces `src/client/app.ts` from 5,964 to 5,949 lines (-15)
and grows the discovery-search component from 129 to 159 lines. Runtime source
across those files increases by 15 lines while removing one coordinator-only
request method and replacing its query adapter with a validated-result bridge.
Focused coverage passes request payloads, duplicate-submit gating, result and
empty states, provider failures, malformed responses, form values, and missing
control errors.

The browser application artifact changes from 797,028 B raw / 215,599 B gzip
to 797,265 B raw / 215,631 B gzip (+237 B raw / +32 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,437 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Workspace Settings Mutations

`WorkspaceSettingsPanel` now owns title, entry-file, and publication-profile
persistence plus archive/restore, duplication, and permanent deletion. It owns
the destructive prompts, request overlap guard, disabled controls, local error
presentation, and duplicate-response validation, and emits only navigation,
catalog-refresh, or save-as-template outcomes. `WorkspaceApp` retains those
cross-feature outcomes and GitHub synchronization.

This checkpoint reduces `src/client/app.ts` from 5,949 to 5,906 lines (-43)
and grows the settings panel from 274 to 372 lines. Runtime source across those
files increases by 55 lines while removing four coordinator-only mutation
methods and narrowing one five-way action adapter to three cross-feature
outcomes. Focused coverage passes settings payloads, navigation targets,
archive refresh, duplication, destructive confirmation, malformed responses,
request failures and overlap, modal reuse, and missing-control errors.

The browser application artifact changes from 797,265 B raw / 215,631 B gzip
to 798,376 B raw / 215,938 B gzip (+1,111 B raw / +307 B gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,438 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Shared Client HTTP Contract

A 24-line client HTTP adapter now owns same-origin JSON request construction,
supported write methods, unsuccessful-response parsing, Valibot validation of
the bounded `{ error: string }` API contract, status-aware fallback errors, and
caught-value message normalization. `WorkspaceApp`, the review-study workflow,
and eight request-owning Lit components now import that contract instead of
maintaining local variants.

This checkpoint reduces `src/client/app.ts` from 5,906 to 5,892 lines (-14)
and removes 132 lines from the ten existing runtime modules. Including the new
24-line shared adapter, runtime source decreases by 108 lines. Focused coverage
passes JSON method, body, header and credential construction, successful
responses, validated API errors, malformed and non-JSON fallbacks, and caught
value normalization; existing request-component suites remain green.

The browser application artifact changes from 798,376 B raw / 215,938 B gzip
to 795,979 B raw / 215,271 B gzip (-2,397 B raw / -667 B gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,442 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Publication Intake Workflow

`PublicationIntakePanel` now owns the complete browser-local DOI workflow: its
XState actor, active-PDF identity, preview and acceptance requests, response
validation, request generations, stale-response rejection, cancellation,
status, busy state, and focus handoff. A successful acceptance remains in the
machine's accepting state until `WorkspaceApp` refreshes the canonical snapshot
and acknowledges the accepted DOI; refresh failure returns the panel to review.
The coordinator retains only that canonical refresh, publication navigation,
and toast presentation.

This checkpoint reduces `src/client/app.ts` from 5,892 to 5,774 lines (-118)
and grows the intake panel from 208 to 294 lines. Runtime source across those
files decreases by 32 lines while removing one coordinator actor and seven
request, stale-response, and presentation methods. Focused coverage passes
preview and acceptance payloads, cancellation, linked presentation, provider
and malformed failures, delayed preview rejection after PDF changes, refresh
acknowledgement, and typed navigation outcomes.

The browser application artifact changes from 795,979 B raw / 215,271 B gzip
to 795,747 B raw / 216,404 B gzip (-232 B raw / +1,133 B gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,445 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project Template Promotion

`ProjectTemplateSaveDialog` now owns create-or-replace promotion requests,
saved-summary validation, duplicate-submit gating, progress, local request and
response errors, disabled controls, modal completion, and a typed validated
result. `WorkspaceApp` retains only the shared template-catalog refresh and
cross-feature toast after a successful save.

This checkpoint reduces `src/client/app.ts` from 5,774 to 5,764 lines (-10)
and grows the save dialog from 183 to 223 lines. Runtime source across those
files increases by 30 lines while removing the remaining raw save intent and
coordinator-only promotion method. Focused coverage passes create and replace
payloads and outcomes, request errors, malformed successful responses, loading,
focus, cancellation, replacement values, and missing-control errors.

The browser application artifact changes from 795,747 B raw / 216,404 B gzip
to 796,405 B raw / 216,512 B gzip (+658 B raw / +108 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,447 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project History Workflow

`ProjectHistoryDialog` now owns the browser-local XState actor, timeline,
inspect, compare, milestone, restore, and branch requests, response validation,
confirmations, request generations, stale-response rejection, busy and error
state, and modal lifecycle. It emits only typed notice, navigation, reload, and
close outcomes. `WorkspaceApp` retains toast and browser-navigation policy.

This checkpoint reduces `src/client/app.ts` from 5,764 to 5,601 lines (-163)
and grows the history dialog from 80 to 221 lines. Runtime source across those
files decreases by 22 lines while removing one coordinator actor and eleven
request, operation, availability, and failure methods. Focused coverage passes
timeline loading, inspect and compare projections, milestone payload and
refresh, restore and branch outcomes, provider and malformed failures, modal
lifecycle, and missing server-rendered children.

The browser application artifact changes from 796,405 B raw / 216,512 B gzip
to 796,874 B raw / 216,369 B gzip (+469 B raw / -143 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,449 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Metadata Refinement Workflow

`LibraryReferenceMetadataEditor` now owns its browser-local XState actor,
bounded PDF extraction, provider preview and acceptance requests, response
validation, request supersession, busy and retryable error state, PDF metadata
acceptance, and validated refresh or notice outcomes. `WorkspaceApp` retains
manual metadata persistence, canonical Library/project refresh, and toast
policy.

This checkpoint reduces `src/client/app.ts` from 5,601 to 5,497 lines (-104)
and grows the metadata editor from 437 to 548 lines. Runtime source across
those files increases by 7 lines while removing one coordinator actor and five
request, payload, apply, and failure methods. Focused coverage passes local
extraction and preview payloads, cache presentation, provider and malformed
fallback, PDF and mixed-provider acceptance payloads, retry after fingerprint
failure, and delayed extraction rejection after the editor switches sources.

The browser application artifact changes from 796,874 B raw / 216,369 B gzip
to 797,869 B raw / 216,598 B gzip (+995 B raw / +229 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,454 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Web Source Requests

`WebSourceCapture` now owns URL capture requests, duplicate-submit gating,
progress, local failures, reset, and a typed captured outcome shared by the
top-level form and per-source recapture actions. `WebSnapshotComparisonPanel`
owns comparison requests, Valibot-backed response validation, progress,
failures, and neutral diff presentation. `WorkspaceApp` retains canonical
Library refresh and toast policy.

This checkpoint reduces `src/client/app.ts` from 5,497 to 5,484 lines (-13)
and grows the two-panel module from 129 to 183 lines. Runtime source across
those files increases by 41 lines while removing four coordinator capture and
comparison methods or adapters. Focused coverage passes capture payloads,
duplicate submission, provider errors, identical and changed comparisons,
malformed comparison responses, and both light-DOM boundaries.

The browser application artifact changes from 797,869 B raw / 216,598 B gzip
to 798,749 B raw / 216,769 B gzip (+880 B raw / +171 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,456 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Citation Network Workflow

`CitationNetworkWorkspace` now owns network loading and project filtering,
request generations, response guards, manual assertion and review mutations,
Crossref expansion, candidate acceptance, prompts, local progress and retryable
failures, and typed notice or Library-refresh outcomes. `WorkspaceApp` retains
only canonical Library refresh and toast policy.

This checkpoint reduces `src/client/app.ts` from 5,484 to 5,399 lines (-85)
and grows the workspace from 130 to 268 lines. Runtime source across those
files increases by 53 lines while removing six coordinator request and mutation
methods plus two event adapters. Focused coverage passes load and project-filter
URLs, stale-response rejection, assertion and review payloads, expansion,
candidate acceptance, invalid selections, malformed representations, provider
errors, visibility, and nested panel synchronization.

The browser application artifact changes from 798,749 B raw / 216,769 B gzip
to 799,986 B raw / 217,066 B gzip (+1,237 B raw / +297 B gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,459 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Personal Library Mutations

`LibraryReferencePersonalFields` now owns tag, collection, reading-state,
private-note, and archive requests; comma-separated payload normalization;
archive confirmation; duplicate-submit gating; local progress and retryable
failures; and one typed successful-refresh outcome. `WorkspaceApp` retains only
canonical Library refresh and toast policy.

This checkpoint reduces `src/client/app.ts` from 5,399 to 5,339 lines (-60)
and grows the personal-fields component from 174 to 268 lines. Runtime source
across those files increases by 34 lines while removing five coordinator
mutation methods and the five-way action adapter. Focused coverage passes all
five request payloads, success outcomes, archive cancellation, empty notes,
provider failures, and duplicate submissions.

The browser application artifact changes from 799,986 B raw / 217,066 B gzip
to 800,138 B raw / 217,105 B gzip (+152 B raw / +39 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,461 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Manual Metadata Persistence

`LibraryReferenceMetadataEditor` now also owns manual bibliographic PATCH
payloads, duplicate-submit gating, and retryable failures. Its existing typed
refresh and notice outcomes cover both manual and reviewed metadata operations;
`WorkspaceApp` no longer brokers a separate manual-save intent.

This checkpoint reduces `src/client/app.ts` from 5,339 to 5,309 lines (-30)
and grows the metadata editor from 548 to 562 lines. Runtime source across
those files decreases by 16 lines while removing the final metadata request
method and action adapter from the coordinator. Focused coverage passes the
normalized manual payload, successful refresh, provider failure, and duplicate
submission behavior alongside the existing refinement workflow.

The browser application artifact changes from 800,138 B raw / 217,105 B gzip
to 800,036 B raw / 217,149 B gzip (-102 B raw / +44 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,462 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Rights Persistence

`LibraryReferencePdfRows` now owns rights PUT requests, value validation,
duplicate-submit gating, local progress and retryable failures, and a typed
successful-refresh outcome. `WorkspaceApp` retains PDF opening, cross-component
metadata refinement, and canonical Library refresh policy.

This checkpoint reduces `src/client/app.ts` from 5,309 to 5,308 lines (-1)
and grows the PDF rows from 95 to 119 lines. Runtime source across those files
increases by 23 lines; the small line-count result reflects replacing the
request method with an explicit canonical-refresh listener. Focused coverage
passes the rights payload, invalid value, success, provider failure, duplicate
submission, opening, and secondary-PDF refinement behavior.

The browser application artifact changes from 800,036 B raw / 217,149 B gzip
to 800,470 B raw / 217,180 B gzip (+434 B raw / +31 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,463 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: PDF Batch Intake

`LibraryPdfUploadControl` now binds its spatially separate status component and
owns ordered batch execution, upload transport, response validation,
partial-failure projection, retries, duplicate-submit gating, and
refresh-pending state. It emits typed notice or refresh outcomes;
`WorkspaceApp` retains only canonical Library refresh, refresh acknowledgment,
duplicate-source navigation, and toast policy.

This checkpoint reduces `src/client/app.ts` from 5,308 to 5,246 lines (-62)
and grows the upload control from 120 to 199 lines. Runtime source across those
files increases by 17 lines while removing the coordinator message helper,
three upload lifecycle methods, transport/validation method, and retry/action
adapters. Focused coverage passes created and existing payloads, malformed
responses, all-failed batches, status-triggered retries, stale refresh
acknowledgment, duplicate submissions, and refresh-pending gating.

The browser application artifact changes from 800,470 B raw / 217,180 B gzip
to 800,799 B raw / 217,499 B gzip (+329 B raw / +319 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,465 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Reference File Imports

The new `LibraryReferenceImportControl` progressively enhances the existing
BibTeX and CSL JSON inputs and owns file selection and reset, file reads, both
import transports, duplicate-submit gating, local busy and retryable failure
state, and refresh-pending acknowledgment. `WorkspaceApp` retains canonical
Library refresh and toast policy.

This checkpoint reduces `src/client/app.ts` from 5,246 to 5,234 lines (-12),
replaces two raw application element references with one component, and adds a
124-line component. Runtime source across the shell and new component increases
by 112 lines; most of that fixed cost is the accessible light-DOM fallback
template and direct transport coverage. Focused coverage passes both request
formats and success messages, refresh-pending gating, stale acknowledgment,
provider failure, and concurrent-import rejection.

The browser application artifact changes from 800,799 B raw / 217,499 B gzip
to 802,484 B raw / 217,790 B gzip (+1,685 B raw / +291 B gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,468 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Archive Restore and Refresh Policy

`LibraryToolsMenu` now owns portable-archive restore transport,
duplicate-submit gating, local busy and retryable failure state, and
refresh-pending acknowledgment. `WorkspaceApp` also consolidates the repeated
canonical Library refresh, success/fallback toast, optional component
acknowledgment, and alternate bibliographic-refresh policy used by PDF intake,
reference-file imports, archive restore, web capture, personal fields, metadata
refinement, and citation candidates.

This checkpoint reduces `src/client/app.ts` from 5,234 to 5,207 lines (-27)
and grows the tools menu from 90 to 145 lines. Runtime source across those files
increases by 28 lines while removing archive transport plus six duplicated
refresh-completion methods or branches. Focused coverage passes archive request
headers and body, successful acknowledgment, stale acknowledgment,
duplicate-submit gating, provider failure, and all existing refresh-producing
component outcomes.

The browser application artifact changes from 802,484 B raw / 217,790 B gzip
to 803,246 B raw / 217,909 B gzip (+762 B raw / +119 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,470 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Legacy PDF Identification

`UnidentifiedPdfList` now owns the legacy artifact-to-reference identification
transport, duplicate-submit gating, local progress and retryable failure state,
and refresh-pending acknowledgment in addition to its existing selection and
presentation responsibilities. `WorkspaceApp` retains only canonical Library
refresh and toast policy.

This checkpoint reduces `src/client/app.ts` from 5,207 to 5,201 lines (-6) and
grows the identification queue from 117 to 144 lines. Runtime source across
those files increases by 21 lines while replacing a coordinator mutation with
explicit local failure and refresh-pending behavior. Focused coverage passes
the request payload, successful refresh outcome, stale acknowledgment,
selection cleanup, retryable provider failure, and missing-selection guard.

The browser application artifact changes from 803,246 B raw / 217,909 B gzip
to 803,860 B raw / 218,031 B gzip (+614 B raw / +122 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,471 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Discovery Result Persistence

`LibraryDiscoveryResults` now owns discovered-metadata CSL projection, import
transport, per-result duplicate-submit gating, local save progress and
retryable failure state, stale-response rejection, and refresh-pending
acknowledgment. Shared CSL projection and identifier verification URLs moved
to the reference-discovery domain so the Library and assistant surfaces no
longer depend on one UI component for another component's rules.
`WorkspaceApp` retains the assistant-result import workflow plus canonical
Library refresh and toast policy.

This checkpoint reduces `src/client/app.ts` from 5,201 to 5,174 lines (-27),
reduces the assistant result panel from 343 to 335 lines, grows the Library
results panel from 105 to 141 lines, and grows the shared discovery domain from
203 to 228 lines. Runtime source across those files increases by 26 lines while
removing a cross-component dependency and the Library-specific coordinator
mutation. Focused coverage passes CSL payload projection, all verification URL
schemes, successful and failed imports, duplicate submission, stale refresh
acknowledgment, and replaced-result response rejection.

The browser application artifact changes from 803,860 B raw / 218,031 B gzip
to 804,525 B raw / 218,170 B gzip (+665 B raw / +139 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,475 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Assistant Reference Persistence

`AssistantResultPanel` now owns discovered-reference import requests,
per-result duplicate-submit gating, local save progress and retryable failures,
stale-response rejection, and refresh-pending acknowledgment. Both assistant
and Library discovery cards use a new 12-line `importDiscoveredReference`
adapter for the shared CSL JSON endpoint instead of maintaining parallel
request protocols. `WorkspaceApp` retains canonical Library refresh and the
assistant workflow-status projection.

This checkpoint reduces `src/client/app.ts` from 5,174 to 5,164 lines (-10),
grows the assistant result panel from 335 to 383 lines, reduces the Library
discovery results panel from 141 to 136 lines, and adds the 12-line shared
adapter. Runtime source across those files increases by 45 lines while removing
the coordinator import lifecycle and duplicate transport implementations.
Focused coverage passes the CSL payload, successful refresh outcome,
duplicate submission, stale acknowledgment, retryable provider failure, and
cleared-result response rejection.

The browser application artifact changes from 804,525 B raw / 218,170 B gzip
to 805,267 B raw / 218,149 B gzip (+742 B raw / -21 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,478 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Project File Operations

`ProjectFileDialog` now owns file and folder mutation transport, endpoint
derivation from its stable target, response validation, duplicate-submit
gating, local busy and retryable failure state, modal completion, and operation
messages. It emits the completed mode, path, message, and validated workspace
snapshot. `WorkspaceApp` retains resource availability, collaborative include-
caret capture and Yjs insertion, snapshot application, selection, rendering,
and toast policy.

This checkpoint reduces `src/client/app.ts` from 5,164 to 5,141 lines (-23)
and grows the project-file dialog from 144 to 190 lines. Runtime source across
those files increases by 23 lines while removing the coordinator message
projection, request construction helper, response parsing, and dialog-close
lifecycle. Focused coverage passes create and rename endpoints, trimmed payloads,
stable encoded targets, validated snapshot outcomes, missing-target rejection,
provider failures, and retries.

The browser application artifact changes from 805,267 B raw / 218,149 B gzip
to 805,757 B raw / 218,496 B gzip (+490 B raw / +347 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,480 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Workspace Layout Selection

The new `WorkspaceLayoutControl` progressively enhances the server-rendered
project-view selector and owns its four-option template, normalized selected
value, workspace-scoped local persistence, storage-failure tolerance, and typed
change outcome. `WorkspaceApp` retains surface mutation, PDF activation, resize
notification, and URL synchronization.

This checkpoint reduces `src/client/app.ts` from 5,141 to 5,137 lines (-4),
replaces one raw select registry entry with the typed component, and adds a
110-line component. Runtime source across the app, component registry, view
fallback, and component increases by 107 lines; this is the fixed cost of
moving the complete responsive selector template and resilient storage contract
behind a typed owner. Focused coverage passes normalization, workspace-scoped
persistence, unavailable storage, typed changes, both server fallbacks, and the
required-element registry.

The browser application artifact changes from 805,757 B raw / 218,496 B gzip
to 807,357 B raw / 218,919 B gzip (+1,600 B raw / +423 B gzip). Styles and
direct and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,483 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests, including workspace layout switching and reload
restoration.

## Continued Lit Ownership: Claim Persistence

`ClaimDialog` now owns create and edit transport, stable encoded claim targets,
request validation, evidence preconditions, duplicate-submit gating, local busy
and retryable failure state, modal completion, and the successful-save outcome.
`WorkspaceApp` retains claim-list refresh and workspace-level toast policy.

This checkpoint reduces `src/client/app.ts` from 5,137 to 5,125 lines (-12)
and grows the claim dialog from 196 to 220 lines. Runtime source across those
files increases by 12 lines while removing the coordinator save method and its
request-payload projection. Focused coverage passes create and edit requests,
encoded identities, missing evidence, retryable provider failures, successful
completion, and duplicate submissions.

The browser application artifact changes from 807,357 B raw / 218,919 B gzip
to 807,832 B raw / 219,045 B gzip (+475 B raw / +126 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,486 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Comment Resolution

`ManuscriptCommentList` now owns self-contained resolution transport, stable
encoded comment targets, request validation, duplicate-submit gating, pending
and retryable failure state, and the typed completed-resolution outcome on its
existing action channel. `WorkspaceApp` retains selection-dependent comment
creation and re-anchoring, project-resource refresh, toast policy, and passage
navigation.

This checkpoint reduces `src/client/app.ts` from 5,125 to 5,120 lines (-5) and
grows the manuscript comment list from 147 to 177 lines. Runtime source across
those files increases by 25 lines while removing the coordinator resolution
method. Focused coverage passes stable encoded targets, successful completion,
provider failure and retry, and duplicate resolution submissions.

The browser application artifact changes from 807,832 B raw / 219,045 B gzip
to 808,450 B raw / 219,265 B gzip (+618 B raw / +220 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,489 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.

## Continued Lit Ownership: Claim Deletion

`ClaimListPanel` now owns confirmation, deletion transport, stable encoded
claim targets, request validation, duplicate-submit gating, pending and
retryable failure state, and the typed completed-deletion outcome on its
existing action channel. `WorkspaceApp` retains canonical project-resource
refresh, toast policy, evidence selection, and editor-dependent claim links.

This checkpoint reduces `src/client/app.ts` from 5,120 to 5,117 lines (-3) and
grows the claim list from 210 to 245 lines. Runtime source across those files
increases by 32 lines while removing the coordinator deletion method. Focused
coverage passes cancellation, stable encoded targets, successful completion,
provider failure and retry, and duplicate deletion submissions.

The browser application artifact changes from 808,450 B raw / 219,265 B gzip
to 809,178 B raw / 219,449 B gzip (+728 B raw / +184 B gzip). Styles and direct
and unique production package counts remain unchanged at 135,411 B raw /
23,373 B gzip and 18 and 150.

Full native CI passes all 1,492 unit/coverage tests, 120 Workers-runtime tests,
and 74 browser tests.
